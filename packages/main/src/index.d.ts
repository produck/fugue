/**
 * The contract this package hands to a host: what a subclass implements, and
 * what the distributor exposes.
 */

declare const TRANSFERRER_INITIALIZE: unique symbol;
declare const TRANSFERRER_DUMP: unique symbol;
declare const TRANSFERRER_WRITE: unique symbol;
declare const TRANSFERRER_DROP: unique symbol;
declare const TRANSFERRER_PARSE_ARGUMENTS: unique symbol;

declare const DEGRADED_CHUNK_READER_READ: unique symbol;
declare const DEGRADED_CHUNK_READER_INITIALIZE: unique symbol;
declare const DEGRADED_CHUNK_READER_CLOSE: unique symbol;
declare const DEGRADED_CHUNK_READER_SEEK: unique symbol;
declare const DEGRADED_CHUNK_READER_TRANSFERRER_CTOR: unique symbol;

declare const DISTRIBUTOR_DEGRADED_CHUNK_READER_CTOR: unique symbol;

/**
 * The slots the framework calls.
 *
 * `_I` holds the instance members a subclass fills in, `_S` the statics the
 * framework reads off the subclass. The private (`I`) and protected (`$I`)
 * layers of the source stay out of this table.
 */
export declare const SYMBOL: Readonly<{
  TRANSFERRER: Readonly<{
    _I: Readonly<{
      INITIALIZE: typeof TRANSFERRER_INITIALIZE;

      DUMP: typeof TRANSFERRER_DUMP;

      WRITE: typeof TRANSFERRER_WRITE;

      DROP: typeof TRANSFERRER_DROP;
    }>;

    _S: Readonly<{
      PARSE_ARGUMENTS: typeof TRANSFERRER_PARSE_ARGUMENTS;
    }>;
  }>;

  DEGRADED_CHUNK_READER: Readonly<{
    _I: Readonly<{
      READ: typeof DEGRADED_CHUNK_READER_READ;

      INITIALIZE: typeof DEGRADED_CHUNK_READER_INITIALIZE;

      CLOSE: typeof DEGRADED_CHUNK_READER_CLOSE;

      SEEK: typeof DEGRADED_CHUNK_READER_SEEK;
    }>;

    _S: Readonly<{
      TRANSFERRER_CTOR: typeof DEGRADED_CHUNK_READER_TRANSFERRER_CTOR;
    }>;
  }>;

  DISTRIBUTOR: Readonly<{
    _S: Readonly<{
      DEGRADED_CHUNK_READER_CTOR: typeof DISTRIBUTOR_DEGRADED_CHUNK_READER_CTOR;
    }>;
  }>;
}>;

type Constructor<T> = abstract new (...args: never[]) => T;

declare const TRANSFERRER_I: typeof SYMBOL.TRANSFERRER._I;
declare const TRANSFERRER_S: typeof SYMBOL.TRANSFERRER._S;
declare const READER_I: typeof SYMBOL.DEGRADED_CHUNK_READER._I;
declare const READER_S: typeof SYMBOL.DEGRADED_CHUNK_READER._S;
declare const DISTRIBUTOR_S: typeof SYMBOL.DISTRIBUTOR._S;
declare const READER_CTOR: typeof DISTRIBUTOR_S.DEGRADED_CHUNK_READER_CTOR;

/** The bytes captured from the source, waiting for the medium. */
export interface ChunkStash<Chunk extends Uint8Array = Uint8Array> {
  /** The source reached its end. */
  readonly done: boolean;

  /** The number of chunks held. */
  readonly length: number;

  /** The bytes held, the sum of the chunks. */
  readonly byteLength: number;

  /** Random access into the held prefix. */
  get(index: number): Chunk;

  /** A copy of the held prefix: an iteration never sees a later push. */
  chunks(): IterableIterator<Chunk>;
}

export type ReadableChunkResult<Chunk extends Uint8Array = Uint8Array> =
  { done: true; value?: undefined } | { done: false; value: Chunk };

/**
 * The write side: get ready, take the captured stash, write one chunk, let
 * the medium go.
 *
 * Only the slots below are the subclass's business — the getters are the
 * framework's own bookkeeping.
 */
export declare abstract class Transferrer<
  Chunk extends Uint8Array = Uint8Array,
