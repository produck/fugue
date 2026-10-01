import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as Fugue from '@produck/fugue';

import { drain, makeDistributor, settle } from '#test/baseline.mjs';

const { Tune, Get, Asset } = Fugue.Options;

const GIB = (1 << 10) ** 3;
const LIMIT = Number.MAX_SAFE_INTEGER;

const EXPECTED = {
  NON_NEGATIVE_INTEGER: {
    name: 'TypeError',
    message: /Invalid "member", one "non-negative integer" expected\./,
  },
  RETRY_COUNT: {
    name: 'TypeError',
    message:
      /Invalid "member", one "non-negative integer or Infinity" expected\./,
  },
  BOOLEAN: {
    name: 'TypeError',
    message: /Invalid "member", one "boolean" expected\./,
  },
  NUMBER: {
    name: 'RangeError',
    message: /Invalid "member", one "non-negative number" expected\./,
  },
  BIGINT: {
    name: 'TypeError',
    message: /Cannot convert a BigInt value to a number/,
  },
  SYMBOL: {
    name: 'TypeError',
    message: /Cannot convert a Symbol value to a number/,
  },
};

function countGetterReads(distributor, tune, value) {
  let reads = 0;

  tune(distributor, () => {
    reads++;

    return value;
  });

  reads = 0;

  return () => reads;
}

