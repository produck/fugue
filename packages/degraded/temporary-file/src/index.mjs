import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import * as Core from '@produck/readable-stream-distributor';
import * as File from '@produck/readable-stream-distributor-degraded-node-file';

const { SYMBOL: DISTRIBUTOR } = Core;

export class TemporaryFileTransferrer extends File.FileTransferrer {
  constructor() {
    const pathname = path.join(tmpdir(), `${randomUUID()}.tmp`);

    super(pathname);
  }

  static [DISTRIBUTOR.TRANSFERRER._S.PARSE_ARGUMENTS]() {
    return [];
  }
}

export class TemporaryFileChunkReader extends File.ChunkReader {
  static get [DISTRIBUTOR.DEGRADED_CHUNK_READER._S.TRANSFERRER_CTOR]() {
    return TemporaryFileTransferrer;
  }
}

export {
  TemporaryFileChunkReader as ChunkReader,
  TemporaryFileTransferrer as Transferrer,
};
