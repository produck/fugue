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

export declare const SYMBOL: Readonly<{
  TRANSFERRER: Readonly<{
    _I: Readonly<{
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

export interface ChunkStash<Chunk extends Uint8Array = Uint8Array> {
  readonly done: boolean;
  readonly length: number;
  readonly byteLength: number;
  get(index: number): Chunk;
  chunks(): IterableIterator<Chunk>;
}

export type ReadableChunkResult<Chunk extends Uint8Array = Uint8Array> =
  { done: true; value?: undefined } | { done: false; value: Chunk };

export declare abstract class Transferrer<
  Chunk extends Uint8Array = Uint8Array,
> {
  constructor(...args: unknown[]);

  static [TRANSFERRER_S.PARSE_ARGUMENTS](args: unknown[]): unknown[];

  get dumping(): Promise<void> | null;
  get done(): boolean;
  get dropped(): boolean;
  get pendingByteLength(): number;

  abstract [TRANSFERRER_I.DUMP](
    stash: ChunkStash<Chunk>,
  ): void | PromiseLike<void>;
  abstract [TRANSFERRER_I.WRITE](chunk: Chunk): void | PromiseLike<void>;
  abstract [TRANSFERRER_I.DROP](): void | PromiseLike<void>;
}

export declare abstract class DegradedChunkReader<
  Chunk extends Uint8Array = Uint8Array,
> {
  constructor(...args: unknown[]);

  static [READER_S.TRANSFERRER_CTOR]: Constructor<Transferrer>;

  get chunkStash(): ChunkStash<Chunk>;
  get closed(): boolean;
  get transferrer(): Transferrer<Chunk>;

  abstract [READER_I.READ]():
    ReadableChunkResult<Chunk> | PromiseLike<ReadableChunkResult<Chunk>>;
  abstract [READER_I.INITIALIZE](): void | PromiseLike<void>;
  abstract [READER_I.CLOSE](): void | PromiseLike<void>;
  abstract [READER_I.SEEK](): boolean | PromiseLike<boolean>;
}

export declare abstract class Distributor<
  Chunk extends Uint8Array = Uint8Array,
> extends EventTarget {
  constructor(source: ReadableStream<Chunk>);

  static [READER_CTOR]: Constructor<DegradedChunkReader>;

  get options(): OptionsSnapshot;
  get degraded(): boolean;
  get terminated(): boolean;

  fork(): ReadableStream<Chunk>;
  setTransferrerArgs(...args: unknown[]): void;
  terminate(): void;
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

  export interface WarnPayloadMap {
    'degraded-reader-initialize-failed': RetryPayload;
    'degraded-reader-seek-failed': CausePayload;
    'degraded-reader-read-failed': CausePayload;
    'degraded-reader-close-failed': CausePayload;
    'source-cancel-failed': CausePayload;
    'source-read-failed': CausePayload;
    'transferrer-dump-failed': RetryPayload;
    'transferrer-write-failed': RetryPayload;
    'transferrer-backlog': { byteLength: number };
    'transferrer-drop-failed': CausePayload;
  }

  export type WarnCode = keyof WarnPayloadMap;

  export type WarnPayloadOf<Code extends WarnCode> = WarnPayloadMap[Code];

  export type WarnDetail = {
    [Code in WarnCode]: { code: Code; payload: WarnPayloadMap[Code] };
  }[WarnCode];

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
  MaxStashByteLength: number;
  MaxBacklogWarningByteLength: number;
  DegradeOnStashFullAndDone: boolean;
  ForkHighWaterMark: number;
  MaxInitializeRetryCount: number;
  InitializeRetryInterval: number;
  MaxDumpRetryCount: number;
  MaxDrainRetryCount: number;
  DumpRetryInterval: number;
  DrainRetryInterval: number;
};

export type OptionGetters = {
  [Name in keyof OptionDefinitions]: (
    options: OptionGetters,
  ) => OptionDefinitions[Name];
};

export type OptionsSnapshot = OptionDefinitions;

export type OptionValue<Value> = Value | ((options: OptionGetters) => Value);

export declare namespace Options {
  type Tune = {
    [Name in keyof OptionDefinitions as `tune${Name}`]: <
      Chunk extends Uint8Array,
    >(
      distributor: Distributor<Chunk>,
      value: OptionValue<OptionDefinitions[Name]>,
    ) => void;
  };

  type Get = {
    [Name in keyof OptionDefinitions as `get${Name}`]: <
      Chunk extends Uint8Array,
    >(
      distributor: Distributor<Chunk>,
    ) => OptionDefinitions[Name];
  };

  const Tune: Readonly<Tune>;
  const Get: Readonly<Get>;

  type AssetName =
    | 'noInitializeRetry'
    | 'noDumpRetry'
    | 'noDrainRetry'
    | 'unlimitedInitializeRetry'
    | 'unlimitedDumpRetry'
    | 'unlimitedDrainRetry'
    | 'noRetry'
    | 'unlimitedRetry';

  type Asset = {
    [Name in AssetName]: <Chunk extends Uint8Array>(
      distributor: Distributor<Chunk>,
    ) => void;
  };

  const Asset: Readonly<Asset>;
}
