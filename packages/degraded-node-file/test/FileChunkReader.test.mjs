import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as Core from '@produck/readable-stream-distributor';

import * as NodeFile from '@produck/readable-stream-distributor-degraded-node-file';

const { SYMBOL } = Core;
const { FileChunkReader, FileTransferrer } = NodeFile;
const { _S: READER_S } = SYMBOL.DEGRADED_CHUNK_READER;

describe('FileChunkReader', () => {
  it('should read back from the file transferrer', () => {
    assert.equal(FileChunkReader[READER_S.TRANSFERRER_CTOR], FileTransferrer);
  });
});