describe('Options', () => {
  describe('::Tune', () => {
    it('should store a plain value as a constant', () => {
      const distributor = makeDistributor();

      Tune.MaxStashByteLength(distributor, 8);

      assert.equal(Get.MaxStashByteLength(distributor), 8);
      assert.equal(Get.MaxStashByteLength(distributor), 8);
    });

    it('should store a function as the getter itself', () => {
      const distributor = makeDistributor();

      const derive = (options) => options.MaxStashByteLength(options) + 1;

      Tune.MaxStashByteLength(distributor, 16);
      Tune.MaxBacklogWarningByteLength(distributor, derive);

      assert.equal(Get.MaxBacklogWarningByteLength(distributor), 17);

      Tune.MaxStashByteLength(distributor, 20);
      assert.equal(Get.MaxBacklogWarningByteLength(distributor), 21);
    });

    it('should refuse a value the item assert rejects', () => {
      const distributor = makeDistributor();

      Tune.MaxStashByteLength(distributor, 4);

      const attempt = () => Tune.MaxStashByteLength(distributor, -1);

      assert.throws(attempt, EXPECTED.NON_NEGATIVE_INTEGER);
      assert.equal(Get.MaxStashByteLength(distributor), 4);
    });

    it('should change only the instance it was given', () => {
      const first = makeDistributor();
      const second = makeDistributor();

      Tune.MaxStashByteLength(first, 4);

      assert.equal(Get.MaxStashByteLength(first), 4);
      assert.equal(Get.MaxStashByteLength(second), GIB);
    });

    describe('::MaxStashByteLength()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.MaxStashByteLength(distributor, -1);

        assert.throws(attempt, EXPECTED.NON_NEGATIVE_INTEGER);
      });

      it('should refuse a fractional value', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.MaxStashByteLength(distributor, 1.5);

        assert.throws(attempt, EXPECTED.NON_NEGATIVE_INTEGER);
      });
    });

    describe('::MaxBacklogWarningByteLength()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.MaxBacklogWarningByteLength(distributor, -1);

        assert.throws(attempt, EXPECTED.NON_NEGATIVE_INTEGER);
      });
    });

    describe('::DegradeOnStashFullAndDone()', () => {
      it('should refuse a value that is not a boolean', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.DegradeOnStashFullAndDone(distributor, 1);

        assert.throws(attempt, EXPECTED.BOOLEAN);
      });

      it('should accept a boolean', () => {
        const distributor = makeDistributor();

        Tune.DegradeOnStashFullAndDone(distributor, true);
        assert.equal(Get.DegradeOnStashFullAndDone(distributor), true);

        Tune.DegradeOnStashFullAndDone(distributor, false);
        assert.equal(Get.DegradeOnStashFullAndDone(distributor), false);
      });
    });

    describe('::ForkHighWaterMark()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.ForkHighWaterMark(distributor, -1);

        assert.throws(attempt, EXPECTED.NUMBER);
      });

      it('should refuse NaN', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.ForkHighWaterMark(distributor, NaN);

        assert.throws(attempt, EXPECTED.NUMBER);
      });

      it('should refuse a BigInt and a Symbol', () => {
        const distributor = makeDistributor();
        const fromBigInt = () => Tune.ForkHighWaterMark(distributor, 10n);
        const fromSymbol = () =>
          Tune.ForkHighWaterMark(distributor, Symbol('hwm'));

        assert.throws(fromBigInt, EXPECTED.BIGINT);
        assert.throws(fromSymbol, EXPECTED.SYMBOL);
      });

      it('should pass a numeric string and a boolean through', () => {
        const distributor = makeDistributor();

        Tune.ForkHighWaterMark(distributor, '3');
        assert.equal(Get.ForkHighWaterMark(distributor), '3');

        Tune.ForkHighWaterMark(distributor, true);
        assert.equal(Get.ForkHighWaterMark(distributor), true);
      });
    });
    describe('::MaxDumpRetryCount()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.MaxDumpRetryCount(distributor, -1);

        assert.throws(attempt, EXPECTED.RETRY_COUNT);
      });

      it('should refuse a fractional value', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.MaxDumpRetryCount(distributor, 1.5);

        assert.throws(attempt, EXPECTED.RETRY_COUNT);
      });

      it('should accept Infinity', () => {
        const distributor = makeDistributor();

        Tune.MaxDumpRetryCount(distributor, Infinity);

        assert.equal(Get.MaxDumpRetryCount(distributor), Infinity);
      });
    });

    describe('::MaxDrainRetryCount()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.MaxDrainRetryCount(distributor, -1);

        assert.throws(attempt, EXPECTED.RETRY_COUNT);
      });

      it('should refuse a fractional value', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.MaxDrainRetryCount(distributor, 1.5);

        assert.throws(attempt, EXPECTED.RETRY_COUNT);
      });
    });

    describe('::DumpRetryInterval()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.DumpRetryInterval(distributor, -1);

        assert.throws(attempt, EXPECTED.NON_NEGATIVE_INTEGER);
      });

      it('should accept zero', () => {
        const distributor = makeDistributor();

        Tune.DumpRetryInterval(distributor, 0);

        assert.equal(Get.DumpRetryInterval(distributor), 0);
      });
    });

    describe('::DrainRetryInterval()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.DrainRetryInterval(distributor, -1);

        assert.throws(attempt, EXPECTED.NON_NEGATIVE_INTEGER);
      });
    });
  });

  describe('::Get', () => {
    describe('::MaxStashByteLength()', () => {
      it('should default to 1 GiB', () => {
        assert.equal(Get.MaxStashByteLength(makeDistributor()), GIB);
      });

      it('should be read on every pull', async () => {
        const chunks = ['a', 'b', 'c'];
        const distributor = makeDistributor(chunks);
        const tune = Tune.MaxStashByteLength;
        const reads = countGetterReads(distributor, tune, LIMIT);
        const forked = distributor.fork();

        assert.deepEqual(await drain(forked), chunks);
        assert.equal(reads(), chunks.length + 1);
      });

      it('should stop being read once the phase has flipped', async () => {
        const distributor = makeDistributor(['a', 'b', 'c']);
        const tune = Tune.MaxStashByteLength;
        const reads = countGetterReads(distributor, tune, 0);
        const reader = distributor.fork().getReader();

        Tune.MaxBacklogWarningByteLength(distributor, LIMIT);

        await reader.read();

        assert.equal(distributor.degraded, true);

        const atSwitch = reads();

        await reader.read();
        await reader.read();

        assert.equal(reads(), atSwitch);
      });
    });

    describe('::MaxBacklogWarningByteLength()', () => {
      it('should default to what MaxStashByteLength answers', () => {
        assert.equal(Get.MaxBacklogWarningByteLength(makeDistributor()), GIB);
      });

      it('should follow MaxStashByteLength when it moves', () => {
        const distributor = makeDistributor();

        Tune.MaxStashByteLength(distributor, 5);
        assert.equal(Get.MaxBacklogWarningByteLength(distributor), 5);

        Tune.MaxStashByteLength(distributor, 9);
        assert.equal(Get.MaxBacklogWarningByteLength(distributor), 9);
      });

      it('should be read after every write to the medium', async () => {
        const distributor = makeDistributor(['a', 'b', 'c']);
        const tune = Tune.MaxBacklogWarningByteLength;
        const reads = countGetterReads(distributor, tune, LIMIT);
        const reader = distributor.fork().getReader();

        Tune.MaxStashByteLength(distributor, 0);

        await reader.read();

        const atSwitch = reads();

        await reader.read();
        assert.equal(reads(), atSwitch + 1);

        await reader.read();
        assert.equal(reads(), atSwitch + 2);
      });
    });

    describe('::DegradeOnStashFullAndDone()', () => {
      it('should default to false', () => {
        assert.equal(Get.DegradeOnStashFullAndDone(makeDistributor()), false);
      });

      it('should not be read while over the limit but not done', async () => {
        const distributor = makeDistributor(['a', 'b']);
        const tune = Tune.DegradeOnStashFullAndDone;
        const reads = countGetterReads(distributor, tune, true);
        const reader = distributor.fork().getReader();

        Tune.MaxStashByteLength(distributor, 0);

        await reader.read();

        assert.equal(distributor.degraded, true);
        assert.equal(reads(), 0);
      });

      it('should be read once over the limit and done', async () => {
        const distributor = makeDistributor(['a']);
        const tune = Tune.DegradeOnStashFullAndDone;
        const reads = countGetterReads(distributor, tune, true);
        const reader = distributor.fork().getReader();

        Tune.MaxStashByteLength(distributor, 1);

        await reader.read();
        assert.equal(distributor.degraded, false);

        Tune.MaxStashByteLength(distributor, 0);

        await reader.read();

        assert.equal(distributor.degraded, true);
        assert.equal(reads(), 1);
      });
    });

    describe('::ForkHighWaterMark()', () => {
      it('should default to 1', () => {
        assert.equal(Get.ForkHighWaterMark(makeDistributor()), 1);
      });

      it('should be read once per fork, at construction', () => {
        const distributor = makeDistributor();
        const reads = countGetterReads(distributor, Tune.ForkHighWaterMark, 1);

        distributor.fork();
        assert.equal(reads(), 1);

        distributor.fork();
        assert.equal(reads(), 2);
      });

      it('should be the queue depth of a fork', async () => {
        const distributor = makeDistributor(['a', 'b', 'c', 'd', 'e']);
        const tune = Tune.MaxStashByteLength;
        const reads = countGetterReads(distributor, tune, LIMIT);

        Tune.ForkHighWaterMark(distributor, 3);

        const reader = distributor.fork().getReader();

        await settle();
        assert.equal(reads(), 3);

        await reader.read();
        await settle();
        assert.equal(reads(), 4);

        await reader.cancel();
      });

      it('should leave already forked copies on their value', async () => {
        const distributor = makeDistributor(['a', 'b', 'c', 'd', 'e']);

        Tune.ForkHighWaterMark(distributor, 1);

        const tune = Tune.MaxStashByteLength;
        const reads = countGetterReads(distributor, tune, LIMIT);
        const reader = distributor.fork().getReader();

        await settle();
        assert.equal(reads(), 1);

        Tune.ForkHighWaterMark(distributor, 5);

        await reader.read();
        await settle();
        assert.equal(reads(), 2);

        await reader.cancel();
      });

      it('should be answered raw, without normalisation', () => {
        const distributor = makeDistributor();

        Tune.ForkHighWaterMark(distributor, '3');

        assert.equal(Get.ForkHighWaterMark(distributor), '3');
      });
    });

    describe('::MaxDumpRetryCount()', () => {
      it('should default to Infinity', () => {
        assert.equal(Get.MaxDumpRetryCount(makeDistributor()), Infinity);
      });
    });

    describe('::MaxDrainRetryCount()', () => {
      it('should default to Infinity', () => {
        assert.equal(Get.MaxDrainRetryCount(makeDistributor()), Infinity);
      });
    });

    describe('::DumpRetryInterval()', () => {
      it('should default to 1 second', () => {
        assert.equal(Get.DumpRetryInterval(makeDistributor()), 1e3);
      });
    });

    describe('::DrainRetryInterval()', () => {
      it('should default to 1 second', () => {
        assert.equal(Get.DrainRetryInterval(makeDistributor()), 1e3);
      });
    });
  });

  describe('::Asset', () => {
    it('should answer the retry counts of one side', () => {
      const distributor = makeDistributor();

      Asset.noInitializeRetry(distributor);
      assert.equal(Get.MaxInitializeRetryCount(distributor), 0);

      Asset.unlimitedInitializeRetry(distributor);
      assert.equal(Get.MaxInitializeRetryCount(distributor), Infinity);

      Asset.noDumpRetry(distributor);
      assert.equal(Get.MaxInitializeRetryCount(distributor), Infinity);
      assert.equal(Get.MaxDumpRetryCount(distributor), 0);
      assert.equal(Get.MaxDrainRetryCount(distributor), Infinity);

      Asset.unlimitedDumpRetry(distributor);
      assert.equal(Get.MaxDumpRetryCount(distributor), Infinity);

      Asset.noDrainRetry(distributor);
      assert.equal(Get.MaxDumpRetryCount(distributor), Infinity);
      assert.equal(Get.MaxDrainRetryCount(distributor), 0);

      Asset.unlimitedDrainRetry(distributor);
      assert.equal(Get.MaxDrainRetryCount(distributor), Infinity);
    });

    it('should answer the retry counts of both sides', () => {
      const distributor = makeDistributor();

      Asset.noRetry(distributor);
      assert.equal(Get.MaxInitializeRetryCount(distributor), 0);
      assert.equal(Get.MaxDumpRetryCount(distributor), 0);
      assert.equal(Get.MaxDrainRetryCount(distributor), 0);

      Asset.unlimitedRetry(distributor);
      assert.equal(Get.MaxInitializeRetryCount(distributor), Infinity);
      assert.equal(Get.MaxDumpRetryCount(distributor), Infinity);
      assert.equal(Get.MaxDrainRetryCount(distributor), Infinity);
    });
  });
});
