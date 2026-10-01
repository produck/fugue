# @produck/fugue-degraded-node-file

> The file degraded medium for
> `@produck/fugue`, on Node's file system.

The distributor spills to a medium once its stash grows past
`MaxStashByteLength`. This package is that medium for Node: framed records
in the file the host names, bare `node:fs` underneath, and
`@produck/type-error` for the arguments it refuses.

## Install

```sh
npm install @produck/fugue-degraded-node-file
```

## Use

```js
import * as Fugue from '@produck/fugue';
import { FileChunkReader } from '@produck/fugue-degraded-node-file';

class UploadDistributor extends Fugue.Distributor {
  static get [Fugue.SYMBOL.DISTRIBUTOR._S.DEGRADED_CHUNK_READER_CTOR]() {
    return FileChunkReader;
  }
}

const distributor = new UploadDistributor(source);

distributor.setTransferrerArgs('/var/tmp/upload.spool');
Fugue.Options.Tune.MaxStashByteLength(distributor, 64 * 1024 * 1024);

const copy = distributor.fork();
```

- This package ships the medium, not a distributor: wiring the two
  classes into one is the host's job, and that is the whole of it.
- The path comes from `setTransferrerArgs(path)`, it must be absolute,
  and a distributor without one cannot build the medium. It is read
  once, when the medium is built, so set it before the first read.
- Nothing is written until the stash crosses `MaxStashByteLength`.
- `destroy()` releases the medium: the handle is closed and the file the
  medium created is removed. A host that wants the spool afterwards must
  copy it before destroying.

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

## The two classes

The package ships two halves, and nothing that wires them:

- `FileTransferrer` — the write side; its `pathname` is the file, and
  its static `PARSE_ARGUMENTS` reads the path out of the arguments.
- `FileChunkReader` — the read side, one instance per copy.

Both are meant to be subclassed: a medium of your own extends them and
swaps the static in, the way the example above does.

## Scope

Node only: the medium is `node:fs` under the hood. A browser branch would
be another package beside this one.

## License

MIT
