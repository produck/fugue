import * as os from 'node:os';
import * as path from 'node:path';

import * as Fugue from '@produck/fugue';
import * as File from '@produck/fugue-degraded-node-file';
import { ThrowTypeError } from '@produck/type-error';

const temporaryPathname = (name) => {
  if (typeof name !== 'string') {
    ThrowTypeError('generateFileName() as name', 'string');
  }

  const baseTemporaryPathname = os.tmpdir();
  const pathname = path.join(baseTemporaryPathname, name);
  const climbed = path.relative(baseTemporaryPathname, pathname);

  if (name === '' || path.isAbsolute(name) || climbed.startsWith('..')) {
    ThrowTypeError('generateFileName() as name', 'relative path');
  }

  return pathname;
};

export class TemporaryFileTransferrer extends File.FileTransferrer {
  static generateFileName() {
    return `fugue-${crypto.randomUUID()}.tmp`;
  }

  constructor() {
    super(temporaryPathname(new.target.generateFileName()));
  }

  static [Fugue.SYMBOL.TRANSFERRER._S.PARSE_ARGUMENTS]() {
    return [];
  }
}

export class TemporaryFileChunkReader extends File.ChunkReader {
  static get [Fugue.SYMBOL.DEGRADED_CHUNK_READER._S.TRANSFERRER_CTOR]() {
    return TemporaryFileTransferrer;
  }
}

export {
  TemporaryFileChunkReader as ChunkReader,
  TemporaryFileTransferrer as Transferrer,
};
