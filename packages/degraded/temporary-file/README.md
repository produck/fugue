# @produck/fugue-degraded-temporary-file

> The temporary-file degraded medium for
> `@produck/fugue`, built on
> `@produck/fugue-degraded-node-file`.

The distributor spills to a medium once its stash grows past
`MaxStashByteLength`. This package is that medium for a host with no
opinion about where the spool goes: it names its own file under the OS
temporary directory, and the release removes it, so nothing of the spool
is left behind.

The framing, the two classes and the release rules are the sibling's —
this package decides the path, and nothing else.

## Install

```sh
npm install @produck/fugue-degraded-temporary-file
```

## Use

```js
import * as Fugue from '@produck/fugue';
import { ChunkReader } from '@produck/fugue-degraded-temporary-file';

const { DEGRADED_CHUNK_READER_CTOR } = Fugue.SYMBOL.DISTRIBUTOR._S;

class UploadDistributor extends Fugue.Distributor {
  static get [DEGRADED_CHUNK_READER_CTOR]() {
    return ChunkReader;
  }
}

const distributor = new UploadDistributor(source);

Fugue.Options.Tune.MaxStashByteLength(distributor, 64 * 1024 * 1024);

const copy = distributor.fork();
```

- Nothing to configure: the medium takes no transferrer arguments, so there
  is no `setTransferrerArgs()` call to make.
- The path is `os.tmpdir()` plus what the class answers from
  `generateFileName()`: `fugue-<uuid>.tmp` by default, picked when the medium
  is built, so concurrent distributors never collide. The medium's `pathname`
  tells you which one it got.
- Nothing is written until the stash crosses `MaxStashByteLength`.
- `destroy()` releases the medium: the handle is closed and the file is
  removed.

## The two classes

- `TemporaryFileTransferrer` — the write side: a `FileTransferrer` whose
  constructor names its own file through `generateFileName()`, and whose
  argument hook answers no arguments.
- `TemporaryFileChunkReader` — the read side, one instance per copy.

Both are also exported as `ChunkReader` and `Transferrer` — the pair every
`degraded/<kind>` package answers.

To name the file differently, override the namer. The constructor reads it
from the class being built, so a subclass needs nothing else. The answer
must be a relative path that names something inside the temporary
directory — not absolute, not climbing out with `..`, and not the directory
itself — or the medium refuses it:

```js
import { Transferrer } from '@produck/fugue-degraded-temporary-file';

class ArchivedTransferrer extends Transferrer {
  static generateFileName() {
    return `archive-${crypto.randomUUID()}.spool`;
  }
}
```

## Scope

Node only: `os.tmpdir()` and `node:crypto` pick the default name,
`node:fs` writes the file. A host that wants the spool outside the
temporary directory, or wants to keep it, should use the sibling instead:
`@produck/fugue-degraded-node-file`.

## License

MIT
