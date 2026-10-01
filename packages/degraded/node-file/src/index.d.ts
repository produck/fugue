import * as Core from '@produck/readable-stream-distributor';

declare const TRANSFERRER_I: typeof Core.SYMBOL.TRANSFERRER._I;
declare const TRANSFERRER_S: typeof Core.SYMBOL.TRANSFERRER._S;
declare const READER_I: typeof Core.SYMBOL.DEGRADED_CHUNK_READER._I;
declare const READER_S: typeof Core.SYMBOL.DEGRADED_CHUNK_READER._S;

/**
 * The write side: framed records in one file.
 *
 * The path comes from `setTransferrerArgs(path)`, and it must be an
 * absolute path. Records are length-prefixed, and every write lands at
 * an explicit offset, so a retry overwrites the record instead of
 * appending a second copy of it. The file lives as long as the medium
 * does: the release closes the handle and removes the file this
 * transferrer opened, so a host that wants the spool must copy it
 * before destroying.
 */
export declare class FileTransferrer extends Core.Transferrer {
  /** The pathname this transferrer was built with. Absolute. */
  constructor(pathname: string);

  /** The absolute file this transferrer writes. */
  readonly pathname: string;

  /** Reads the file path out. */
  static [TRANSFERRER_S.PARSE_ARGUMENTS](args: unknown[]): unknown[];

  [TRANSFERRER_I.DUMP](stash: Core.ChunkStash): Promise<void>;

  [TRANSFERRER_I.WRITE](chunk: Uint8Array): Promise<void>;

  [TRANSFERRER_I.DROP](): Promise<void>;
}

/**
 * The read side: one cursor into that file, one instance per copy.
 *
 * A record's index in the file is its position in the shared sequence, so a
 * reader is born at the first record and the framework seeks it forward.
 */
export declare class FileChunkReader extends Core.DegradedChunkReader {
  /** The transferrer family this reader reads back from. */
  static get [READER_S.TRANSFERRER_CTOR](): typeof FileTransferrer;

  [READER_I.INITIALIZE](): Promise<void>;

  [READER_I.SEEK](): Promise<boolean>;

  [READER_I.READ](): Promise<Core.ReadableChunkResult>;

  [READER_I.CLOSE](): Promise<void>;
}

export { FileChunkReader as ChunkReader, FileTransferrer as Transferrer };
