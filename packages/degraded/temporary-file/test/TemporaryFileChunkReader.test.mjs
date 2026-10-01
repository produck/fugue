import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as Fugue from '@produck/fugue';

import * as TemporaryFile from '@produck/fugue-degraded-temporary-file';

const { SYMBOL } = Fugue;
const { ChunkReader, Transferrer } = TemporaryFile;
const { _S: READER_S } = SYMBOL.DEGRADED_CHUNK_READER;

describe('TemporaryFileChunkReader', () => {
  it('should read back from the temporary file transferrer', () => {
    assert.equal(ChunkReader[READER_S.TRANSFERRER_CTOR], Transferrer);
  });
});
