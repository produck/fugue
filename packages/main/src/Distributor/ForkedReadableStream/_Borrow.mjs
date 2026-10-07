import { deepFreeze } from '@produck/deep-freeze-enumerable';

import * as DISTRIBUTOR from '../_Symbol.mjs';
import * as CHUNK_READER from '../ChunkReader/_Symbol.mjs';

export const _A = deepFreeze({
  READER: CHUNK_READER,
});

export { DISTRIBUTOR, CHUNK_READER };
