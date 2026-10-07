import { deepFreeze } from '@produck/deep-freeze-enumerable';

import * as CHUNK_READER from '../ChunkReader/_Symbol.mjs';
import * as DISTRIBUTOR from '../_Symbol.mjs';
import * as PART from '../Part/_Symbol.mjs';

export const _A = deepFreeze({
  READER: CHUNK_READER,
});

export { CHUNK_READER, DISTRIBUTOR, PART };
