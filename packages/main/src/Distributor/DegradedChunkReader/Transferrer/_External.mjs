import { deepFreeze } from '@produck/deep-freeze-enumerable';
import * as CHUNK_STASH from '../../ChunkStash/_Symbol.mjs';
import * as PART from '../../Part/_Symbol.mjs';

export const _A = deepFreeze({
  STASH: CHUNK_STASH,
});

export { CHUNK_STASH, PART };
