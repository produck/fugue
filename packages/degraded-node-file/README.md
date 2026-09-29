# @produck/readable-stream-distributor-degraded-node-file

> The file degraded medium for
> `@produck/readable-stream-distributor`, on Node's file system.

The distributor spills to a medium once its stash grows past
`MaxStashByteLength`. This package is that medium for Node: framed records
in the file the host names, bare `node:fs` underneath, no other dependency
than the distributor itself.

## Install

```sh
npm install @produck/readable-stream-distributor-degraded-node-file
```

## Use

```js
import { Options } from '@produck/readable-stream-distributor';
import { Distributor } from '@produck/readable-stream-distributor-degraded-node-file';

const distributor = new Distributor(source);

distributor.setTransferrerArgs('/var/tmp/upload.spool');
Options.Tune.MaxStashByteLength(distributor, 64 * 1024 * 1024);

const copy = distributor.fork();
```

- `Distributor` is ready to fork: it is the distributor with both halves
  of this medium wired in.
- The path comes from `setTransferrerArgs(path)`, and a distributor
  without one cannot build the medium. It is read once, when the medium
  is built, so set it before the first read.
- Nothing is written until the stash crosses `MaxStashByteLength`.
- `destroy()` releases the medium: the handle is closed and the file
  stays where it is. Which file to name, and whether to remove it
  afterwards, is the host's business.

## The file

A sequence of framed records, written once and read back by position:

```text
[ uint32BE length ][ body ][ uint32BE length ][ body ] ...
```

- Record `i` is position `i` of the shared sequence, so a copy forked
  later reads the file from its first record.
- `SEEK` reads the length prefix and skips the body; `READ` reads the
  body at the cursor.
- Every write lands at an explicit offset. A rejected dump or write is
  retried by the distributor, and a retry overwrites its record instead
  of appending a second copy of it.

## Extending

The two halves are exported for subclasses:

- `FileTransferrer` — the write side; its `path` is the file, and its
  static `PARSE_ARGUMENTS` reads the path out of the arguments.
- `FileChunkReader` — the read side, one instance per copy.

A distributor of your own wires them the way `Distributor` does:

```js
import { SYMBOL } from '@produck/readable-stream-distributor';
import { FileChunkReader } from '@produck/readable-stream-distributor-degraded-node-file';

const { DEGRADED_CHUNK_READER_CTOR } = SYMBOL.DISTRIBUTOR._S;

class MyDistributor extends Distributor {
  static [DEGRADED_CHUNK_READER_CTOR] = TemporaryFileChunkReader;
}
```

## Scope

Node only: the medium is `node:fs` under the hood. A temporary-file
variant — a path under `os.tmpdir()`, removed at the release — would be
another package built on this one, and the browser branch would be another
beside it.

## License

MIT
