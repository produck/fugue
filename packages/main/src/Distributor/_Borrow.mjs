import { deepFreeze } from '@produck/deep-freeze-enumerable';

import * as CHUNK_STASH from './ChunkStash/_Symbol.mjs';
import * as CHUNK_READER from './ChunkReader/_Symbol.mjs';
import * as BUFFER_CHUNK_READER from './BufferChunkReader/_Symbol.mjs';
import * as DEGRADED_CHUNK_READER from './DegradedChunkReader/_Symbol.mjs';
import * as FORKED_READABLE_STREAM from './ForkedReadableStream/_Symbol.mjs';
import * as TRANSFERRER from './DegradedChunkReader/Transferrer/_Symbol.mjs';
import * as PART from './Part/_Symbol.mjs';

export const _A = deepFreeze({
  STASH: CHUNK_STASH,
  READER: CHUNK_READER,
  BUFFER: BUFFER_CHUNK_READER,
  DEGRADED: DEGRADED_CHUNK_READER,
  FORKED: FORKED_READABLE_STREAM,
});

export {
  CHUNK_STASH,
  CHUNK_READER,
  BUFFER_CHUNK_READER,
  DEGRADED_CHUNK_READER,
  TRANSFERRER,
  FORKED_READABLE_STREAM,
  PART,
};
