import * as Fugue from '@produck/fugue';
import * as File from '@produck/fugue-degraded-node-file';

declare const TRANSFERRER_S: typeof Fugue.SYMBOL.TRANSFERRER._S;
declare const READER_S: typeof Fugue.SYMBOL.DEGRADED_CHUNK_READER._S;

/**
 * The write side of the sibling medium, with the file named here.
 *
 * The framing, the explicit offsets and the release that removes the file
 * are the sibling's. This class takes no argument: it names its own file
 * under `os.tmpdir()`, and answers the argument hook with none.
 */
export declare class TemporaryFileTransferrer extends File.FileTransferrer {
  /**
   * Names the file. The default is `fugue-<uuid>.tmp`; a subclass overrides
   * this to name its own.
   */
  static generateFileName(): string;

  /**
   * Names the file through `generateFileName()`, read from the class being
   * built. The name must be a relative path that stays under the temporary
   * directory: not empty, not absolute, nothing climbing out with `..`.
   */
  constructor();

  /** Answers no arguments, so `setTransferrerArgs()` is optional. */
  static [TRANSFERRER_S.PARSE_ARGUMENTS](): [];
}

/** The read side of the sibling medium, wired to its own write side. */
export declare class TemporaryFileChunkReader extends File.ChunkReader {
  /** The transferrer family this reader reads back from. */
  static get [READER_S.TRANSFERRER_CTOR](): typeof TemporaryFileTransferrer;
}

export {
  TemporaryFileChunkReader as ChunkReader,
  TemporaryFileTransferrer as Transferrer,
};
