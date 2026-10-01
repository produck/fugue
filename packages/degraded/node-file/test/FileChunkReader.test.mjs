import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as Fugue from '@produck/fugue';

import * as NodeFile from '@produck/fugue-degraded-node-file';

const { FileChunkReader, FileTransferrer } = NodeFile;
const { _S: READER_S } = Fugue.SYMBOL.DEGRADED_CHUNK_READER;

describe('FileChunkReader', () => {
  it('should read back from the file transferrer', () => {
    assert.equal(FileChunkReader[READER_S.TRANSFERRER_CTOR], FileTransferrer);
  });
});
