import {
  DegradedChunkReader,
  Distributor as AbstractDistributor,
  SYMBOL,
  Transferrer,
  type ChunkStash,
  type ReadableChunkResult,
} from '@produck/readable-stream-distributor';

declare const TRANSFERRER_I: typeof SYMBOL.TRANSFERRER._I;
declare const TRANSFERRER_S: typeof SYMBOL.TRANSFERRER._S;
declare const READER_I: typeof SYMBOL.DEGRADED_CHUNK_READER._I;
declare const READER_S: typeof SYMBOL.DEGRADED_CHUNK_READER._S;
declare const DISTRIBUTOR_S: typeof SYMBOL.DISTRIBUTOR._S;
declare const READER_CTOR: typeof DISTRIBUTOR_S.DEGRADED_CHUNK_READER_CTOR;

/**
 * The write side: framed records in one file.
 *
 * The path comes from `setTransferrerArgs(path)`. Records are
 * length-prefixed, and every write lands at an explicit offset, so a retry
 * overwrites the record instead of appending a second copy of it. The file
 * belongs to the host: the release closes the handle, and leaves the file
 * in place.
 */
export declare class FileTransferrer extends Transferrer {
  /** The file this transferrer writes. */
  readonly path: string;

  /** Reads the file path out. */
  static [TRANSFERRER_S.PARSE_ARGUMENTS](args: unknown[]): [string];

  [TRANSFERRER_I.DUMP](stash: ChunkStash): Promise<void>;

  [TRANSFERRER_I.WRITE](chunk: Uint8Array): Promise<void>;

  [TRANSFERRER_I.DROP](): Promise<void>;
}

/**
 * The read side: one cursor into that file, one instance per copy.
 *
 * A record's index in the file is its position in the shared sequence, so a
 * reader is born at the first record and the framework seeks it forward.
 */
export declare class FileChunkReader extends DegradedChunkReader {
  /** The transferrer family this reader reads back from. */
  static [READER_S.TRANSFERRER_CTOR]: typeof FileTransferrer;

  [READER_I.INITIALIZE](): Promise<void>;

  [READER_I.SEEK](): Promise<boolean>;

  [READER_I.READ](): Promise<ReadableChunkResult>;

  [READER_I.CLOSE](): Promise<void>;
}

/** Ready to fork: the two above, wired into one distributor. */
export declare class Distributor extends AbstractDistributor {
  static [READER_CTOR]: typeof FileChunkReader;
}
