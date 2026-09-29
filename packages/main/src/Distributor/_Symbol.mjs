import { deepFreeze } from '@produck/deep-freeze-enumerable';

const I_CTOR = Symbol('.#ctor');
const I_SOURCE_READER = Symbol('.#sourceReader');
const I_DEGRADED_CHUNK_READER_CTOR = Symbol('.#degradedChunkReaderCtor');
const I_CURRENT_CHUNK_READER_CTOR = Symbol('.#currentChunkReaderCtor');
const I_TRANSFERRER_ARGS = Symbol('.#transferrerArgs');
const I_TRANSFERRER_CTOR = Symbol('.#transferrerCtor');
const I_WARNING_COUNT_RECORD = Symbol('.#warningCountRecord');

export const I = deepFreeze({
  CTOR: I_CTOR,
  SOURCE_READER: I_SOURCE_READER,
  DEGRADED_CHUNK_READER_CTOR: I_DEGRADED_CHUNK_READER_CTOR,
  CURRENT_CHUNK_READER_CTOR: I_CURRENT_CHUNK_READER_CTOR,
  TRANSFERRER_ARGS: I_TRANSFERRER_ARGS,
  TRANSFERRER_CTOR: I_TRANSFERRER_CTOR,
  WARNING_COUNT_RECORD: I_WARNING_COUNT_RECORD,
});

const $I_SOURCE_CONSUMPTION_AGENT = Symbol('.$sourceConsumptionAgent');
const $I_CHUNK_STASH = Symbol('.$chunkStash');
const $I_TERMINATION = Symbol('.$termination');
const $I_TRANSFERRER = Symbol('.$transferrer');
const $I_DEGRADE = Symbol('.$degrade()');
const $I_WARN = Symbol('.$warn()');
const $I_FORKED_READABLE_STREAM_REGISTRY = Symbol(
  '.$forkedReadableStreamRegistry',
);
const $I_DESTROYED = Symbol('.$destroyed');
const $I_DESTROY = Symbol('.$destroy()');

export const $I = deepFreeze({
  SOURCE_CONSUMPTION_AGENT: $I_SOURCE_CONSUMPTION_AGENT,
  CHUNK_STASH: $I_CHUNK_STASH,
  FORKED_READABLE_STREAM_REGISTRY: $I_FORKED_READABLE_STREAM_REGISTRY,
  TERMINATION: $I_TERMINATION,
  TRANSFERRER: $I_TRANSFERRER,
  DEGRADE: $I_DEGRADE,
  WARN: $I_WARN,
  DESTROYED: $I_DESTROYED,
  DESTROY: $I_DESTROY,
});

const S_DEGRADED_CHUNK_READER_CTOR = Symbol('._degradedChunkReaderCtor');

export const _S = deepFreeze({
  DEGRADED_CHUNK_READER_CTOR: S_DEGRADED_CHUNK_READER_CTOR,
});

export const A = deepFreeze({
  I: {
    SOURCE: I_SOURCE_READER,
    CTOR: {
      TRANSFERRER: I_TRANSFERRER_CTOR,
      READER: {
        DEGRADED: I_DEGRADED_CHUNK_READER_CTOR,
        CURRENT: I_CURRENT_CHUNK_READER_CTOR,
      },
    },
  },
  $I: {
    STASH: $I_CHUNK_STASH,
    AGENT: $I_SOURCE_CONSUMPTION_AGENT,
    REGISTRY: $I_FORKED_READABLE_STREAM_REGISTRY,
  },
});
