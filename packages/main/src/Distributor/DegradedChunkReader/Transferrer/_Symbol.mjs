import { deepFreeze } from '@produck/deep-freeze-enumerable';

const I_DUMPING = Symbol('.#dumping');
const I_PENDING_CHUNKS = Symbol('.#pendingChunks');
const I_WRITTEN_CHUNK_COUNT = Symbol('.#writtenChunkCount');
const I_PENDING_BYTE_LENGTH = Symbol('.#pendingByteLength');
const I_WAITING_POSITION_TABLE = Symbol('.#waitingPositionTable');
const I_DRAINING = Symbol('.#draining');
const I_DRAIN = Symbol('.#drain()');
const I_ERROR = Symbol('.#error');
const I_DONE = Symbol('.#done');
const I_DROPPED = Symbol('.#dropped');
const I_START_DUMPING = Symbol('.#startDumping()');
const I_SETTLE = Symbol('.#settle()');
const I_FAIL = Symbol('.#fail()');

export const I = deepFreeze({
  DUMPING: I_DUMPING,
  PENDING_CHUNKS: I_PENDING_CHUNKS,
  WRITTEN_CHUNK_COUNT: I_WRITTEN_CHUNK_COUNT,
  PENDING_BYTE_LENGTH: I_PENDING_BYTE_LENGTH,
  WAITING_POSITION_TABLE: I_WAITING_POSITION_TABLE,
  DRAINING: I_DRAINING,
  DRAIN: I_DRAIN,
  ERROR: I_ERROR,
  DONE: I_DONE,
  DROPPED: I_DROPPED,
  START_DUMPING: I_START_DUMPING,
  SETTLE: I_SETTLE,
  FAIL: I_FAIL,
});

const $I_DUMP = Symbol('.$dump()');
const $I_WRITE = Symbol('.$write()');
const $I_SET_DONE = Symbol('.$setDone()');
const $I_WAIT_POSITION = Symbol('.$waitPosition()');
const $I_PEEK = Symbol('.$peek()');
const $I_DROP = Symbol('.$drop()');

export const $I = deepFreeze({
  DUMP: $I_DUMP,
  WRITE: $I_WRITE,
  SET_DONE: $I_SET_DONE,
  WAIT_POSITION: $I_WAIT_POSITION,
  PEEK: $I_PEEK,
  DROP: $I_DROP,
});

const _I_DUMP = Symbol('._dump()');
const _I_WRITE = Symbol('._write()');
const _I_DROP = Symbol('._drop()');

export const _I = deepFreeze({
  DUMP: _I_DUMP,
  WRITE: _I_WRITE,
  DROP: _I_DROP,
});

const _S_PARSE_ARGUMENTS = Symbol('._parseArguments()');

export const _S = deepFreeze({
  PARSE_ARGUMENTS: _S_PARSE_ARGUMENTS,
});

export const A = deepFreeze({
  I: {
    WRITTEN_COUNT: I_WRITTEN_CHUNK_COUNT,
  },
});
