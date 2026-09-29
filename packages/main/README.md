# @produck/readable-stream-distributor

> One source stream, many independent copies.

`@produck/readable-stream-distributor` hands one WHATWG `ReadableStream`
to any number of independent readers. Every copy reads the whole stream
from the first byte to the end, at its own pace, without stealing bytes
from the others.

The package is a framework, not a finished medium. You subclass three
abstract classes — `Distributor`, `DegradedChunkReader`, `Transferrer` —
and the framework does the rest: fan-out, bookkeeping of positions,
backpressure, retries and reporting.

On Node, one medium is already written:
`@produck/readable-stream-distributor-degraded-node-file` — see
[File medium](#file-medium).

- [How it works](#how-it-works)
- [Install](#install)
- [Quick start](#quick-start)
- [File medium](#file-medium)
- [Examples](#examples)
- [Distributor](#distributor)
- [Options](#options)
- [Events](#events)
- [Warnings](#warnings)
- [The medium](#the-medium)
  - [Transferrer](#transferrer)
  - [DegradedChunkReader](#degradedchunkreader)
- [Symbols](#symbols)

## How it works

A distributor lives in two phases.

**In memory.** The distributor pulls the source on demand and keeps the
captured bytes in a stash. Every fork is answered from that stash, so
copies never compete for a byte and never block each other. The stash
holds everything from the first byte — nothing is trimmed — which is what
`MaxStashByteLength` is for.

**Degraded.** When the stash grows past `MaxStashByteLength`, the
distributor switches to your medium in the same tick: it builds your
`Transferrer`, hands it the whole stash (`DUMP`), and gives every live
copy a `DegradedChunkReader` seeded with that copy's own position. From
then on, fresh bytes go from the source straight to the transferrer
(`WRITE`), which drains them to the medium in the background.

A copy in the degraded phase is served from three places, in this order:
the queue the transferrer has not written yet, then the medium, which it
reads back through your reader. Its position is private to it, and the
framework catches the medium's cursor up before each read back.

A source that ends while still under the limit never degrades — unless
`DegradeOnStashFullAndDone` asks for it.

## Install

```sh
npm install @produck/readable-stream-distributor
```

Requires Node.js 22 or later, for `Promise.withResolvers` and the WHATWG
globals the framework stands on.

## Quick start

A distributor is a subclass of `Distributor`, and the family it forks
into is named by one static slot. The smallest useful medium is memory.

```js
import {
  Distributor,
  DegradedChunkReader,
  SYMBOL,
  Transferrer,
} from '@produck/readable-stream-distributor';

const { DEGRADED_CHUNK_READER_CTOR } = SYMBOL.DISTRIBUTOR._S;
const { _I: READER, _S: READER_S } = SYMBOL.DEGRADED_CHUNK_READER;
const { _I: TRANSFERRER } = SYMBOL.TRANSFERRER;

class MemoryTransferrer extends Transferrer {
  records = [];

  [TRANSFERRER.DUMP](stash) {
    this.records = [...stash.chunks()];
  }

  [TRANSFERRER.WRITE](chunk) {
    this.records.push(chunk);
  }

  [TRANSFERRER.DROP]() {
    this.records = [];
  }

  get medium() {
    return this.records;
  }
}

class MemoryReader extends DegradedChunkReader {
  static [READER_S.TRANSFERRER_CTOR] = MemoryTransferrer;

  cursor = 0;

  [READER.INITIALIZE]() {}

  [READER.SEEK]() {
    if (this.cursor >= this.transferrer.medium.length) {
      return false;
    }

    this.cursor++;

    return true;
  }

  [READER.READ]() {
    const medium = this.transferrer.medium;

    if (this.cursor >= medium.length) {
      return { done: true, value: undefined };
    }

    return { done: false, value: medium[this.cursor++] };
  }

  [READER.CLOSE]() {}
}

class MemoryDistributor extends Distributor {
  static [DEGRADED_CHUNK_READER_CTOR] = MemoryReader;
}
```

And then, from the consumer's side:

```js
import { MemoryDistributor } from './my-medium.mjs';

const source = new ReadableStream({
  start(controller) {
    controller.enqueue(Buffer.from('hello '));
    controller.enqueue(Buffer.from('world'));
    controller.close();
  },
});

const distributor = new MemoryDistributor(source);

const one = distributor.fork().getReader();
const two = distributor.fork().getReader();

const first = await one.read();
const second = await two.read();

console.log(first.value.toString()); // 'hello '
console.log(second.value.toString()); // 'hello '
```

Each `fork()` is an ordinary WHATWG `ReadableStream` of its own position.
Use `getReader()`, `pipeTo()`, `for await`, or hand it to any API that
takes a stream.

## File medium

On Node, writing a medium of your own is optional:
`@produck/readable-stream-distributor-degraded-node-file` is that medium
for the file system — framed records in a file the host names, read back
by position, on bare `node:fs`, with no dependency beyond this framework
and `@produck/type-error`.

```sh
npm install @produck/readable-stream-distributor-degraded-node-file
```

The host wires it with one class. Its reader names its own write side
through the static slot, so a distributor subclass is the whole of it:

```js
import * as Core from '@produck/readable-stream-distributor';
import { FileChunkReader } from '@produck/readable-stream-distributor-degraded-node-file';

const { Distributor, Options, SYMBOL } = Core;
const { DEGRADED_CHUNK_READER_CTOR } = SYMBOL.DISTRIBUTOR._S;

class UploadDistributor extends Distributor {
  static get [DEGRADED_CHUNK_READER_CTOR]() {
    return FileChunkReader;
  }
}

const distributor = new UploadDistributor(source);

distributor.setTransferrerArgs('/var/tmp/upload.spool');
Options.Tune.MaxStashByteLength(distributor, 64 * 1024 * 1024);
```

- The pathname must be absolute, and it is the medium's only argument.
- Nothing is written until the stash crosses `MaxStashByteLength`.
- `destroy()` releases the medium: the handle is closed and the file the
  medium created is removed.
- Its own manual covers the record format and the two classes.

A file is not the answer for every host: [The medium](#the-medium) below
is the contract any other one has to honour.

## Examples

More scenarios live one per file under [`test/Example`](test/Example/),
each of them a runnable test: the quick start above, and an HTTP upload
that spools to a file while the digest is computed.

## Distributor

Abstract. Extends `EventTarget`.

### `constructor(source)`

`source` must be a WHATWG `ReadableStream` of the same realm, unlocked.

- Throws `TypeError` when `source` is not a stream of this realm.
- Throws `Error` when `source` is already locked.

A stream shared from another realm by `postMessage` transfer arrives as a
stream of this realm, so it needs no adapting. An object another realm
built and handed over by reference is not: wrap it in a local stream
first.

A locked source is a programming mistake, not a recoverable state: the
distributor needs the only reader.

### `fork()`

Answers a `ReadableStream` with its own position. Bytes already consumed
by other copies are still delivered to it — a fork always sees the whole
source.

- The high water mark comes from `ForkHighWaterMark`, read once for this
  fork, so live copies keep the value they were forked with.
- Before the degrade, the copy reads the stash; after it, the framework
  switches the copy to a degraded reader seeded with its position.
- Forking after a degrade gives a degraded copy from birth.
- Cancelling or erroring one copy never touches the others.
- If the source fails, every copy's `read()` rejects with the source's own
  error object, unwrapped, and `source-read-failed` is reported.
- Throws `Error` once the distributor is terminated.

### `degraded`

`true` from the moment the transferrer took over. There is no separate
phase flag: the existence of the transferrer is the phase.

### `terminated`

`true` after `terminate()`. It is a gate for new work, not a sweep:
`fork()` is refused, live copies keep reading the source to its end.

### `destroy()`

`Promise<void>`. Idempotent — every call answers the first promise.

It terminates the distributor, cancels the source, errors every live copy
with an `AbortError` `DOMException`, and releases the medium (`DROP`).
Call it when you are done with the distributor; a copy that reads after
it sees the `AbortError`.

### `terminate()`

Idempotent and synchronous. Dispatches `terminate`. Nothing else stops:
live copies keep going, and the medium stays in service until
`destroy()`.

### `setTransferrerArgs(...args)`

One shot. The args are parsed once, by your transferrer's
`PARSE_ARGUMENTS` static, and consumed when the transferrer is built at
degrade time.

```js
// SYMBOL and TRANSFERRER come from the destructuring in Quick start.
class FileTransferrer extends Transferrer {
  static [TRANSFERRER._S.PARSE_ARGUMENTS](args) {
    const [path] = args;

    return [path];
  }

  constructor(path) {
    super();
    this.path = path;
  }
}

distributor.setTransferrerArgs('/tmp/spool.bin');
```

Calling it after the degrade throws: the args have been consumed.

### `options`

A snapshot of every option, resolved at read time. See
[Options](#options).

### `getWarningCount(code)`

The number of times `code` has been reported, in the same vocabulary as
`WarnCode`.

The count is recorded before the event is dispatched, so a listener that
reads it inside the `warn` dispatch sees the report it is being told
about included. A code that has never been reported answers `0`.

Throws `TypeError` when `code` is outside the warning vocabulary.

### Static slot

```js
class MyDistributor extends Distributor {
  static [SYMBOL.DISTRIBUTOR._S.DEGRADED_CHUNK_READER_CTOR] = MyReader;
}
```

Required. It names the reader family this distributor forks into and
degrades into. A subclass that leaves it empty fails at `fork()` with
`must be implemented in the subclass`.

## Options

Every option is read at a defined moment, so a distributor can change
behaviour while it runs.

| Option                        | Default       | Read                   |
| ----------------------------- | ------------- | ---------------------- |
| `MaxStashByteLength`          | 1 GiB         | on every pull          |
| `MaxBacklogWarningByteLength` | same as above | after every write      |
| `DegradeOnStashFullAndDone`   | `false`       | on every pull          |
| `ForkHighWaterMark`           | `1`           | once per fork          |
| `MaxInitializeRetryCount`     | `Infinity`    | per initialize attempt |
| `InitializeRetryInterval`     | `1000` ms     | per initialize attempt |
| `MaxDumpRetryCount`           | `Infinity`    | per dump attempt       |
| `DumpRetryInterval`           | `1000` ms     | per dump attempt       |
| `MaxDrainRetryCount`          | `Infinity`    | per drained chunk      |
| `DrainRetryInterval`          | `1000` ms     | per drained chunk      |

What they mean:

- `MaxStashByteLength` — how much the captured stash may hold before a
  pull degrades into the medium.
- `MaxBacklogWarningByteLength` — the queued bytes that make the
  transferrer report `transferrer-backlog`.
- `DegradeOnStashFullAndDone` — whether a stash that is both over the
  limit and complete still degrades. Left `false`, a source that ends
  under the limit stays in memory.
- `ForkHighWaterMark` — the high water mark of every copy forked from now
  on. A live copy keeps the value it was forked with.
- `MaxInitializeRetryCount` and `InitializeRetryInterval` — the budget
  and the pause of one `INITIALIZE`.
- `MaxDumpRetryCount` and `DumpRetryInterval` — the budget and the pause
  of one `DUMP`.
- `MaxDrainRetryCount` and `DrainRetryInterval` — the budget and the pause
  of one `WRITE`.

Three ways to reach them.

### `Options.Tune.<name>(distributor, value)`

Sets one option. `value` is either a value or a getter
`(options) => value`, read at every use — so one option can follow
another. The default of `MaxBacklogWarningByteLength` is exactly that:

```js
Options.Tune.MaxStashByteLength(distributor, 64 * 1024 * 1024);

Options.Tune.MaxBacklogWarningByteLength(distributor, (options) => {
  return options.MaxStashByteLength(options) / 2;
});

Options.Tune.MaxDrainRetryCount(distributor, (options) => {
  return options.MaxDumpRetryCount(options);
});
```

The value is validated when it is installed, by reading the getter once.
An invalid value throws.

### `Options.Get.<name>(distributor)`

Reads one option now.

```js
const limit = Options.Get.MaxStashByteLength(distributor);
```

### `Options.Asset.<name>(distributor)`

Presets over the three retry budgets.

| Preset                     | Effect                     |
| -------------------------- | -------------------------- |
| `noInitializeRetry`        | zero the initialize budget |
| `noDumpRetry`              | zero the dump budget       |
| `noDrainRetry`             | zero the drain budget      |
| `unlimitedInitializeRetry` | open the initialize budget |
| `unlimitedDumpRetry`       | open the dump budget       |
| `unlimitedDrainRetry`      | open the drain budget      |
| `noRetry`                  | zero all three             |
| `unlimitedRetry`           | open all three             |

```js
Options.Asset.noRetry(distributor); // fail fast, report once
```

### `distributor.options`

A snapshot: every option resolved at the moment of the read.

## Events

The distributor is an `EventTarget`. Every event class is exported under
`Event` and carries its data in `detail`.

| Type        | Class             | `detail`            |
| ----------- | ----------------- | ------------------- |
| `fork`      | `Event.Fork`      | `{ forked }`        |
| `degrade`   | `Event.Degrade`   | `{ byteLength }`    |
| `terminate` | `Event.Terminate` | `undefined`         |
| `warn`      | `Event.Warn`      | `{ code, payload }` |

```js
distributor.addEventListener('degrade', (event) => {
  console.log(event.detail.byteLength);
});

distributor.addEventListener('warn', (event) => {
  const { code, payload } = event.detail;

  if (code === 'transferrer-backlog') {
    console.warn('queued', payload.pendingByteLength);
  }
});
```

`Event.Warn` keeps `code` and `payload` correlated: narrowing one narrows
the other.

## Warnings

A warning is a report, not an exception. Nothing is swallowed on your
behalf: the host's own exceptions always travel as they are — the same
object a copy's `read()` rejects with, unwrapped.

From the write side:

| Code                       | Fired by | Payload                 |
| -------------------------- | -------- | ----------------------- |
| `transferrer-dump-failed`  | `DUMP`   | `{ retry, cause }`      |
| `transferrer-write-failed` | `WRITE`  | `{ retry, cause }`      |
| `transferrer-backlog`      | `WRITE`  | `{ pendingByteLength }` |
| `transferrer-drop-failed`  | `DROP`   | `{ cause }`             |

From the read side:

| Code                                | Fired by     | Payload            |
| ----------------------------------- | ------------ | ------------------ |
| `degraded-reader-initialize-failed` | `INITIALIZE` | `{ retry, cause }` |
| `degraded-reader-seek-failed`       | `SEEK`       | `{ cause }`        |
| `degraded-reader-read-failed`       | `READ`       | `{ cause }`        |
| `degraded-reader-close-failed`      | `CLOSE`      | `{ cause }`        |

From the source:

| Code                   | Fired by   | Payload     |
| ---------------------- | ---------- | ----------- |
| `source-read-failed`   | `read()`   | `{ cause }` |
| `source-cancel-failed` | `cancel()` | `{ cause }` |

`retry` starts at `0` and every report is an independent snapshot.

Repeats are not de-bounced: one cause can produce a report per copy, or
one per attempt while a budget lasts. Rate-limiting is the host's call.

## The medium

The medium is yours. It only has to honour the two contracts below: what
a failure means, and what a position is. For Node, a working one is
recommended in [File medium](#file-medium).

**A failure means the attempt did not happen.** When one of the members
below throws or rejects, the framework takes it as "no byte landed, the
cursor did not move". The retries of the dump and the drain stand on that
promise. A medium that writes half a record and then throws breaks the
contract, and the framework cannot detect it. If you can prove an
operation is position-independent, catch the failure inside your own
member and retry there.

### Transferrer

Abstract. The write side: take the stash, write one chunk, let the
medium go. Its getters are the framework's own bookkeeping; the members
are your business.

#### `static [SYMBOL.TRANSFERRER._S.PARSE_ARGUMENTS](args)`

Reads what the host passed to `setTransferrerArgs()`, before the
transferrer is built. The default returns `args` unchanged. An exception
thrown here reaches the host as it is.

#### `[SYMBOL.TRANSFERRER._I.DUMP](stash)`

Hand the whole stash to the medium. `stash.done` tells you whether the
source reached its end, `stash.length` and `stash.byteLength` what is
worth writing, `stash.get(i)` and `stash.chunks()` how to reach the
bytes. `chunks()` is a copy: an iteration never sees a later push.

A rejection is retried per `MaxDumpRetryCount` / `DumpRetryInterval`, and
each attempt is reported. When the budget runs out, the failure is
latched: the queued prefix is still served to the copies, but every later
write and every position wait throws that same error — a tail cut, not a
whole-stream failure.

#### `[SYMBOL.TRANSFERRER._I.WRITE](chunk)`

Take one chunk. A rejection defers the chunk — it is not lost — and is
retried per `MaxDrainRetryCount` / `DrainRetryInterval`. When the budget
runs out, the error is latched as above.

#### `[SYMBOL.TRANSFERRER._I.DROP]()`

Let the medium go. Called once, at the end. Its rejection is reported and
swallowed: the teardown face is fail-soft.

#### Getters

| Getter              | Meaning                       |
| ------------------- | ----------------------------- |
| `dumping`           | the dump in flight, or `null` |
| `done`              | the source ended              |
| `dropped`           | the transferrer was released  |
| `pendingByteLength` | queued bytes not yet written  |

### DegradedChunkReader

Abstract. The read side behind the medium: one instance per copy.

#### `static [SYMBOL.DEGRADED_CHUNK_READER._S.TRANSFERRER_CTOR]`

Required. The transferrer class this reader family writes through.

#### `[SYMBOL.DEGRADED_CHUNK_READER._I.INITIALIZE]()`

Open the medium. Only open: no positioning, no reading — that is the
framework's business. A rejection is retried per `MaxInitializeRetryCount`
/ `InitializeRetryInterval`, and each attempt is reported.

Once the budget runs out, the copy is not killed: the failure surfaces
only when a read actually needs the medium. Until then the copy keeps
reading from the queue.

#### `[SYMBOL.DEGRADED_CHUNK_READER._I.SEEK]()`

Move the medium forward by one record.

- `true`: a boundary was crossed.
- `false`: there is no next record — the catch-up stops and the remainder
  is left to the next one. This is not a failure, and it is not retried.
- Throwing: the seek failed. It is reported as
  `degraded-reader-seek-failed`, it is not retried, and that copy is out.
  Recovery belongs to you: only you know whether the cursor moved.

Records are numbered from `0` in the shared sequence, so a reader born at
the degrade starts at the first record. `SEEK` crosses without delivering
— it must not read a body. The framework calls it once per boundary a
copy has already consumed elsewhere.

#### `[SYMBOL.DEGRADED_CHUNK_READER._I.READ]()`

Read back the record at the cursor and answer
`{ done: false, value: chunk }`, or `{ done: true }` at the end of the
medium. A non-terminal answer moves the cursor one record forward.

A rejection is reported as `degraded-reader-read-failed`, it is not
retried, and that copy is out. By then the chunk is out of the
framework's hands: the medium is the only copy left.

#### `[SYMBOL.DEGRADED_CHUNK_READER._I.CLOSE]()`

Shut the medium down. A rejection is reported as
`degraded-reader-close-failed` and swallowed.

#### Getters

| Getter        | Meaning                                  |
| ------------- | ---------------------------------------- |
| `chunkStash`  | the bytes captured from the source       |
| `transferrer` | the transferrer this copy writes through |
| `closed`      | the reader was closed                    |

`chunkStash` is emptied once the dump has landed, so read it from `DUMP`
rather than from the reader.

## Symbols

Every slot above is exported under `SYMBOL`, frozen and shared by all
three classes:

```js
SYMBOL.TRANSFERRER._I; // DUMP, WRITE, DROP
SYMBOL.TRANSFERRER._S; // PARSE_ARGUMENTS
SYMBOL.DEGRADED_CHUNK_READER._I; // READ, INITIALIZE, CLOSE, SEEK
SYMBOL.DEGRADED_CHUNK_READER._S; // TRANSFERRER_CTOR
SYMBOL.DISTRIBUTOR._S; // DEGRADED_CHUNK_READER_CTOR
```

Destructure them once at the top of your medium module, as in
[Quick start](#quick-start).

## License

MIT