> {
  constructor(...args: unknown[]);

  /** Reads what the host passed to `setTransferrerArgs()` at construction. */
  static [TRANSFERRER_S.PARSE_ARGUMENTS](args: unknown[]): unknown[];

  /**
   * The prepare in flight, or `null`. A reader awaits it before it trusts a
   * position. Fulfilling means the attempt ended, not that the medium is
   * ready: a failure is latched and surfaces on the next write or position
   * wait.
   */
  get prepared(): Promise<void> | null;

  /**
   * The source ended, so a reader waiting past the queue is answered at once.
   */
  get done(): boolean;

  /**
   * The transferrer was released: the queue is gone, nothing more is written.
   */
  get dropped(): boolean;

  /** The bytes queued and not yet written. */
  get pendingByteLength(): number;

  /**
   * Get the medium ready, once, before anything is handed over. The default
   * does nothing; a rejection is retried on its own budget, then latched, and
   * the dump never runs.
   */
  [TRANSFERRER_I.INITIALIZE](): void | PromiseLike<void>;

  /** Hand the stash to the medium, whole. */
  abstract [TRANSFERRER_I.DUMP](
    stash: ChunkStash<Chunk>,
  ): void | PromiseLike<void>;

  /** Take one chunk. Rejecting it defers the chunk, it does not lose it. */
  abstract [TRANSFERRER_I.WRITE](chunk: Chunk): void | PromiseLike<void>;

  /** Let the medium go; it is called once, at the end. */
  abstract [TRANSFERRER_I.DROP](): void | PromiseLike<void>;
}

/** The read side behind the medium, one instance per copy. */
export declare abstract class DegradedChunkReader<
  Chunk extends Uint8Array = Uint8Array,
> {
  constructor(...args: unknown[]);

  /** The transferrer class this reader family writes through. */
  static [READER_S.TRANSFERRER_CTOR]: Constructor<Transferrer>;

  get chunkStash(): ChunkStash<Chunk>;

  get closed(): boolean;

  get transferrer(): Transferrer<Chunk>;

  abstract [READER_I.READ]():
    ReadableChunkResult<Chunk> | PromiseLike<ReadableChunkResult<Chunk>>;

  /** Opens the medium. It is retried when it rejects. */
  abstract [READER_I.INITIALIZE](): void | PromiseLike<void>;

  /** Shuts the medium down; a rejection is reported, not thrown on. */
  abstract [READER_I.CLOSE](): void | PromiseLike<void>;

  /**
   * Moves the medium forward by one position.
   *
   * `false` stops the catch-up loop — it does not retry, and it does not
   * latch: a failure is answered by throwing instead.
   */
  abstract [READER_I.SEEK](): boolean | PromiseLike<boolean>;
}

export declare abstract class Distributor<
  Chunk extends Uint8Array = Uint8Array,
> extends EventTarget {
  /**
   * @param source A WHATWG `ReadableStream` of this realm, not locked.
   * @throws {TypeError} When `source` is not a stream of this realm.
   * @throws {Error} When `source` is already locked.
   */
  constructor(source: ReadableStream<Chunk>);

  /** The degraded reader family this distributor forks, and degrades into. */
  static [READER_CTOR]: Constructor<DegradedChunkReader>;

  /** Every option, resolved at read time. */
  get options(): OptionsSnapshot;

  /**
   * True from the moment the transferrer took over: there is no separate phase
   * flag, the transferrer itself is the source of truth.
   */
  get degraded(): boolean;

  /**
   * A gate for new work, not a sweep: it refuses `fork()` and nothing else —
   * live copies keep reading the source to its end.
   */
  get terminated(): boolean;

  /** A copy with its own position. Refused once `terminated`. */
  fork(): ReadableStream<Chunk>;

  /**
   * The report count of one code, in the same vocabulary as `WarnCode`.
   *
   * A listener reading the count inside the `warn` dispatch sees that very
   * report included.
   *
   * @throws {TypeError} When `code` is outside the warning vocabulary.
   */
  getWarningCount(code: Event.WarnCode): number;

  /** One shot: the args are consumed when the transferrer is built. */
  setTransferrerArgs(...args: unknown[]): void;

  terminate(): void;

  /**
   * Idempotent: every call answers the first promise. It cancels the source,
   * errors every live copy and releases the medium.
   */
  destroy(): Promise<void>;
}

export declare namespace Event {
  class DistributorEvent<Detail = undefined> extends CustomEvent<Detail> {
    constructor(type: string, detail: Detail);
  }

  class DegradeEvent extends DistributorEvent<{ byteLength: number }> {
    constructor(byteLength: number);
  }

  class ForkEvent<
    Chunk extends Uint8Array = Uint8Array,
  > extends DistributorEvent<{ forked: ReadableStream<Chunk> }> {
    constructor(forked: ReadableStream<Chunk>);
  }

  class TerminateEvent extends DistributorEvent<undefined> {
    constructor();
  }

  export interface CausePayload {
    cause: unknown;
  }

  export interface RetryPayload extends CausePayload {
    retry: number;
  }

  /**
   * The payload each code carries, in the vocabulary of `Warning.CODES` — the
   * two tables are one contract and move together. Only `transferrer-backlog`
   * carries a quantity.
   */
  export interface WarnPayloadMap {
    'degraded-reader-initialize-failed': RetryPayload;

    'degraded-reader-seek-failed': CausePayload;

    'degraded-reader-read-failed': CausePayload;

    'degraded-reader-close-failed': CausePayload;

    'source-cancel-failed': CausePayload;

    'source-read-failed': CausePayload;

    'transferrer-dump-failed': RetryPayload;

    'transferrer-write-failed': RetryPayload;

