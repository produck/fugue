import { deepFreeze } from '@produck/deep-freeze-enumerable';

const $I_CONSUMED_CHUNK_COUNT = Symbol('.$consumedChunkCount');
const $I_READ = Symbol('.$read()');
const $I_ENSURE_THEN_READ = Symbol('.$ensureThenRead()');
const $I_CLOSE = Symbol('.$close()');

export const $I = deepFreeze({
  CONSUMED_CHUNK_COUNT: $I_CONSUMED_CHUNK_COUNT,
  READ: $I_READ,
  ENSURE_THEN_READ: $I_ENSURE_THEN_READ,
  CLOSE: $I_CLOSE,
});

const _I_READ = Symbol('._read()');

export const _I = deepFreeze({
  READ: _I_READ,
});

export const A = deepFreeze({
  $I: {
    CONSUMED_COUNT: $I_CONSUMED_CHUNK_COUNT,
  },
});
