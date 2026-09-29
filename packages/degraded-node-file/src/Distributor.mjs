import {
  Distributor as AbstractDistributor,
  SYMBOL,
} from '@produck/readable-stream-distributor';

import { FileChunkReader } from './FileChunkReader.mjs';

const { DEGRADED_CHUNK_READER_CTOR } = SYMBOL.DISTRIBUTOR._S;

export class Distributor extends AbstractDistributor {
  static [DEGRADED_CHUNK_READER_CTOR] = FileChunkReader;
}