    'transferrer-backlog': { pendingByteLength: number };

    'transferrer-drop-failed': CausePayload;
  }

  export type WarnCode = keyof WarnPayloadMap;

  export type WarnPayloadOf<Code extends WarnCode> = WarnPayloadMap[Code];

  export type WarnDetail = {
    [Code in WarnCode]: { code: Code; payload: WarnPayloadMap[Code] };
  }[WarnCode];

  /** `code` and `payload` stay correlated: narrowing one narrows the other. */
  class WarnEvent<
    Code extends WarnCode = WarnCode,
  > extends DistributorEvent<WarnDetail> {
    constructor(code: Code, payload: WarnPayloadOf<Code>);
  }

  const Degrade: typeof DegradeEvent;

  const Fork: typeof ForkEvent;

  const Terminate: typeof TerminateEvent;

  const Warn: typeof WarnEvent;

  type Degrade = DegradeEvent;

  type Fork<Chunk extends Uint8Array = Uint8Array> = ForkEvent<Chunk>;

  type Terminate = TerminateEvent;

  type Warn = WarnEvent;
}

type OptionDefinitions = {
  /**
   * The stash may hold this many bytes before a pull degrades into the medium.
   * Read on every pull, by the degrade probe. Defaults to 1 GiB.
   */
  MaxChunkStashByteLength: number;

  /**
   * The queued bytes that make the transferrer report `transferrer-backlog`.
   * Defaults to following `MaxChunkStashByteLength`, read at every query.
   */
  MaxTransferrerBacklogWarningByteLength: number;

  /**
   * Whether a stash that is both over the limit and complete still degrades.
   * Read by the same probe. Defaults to `false`.
   */
  DegradeOnChunkStashFullAndDone: boolean;

  /**
   * The high water mark of every copy forked from now on. Read once per fork,
   * so a live copy keeps the value it was made with. Defaults to 1.
   */
  ForkedReadableStreamHighWaterMark: number;

  /**
   * How many times an open that rejects is retried. Read once per reader
   * initialize. Defaults to `Infinity`.
   */
  MaxChunkReaderInitializeRetryCount: number;

  /**
   * The pause between two open attempts, in milliseconds. Defaults to 1000.
   */
  ChunkReaderInitializeRetryInterval: number;

  /**
   * How many times a medium that rejects its ready step is retried. Read once
   * per transferrer initialize. Defaults to `Infinity`.
   */
  MaxTransferrerInitializeRetryCount: number;

  /**
   * The pause between two ready-step attempts, in milliseconds. Defaults to
   * 1000.
   */
  TransferrerInitializeRetryInterval: number;

  /**
   * How many times a rejected dump is retried. Read once per dump. Defaults to
   * `Infinity`.
   */
  MaxTransferrerDumpRetryCount: number;

  /**
   * How many times a rejected write is retried. Read once per drained chunk.
   * Defaults to `Infinity`.
   */
  MaxTransferrerDrainRetryCount: number;

  /**
   * The pause between two dump attempts, in milliseconds. Defaults to 1000.
   */
  TransferrerDumpRetryInterval: number;

  /**
   * The pause between two write attempts, in milliseconds. Defaults to 1000.
   */
  TransferrerDrainRetryInterval: number;
};

export type OptionGetters = {
  [Name in keyof OptionDefinitions]: (
    options: OptionGetters,
  ) => OptionDefinitions[Name];
};

export type OptionsSnapshot = OptionDefinitions;

/**
 * A value, or a getter read at every query — so one option may follow another.
 */
export type OptionValue<Value> = Value | ((options: OptionGetters) => Value);

export declare namespace Options {
  type Tune = {
    [Name in keyof OptionDefinitions]: <Chunk extends Uint8Array>(
      distributor: Distributor<Chunk>,
      value: OptionValue<OptionDefinitions[Name]>,
    ) => void;
  };

  type Get = {
    [Name in keyof OptionDefinitions]: <Chunk extends Uint8Array>(
      distributor: Distributor<Chunk>,
    ) => OptionDefinitions[Name];
  };

  const Tune: Readonly<Tune>;

  const Get: Readonly<Get>;

  /**
   * Presets over the four retry budgets: `no*` zeroes one budget, `unlimited*`
   * opens it, and `noRetry` / `unlimitedRetry` do all four at once.
   */
  type PresetName =
    | 'noChunkReaderInitializeRetry'
    | 'noTransferrerInitializeRetry'
    | 'noTransferrerDumpRetry'
    | 'noTransferrerDrainRetry'
    | 'unlimitedChunkReaderInitializeRetry'
    | 'unlimitedTransferrerInitializeRetry'
    | 'unlimitedTransferrerDumpRetry'
    | 'unlimitedTransferrerDrainRetry'
    | 'noRetry'
    | 'unlimitedRetry';

  type Preset = {
    [Name in PresetName]: <Chunk extends Uint8Array>(
      distributor: Distributor<Chunk>,
    ) => void;
  };

  const Preset: Readonly<Preset>;
}
