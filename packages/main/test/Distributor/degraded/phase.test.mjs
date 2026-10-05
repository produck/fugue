import assert from 'node:assert/strict';
import { it } from 'node:test';

import * as Fugue from '@produck/fugue';

import {
  makeFamily,
  makeSource,
  TestDegradedChunkReader,
  TestDistributor,
  TestTransferrer,
} from '#test/baseline.mjs';

const { DEGRADED_CHUNK_READER_CTOR } = Fugue.SYMBOL.DISTRIBUTOR._S;
const { _I: READER } = Fugue.SYMBOL.DEGRADED_CHUNK_READER;

const EXPECTED = {
  UNIMPLEMENTED: { message: /must be implemented in the subclass/ },
};

it('should be false while the stash holds the data', async () => {
  const distributor = new TestDistributor(makeSource(['a', 'b']));
  const reader = distributor.fork().getReader();

  Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 1024);

  await reader.read();

  assert.equal(distributor.degraded, false);
});

it('should turn true on the pull that crossed MaxChunkStashByteLength', async () => {
  const distributor = new TestDistributor(makeSource(['a', 'b']));
  const reader = distributor.fork().getReader();

  Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 1);

  await reader.read();
  assert.equal(distributor.degraded, false);

  await reader.read();
  assert.equal(distributor.degraded, true);
});

it('should turn true at the limit even when the source is done', async () => {
  const distributor = new TestDistributor(makeSource(['a']));
  const reader = distributor.fork().getReader();

  Fugue.Options.Tune.DegradeOnChunkStashFullAndDone(distributor, true);
  Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 1);

  await reader.read();
  assert.equal(distributor.degraded, false);

  Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 0);

  await reader.read();
  assert.equal(distributor.degraded, true);
});

it('should follow DegradeOnChunkStashFullAndDone for a full, ended stash', async () => {
  const distributor = new TestDistributor(makeSource(['a']));
  const reader = distributor.fork().getReader();

  Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 1);

  await reader.read();

  Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 0);

  const end = await reader.read();

  assert.equal(distributor.degraded, false);
  assert.equal(end.done, true);
});

it('should stay false, rejecting the read, when the family is unfinished', async () => {
  class UnfinishedReader extends Fugue.DegradedChunkReader {
    [READER.INITIALIZE]() {}

    [READER.SEEK]() {
      return false;
    }

    [READER.READ]() {
      return { done: true, value: undefined };
    }

    [READER.CLOSE]() {}
  }

  class UnfinishedDistributor extends Fugue.Distributor {
    static [DEGRADED_CHUNK_READER_CTOR] = UnfinishedReader;
  }

  const distributor = new UnfinishedDistributor(makeSource(['a', 'b']));
  const reader = distributor.fork().getReader();
  const warns = [];

  distributor.addEventListener('warn', (event) => warns.push(event.detail));

  Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 0);

  await assert.rejects(reader.read(), EXPECTED.UNIMPLEMENTED);
  assert.equal(distributor.degraded, false);
  assert.deepEqual(warns, []);
});

it('should stay false, rejecting the read, when the host constructor throws', async () => {
  const cause = new Error('the medium refused to open');

  class RefusingCtorTransferrer extends TestTransferrer {
    constructor() {
      super();
      throw cause;
    }
  }

  const family = makeFamily({ medium: RefusingCtorTransferrer });
  const distributor = new family.Distributor(makeSource(['a']));
  const reader = distributor.fork().getReader();
  const warns = [];

  distributor.addEventListener('warn', (event) => warns.push(event.detail));

  Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 0);

  await assert.rejects(reader.read(), cause);
  assert.equal(distributor.degraded, false);
  assert.deepEqual(warns, []);
});

it('should reject the read that needs the medium when the medium refused to open', async () => {
  const cause = new Error('the medium refused to open');
  let reads = 0;

  class RefusingOpenReader extends TestDegradedChunkReader {
    [READER.INITIALIZE]() {
      throw cause;
    }

    [READER.READ](...args) {
      reads += 1;

      return super[READER.READ](...args);
    }
  }

  const family = makeFamily({ reader: RefusingOpenReader });
  const distributor = new family.Distributor(makeSource(['a']));
  const reader = distributor.fork().getReader();

  Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 0);
  Fugue.Options.Preset.noRetry(distributor);

  await assert.rejects(reader.read(), cause);
  assert.equal(distributor.degraded, true);
  assert.equal(reads, 0);
});
