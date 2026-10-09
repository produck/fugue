import * as os from 'node:os';
import * as path from 'node:path';

import { SubConstructorProxy } from '@produck/es-abstract';
import * as Fugue from '@produck/fugue';
import * as File from '@produck/fugue-degraded-node-file';
import { ThrowTypeError } from '@produck/argot';

const temporaryPathname = (name) => {
  if (typeof name !== 'string') {
    ThrowTypeError('generateFileName() as name', 'string');
  }

  const baseTemporaryPathname = os.tmpdir();
  const pathname = path.join(baseTemporaryPathname, name);
  const climbed = path.relative(baseTemporaryPathname, pathname);
  const role = 'generateFileName() as name';

  if (path.isAbsolute(name) || climbed.startsWith('..')) {
    ThrowTypeError(role, 'relative path');
  }

  if (pathname === baseTemporaryPathname) {
    ThrowTypeError(role, 'path inside the temporary directory');
  }

  return pathname;
};

const Transferrer = class TemporaryFileTransferrer extends File.Transferrer {
  static generateFileName() {
    return `fugue-${crypto.randomUUID()}.tmp`;
  }

  constructor() {
    super(temporaryPathname(new.target.generateFileName()));
  }

  static [Fugue.SYMBOL.TRANSFERRER._S.PARSE_ARGUMENTS]() {
    return [];
  }
};

const ChunkReader = class TemporaryFileChunkReader extends File.ChunkReader {
  static get [Fugue.SYMBOL.DEGRADED_CHUNK_READER._S.TRANSFERRER_CTOR]() {
    return TemporaryFileTransferrer;
  }
};

export const TemporaryFileTransferrer = SubConstructorProxy(Transferrer);
export const TemporaryFileChunkReader = SubConstructorProxy(ChunkReader);

export {
  TemporaryFileChunkReader as ChunkReader,
  TemporaryFileTransferrer as Transferrer,
};
