import assert from 'node:assert/strict';
import { it } from 'node:test';

import {
  Distributor,
  DegradedChunkReader,
  Options,
  SYMBOL,
  Transferrer,
} from '@produck/readable-stream-distributor';

import { drain, makeSource } from '#test/baseline.mjs';

const { DEGRADED_CHUNK_READER_CTOR } = SYMBOL.DISTRIBUTOR._S;
const { _I: READER, _S: READER_S } = SYMBOL.DEGRADED_CHUNK_READER;
const { _I: TRANSFERRER } = SYMBOL.TRANSFERRER;

const EXPECTED = {
  ABORTED: { name: 'AbortError' },
};

class MemoryTransferrer extends Transferrer {
  records = [];

  [TRANSFERRER.DUMP](stash) {
    this.records = [...stash.chunks()];
  }

  [TRANSFERRER.WRITE](chunk) {
    this.records.push(chunk);
  }

  [TRANSFERRER.DROP]() {
    this.records = [];
  }

  get medium() {
    return this.records;
  }
}

class MemoryReader extends DegradedChunkReader {
  static [READER_S.TRANSFERRER_CTOR] = MemoryTransferrer;

  cursor = 0;

  [READER.INITIALIZE]() {}

  [READER.SEEK]() {
    if (this.cursor >= this.transferrer.medium.length) {
      return false;
    }

    this.cursor++;

    return true;
  }

  [READER.READ]() {
    const medium = this.transferrer.medium;

    if (this.cursor >= medium.length) {
      return { done: true, value: undefined };
    }

    return { done: false, value: medium[this.cursor++] };
  }

  [READER.CLOSE]() {}
}

class MemoryDistributor extends Distributor {
  static [DEGRADED_CHUNK_READER_CTOR] = MemoryReader;
}

it('should hand every copy the whole source, from the first byte', async () => {
  const distributor = new MemoryDistributor(makeSource(['hello ', 'world']));
  const one = distributor.fork();
  const two = distributor.fork();

  assert.deepEqual(await drain(one), ['hello ', 'world']);
  assert.deepEqual(await drain(two), ['hello ', 'world']);
  assert.equal(distributor.degraded, false);
});

it('should carry a live copy across the switch to the medium', async () => {
  const distributor = new MemoryDistributor(makeSource(['hello ', 'world']));
  const copy = distributor.fork();

  Options.Tune.MaxStashByteLength(distributor, 0);

  assert.deepEqual(await drain(copy), ['hello ', 'world']);
  assert.equal(distributor.degraded, true);
});

it('should serve a copy forked after the switch, from birth', async () => {
  const distributor = new MemoryDistributor(makeSource(['hello ', 'world']));
  const early = distributor.fork().getReader();

  Options.Tune.MaxStashByteLength(distributor, 0);

  await early.read();
  assert.equal(distributor.degraded, true);

  assert.deepEqual(await drain(distributor.fork()), ['hello ', 'world']);
});

it('should error a copy that reads after destroy', async () => {
  const distributor = new MemoryDistributor(makeSource(['hello ']));
  const reader = distributor.fork().getReader();

  await distributor.destroy();

  await assert.rejects(reader.read(), EXPECTED.ABORTED);
});
