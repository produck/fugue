import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  Distributor,
  Options,
  SYMBOL,
} from '@produck/readable-stream-distributor';

import {
  drain,
  makeFamily,
  makeSource,
  settle,
  TestDegradedChunkReader,
  TestDistributor,
} from '#test/baseline.mjs';

const { _I: READER } = SYMBOL.DEGRADED_CHUNK_READER;

const EXPECTED = {
  UNIMPLEMENTED: { message: /must be implemented in the subclass/ },
  TERMINATED: { message: /Distributor has been terminated/ },
};

describe('.fork()', () => {
  it('should throw once terminated', () => {
    const distributor = new TestDistributor(makeSource());
    let forked = 0;

    distributor.addEventListener('fork', () => forked++);
    distributor.terminate();

    const attempt = () => distributor.fork();

    assert.throws(attempt, EXPECTED.TERMINATED);
    assert.equal(forked, 0);
  });

  it('should report the missing DEGRADED_CHUNK_READER_CTOR', () => {
    class Unfinished extends Distributor {}

    const unfinished = new Unfinished(makeSource());
    const attempt = () => unfinished.fork();

    assert.throws(attempt, EXPECTED.UNIMPLEMENTED);
  });

  it('should work as well after a switch', async () => {
    const distributor = new TestDistributor(makeSource(['a']));
    const first = distributor.fork().getReader();

    Options.Tune.MaxStashByteLength(distributor, 0);

    await first.read();
    assert.equal(distributor.degraded, true);

    const second = distributor.fork();

    assert.deepEqual(await drain(second), ['a']);
  });

  it('should dispatch the fork event once', () => {
    const distributor = new TestDistributor(makeSource());
    const forked = [];

    distributor.addEventListener('fork', (event) => {
      forked.push(event.detail.forked);
    });

    const copy = distributor.fork();

    assert.deepEqual(forked, [copy]);
  });

  it('should dispatch warn(degraded-reader-initialize-failed) after the switch', async () => {
    const cause = new Error('the medium refused to open');

    class RefusingInitializeReader extends TestDegradedChunkReader {
      [READER.INITIALIZE]() {
        throw cause;
      }
    }

    const family = makeFamily({ reader: RefusingInitializeReader });
    const distributor = new family.Distributor(makeSource(['a']));
    const warns = [];

    distributor.addEventListener('warn', (event) => warns.push(event.detail));

    Options.Tune.MaxStashByteLength(distributor, 0);
    Options.Asset.noRetry(distributor);

    await assert.rejects(distributor.fork().getReader().read(), cause);
    await settle();

    const atSwitch = warns.length;

    distributor.fork();
    await settle();

    assert.equal(warns.length, atSwitch + 1);
    assert.equal(warns.at(-1).code, 'degraded-reader-initialize-failed');
    assert.equal(warns.at(-1).payload.cause, cause);
  });
});
