import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as Fugue from '@produck/fugue';

import { drain, makeDistributor, settle } from '#test/baseline.mjs';

const { Tune, Get, Preset } = Fugue.Options;

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

      Tune.MaxChunkStashByteLength(distributor, 8);

      assert.equal(Get.MaxChunkStashByteLength(distributor), 8);
      assert.equal(Get.MaxChunkStashByteLength(distributor), 8);
    });

    it('should store a function as the getter itself', () => {
      const distributor = makeDistributor();

      const derive = (options) => options.MaxChunkStashByteLength(options) + 1;

      Tune.MaxChunkStashByteLength(distributor, 16);
      Tune.MaxTransferrerBacklogWarningByteLength(distributor, derive);

      assert.equal(Get.MaxTransferrerBacklogWarningByteLength(distributor), 17);

      Tune.MaxChunkStashByteLength(distributor, 20);
      assert.equal(Get.MaxTransferrerBacklogWarningByteLength(distributor), 21);
    });

    it('should refuse a value the item assert rejects', () => {
      const distributor = makeDistributor();

      Tune.MaxChunkStashByteLength(distributor, 4);

      const attempt = () => Tune.MaxChunkStashByteLength(distributor, -1);

      assert.throws(attempt, EXPECTED.NON_NEGATIVE_INTEGER);
      assert.equal(Get.MaxChunkStashByteLength(distributor), 4);
    });

    it('should change only the instance it was given', () => {
      const first = makeDistributor();
      const second = makeDistributor();

      Tune.MaxChunkStashByteLength(first, 4);

      assert.equal(Get.MaxChunkStashByteLength(first), 4);
      assert.equal(Get.MaxChunkStashByteLength(second), GIB);
    });

    describe('::MaxChunkStashByteLength()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.MaxChunkStashByteLength(distributor, -1);

        assert.throws(attempt, EXPECTED.NON_NEGATIVE_INTEGER);
      });

      it('should refuse a fractional value', () => {
        const distributor = makeDistributor();
        const attempt = () => Tune.MaxChunkStashByteLength(distributor, 1.5);

        assert.throws(attempt, EXPECTED.NON_NEGATIVE_INTEGER);
      });
    });

    describe('::MaxTransferrerBacklogWarningByteLength()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () =>
          Tune.MaxTransferrerBacklogWarningByteLength(distributor, -1);

        assert.throws(attempt, EXPECTED.NON_NEGATIVE_INTEGER);
      });
    });

    describe('::DegradeOnChunkStashFullAndDone()', () => {
      it('should refuse a value that is not a boolean', () => {
        const distributor = makeDistributor();
        const attempt = () =>
          Tune.DegradeOnChunkStashFullAndDone(distributor, 1);

        assert.throws(attempt, EXPECTED.BOOLEAN);
      });

      it('should accept a boolean', () => {
        const distributor = makeDistributor();

        Tune.DegradeOnChunkStashFullAndDone(distributor, true);
        assert.equal(Get.DegradeOnChunkStashFullAndDone(distributor), true);

        Tune.DegradeOnChunkStashFullAndDone(distributor, false);
        assert.equal(Get.DegradeOnChunkStashFullAndDone(distributor), false);
      });
    });

    describe('::ForkedReadableStreamHighWaterMark()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () =>
          Tune.ForkedReadableStreamHighWaterMark(distributor, -1);

        assert.throws(attempt, EXPECTED.NUMBER);
      });

      it('should refuse NaN', () => {
        const distributor = makeDistributor();
        const attempt = () =>
          Tune.ForkedReadableStreamHighWaterMark(distributor, NaN);

        assert.throws(attempt, EXPECTED.NUMBER);
      });

      it('should refuse a BigInt and a Symbol', () => {
        const distributor = makeDistributor();
        const fromBigInt = () =>
          Tune.ForkedReadableStreamHighWaterMark(distributor, 10n);
        const fromSymbol = () =>
          Tune.ForkedReadableStreamHighWaterMark(distributor, Symbol('hwm'));

        assert.throws(fromBigInt, EXPECTED.BIGINT);
        assert.throws(fromSymbol, EXPECTED.SYMBOL);
      });

      it('should pass a numeric string and a boolean through', () => {
        const distributor = makeDistributor();

        Tune.ForkedReadableStreamHighWaterMark(distributor, '3');
        assert.equal(Get.ForkedReadableStreamHighWaterMark(distributor), '3');

        Tune.ForkedReadableStreamHighWaterMark(distributor, true);
        assert.equal(Get.ForkedReadableStreamHighWaterMark(distributor), true);
      });
    });
    describe('::MaxTransferrerDumpRetryCount()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () =>
          Tune.MaxTransferrerDumpRetryCount(distributor, -1);

        assert.throws(attempt, EXPECTED.RETRY_COUNT);
      });

      it('should refuse a fractional value', () => {
        const distributor = makeDistributor();
        const attempt = () =>
          Tune.MaxTransferrerDumpRetryCount(distributor, 1.5);

        assert.throws(attempt, EXPECTED.RETRY_COUNT);
      });

      it('should accept Infinity', () => {
        const distributor = makeDistributor();

        Tune.MaxTransferrerDumpRetryCount(distributor, Infinity);

        assert.equal(Get.MaxTransferrerDumpRetryCount(distributor), Infinity);
      });
    });

    describe('::MaxTransferrerDrainRetryCount()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () =>
          Tune.MaxTransferrerDrainRetryCount(distributor, -1);

        assert.throws(attempt, EXPECTED.RETRY_COUNT);
      });

      it('should refuse a fractional value', () => {
        const distributor = makeDistributor();
        const attempt = () =>
          Tune.MaxTransferrerDrainRetryCount(distributor, 1.5);

        assert.throws(attempt, EXPECTED.RETRY_COUNT);
      });
    });

    describe('::TransferrerDumpRetryInterval()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () =>
          Tune.TransferrerDumpRetryInterval(distributor, -1);

        assert.throws(attempt, EXPECTED.NON_NEGATIVE_INTEGER);
      });

      it('should accept zero', () => {
        const distributor = makeDistributor();

        Tune.TransferrerDumpRetryInterval(distributor, 0);

        assert.equal(Get.TransferrerDumpRetryInterval(distributor), 0);
      });
    });

    describe('::TransferrerDrainRetryInterval()', () => {
      it('should refuse a negative value', () => {
        const distributor = makeDistributor();
        const attempt = () =>
          Tune.TransferrerDrainRetryInterval(distributor, -1);

        assert.throws(attempt, EXPECTED.NON_NEGATIVE_INTEGER);
      });
    });
  });

  describe('::Get', () => {
    describe('::MaxChunkStashByteLength()', () => {
      it('should default to 1 GiB', () => {
        assert.equal(Get.MaxChunkStashByteLength(makeDistributor()), GIB);
      });

      it('should be read on every pull', async () => {
        const chunks = ['a', 'b', 'c'];
        const distributor = makeDistributor(chunks);
        const tune = Tune.MaxChunkStashByteLength;
        const reads = countGetterReads(distributor, tune, LIMIT);
        const forked = distributor.fork();

        assert.deepEqual(await drain(forked), chunks);
        assert.equal(reads(), chunks.length + 1);
      });

      it('should stop being read once the phase has flipped', async () => {
        const distributor = makeDistributor(['a', 'b', 'c']);
        const tune = Tune.MaxChunkStashByteLength;
        const reads = countGetterReads(distributor, tune, 0);
        const reader = distributor.fork().getReader();

        Tune.MaxTransferrerBacklogWarningByteLength(distributor, LIMIT);

        await reader.read();

        assert.equal(distributor.degraded, true);

        const atSwitch = reads();

        await reader.read();
        await reader.read();

        assert.equal(reads(), atSwitch);
      });
    });

    describe('::MaxTransferrerBacklogWarningByteLength()', () => {
      it('should default to what MaxChunkStashByteLength answers', () => {
        assert.equal(
          Get.MaxTransferrerBacklogWarningByteLength(makeDistributor()),
          GIB,
        );
      });

      it('should follow MaxChunkStashByteLength when it moves', () => {
        const distributor = makeDistributor();

        Tune.MaxChunkStashByteLength(distributor, 5);
        assert.equal(
          Get.MaxTransferrerBacklogWarningByteLength(distributor),
          5,
        );

        Tune.MaxChunkStashByteLength(distributor, 9);
        assert.equal(
          Get.MaxTransferrerBacklogWarningByteLength(distributor),
          9,
        );
      });

      it('should be read after every write to the medium', async () => {
        const distributor = makeDistributor(['a', 'b', 'c']);
        const tune = Tune.MaxTransferrerBacklogWarningByteLength;
        const reads = countGetterReads(distributor, tune, LIMIT);
        const reader = distributor.fork().getReader();

        Tune.MaxChunkStashByteLength(distributor, 0);

        await reader.read();

        const atSwitch = reads();

        await reader.read();
        assert.equal(reads(), atSwitch + 1);

        await reader.read();
        assert.equal(reads(), atSwitch + 2);
      });
    });

    describe('::DegradeOnChunkStashFullAndDone()', () => {
      it('should default to false', () => {
        assert.equal(
          Get.DegradeOnChunkStashFullAndDone(makeDistributor()),
          false,
        );
      });

      it('should be read on every pull', async () => {
        const chunks = ['a', 'b', 'c'];
        const distributor = makeDistributor(chunks);
        const tune = Tune.DegradeOnChunkStashFullAndDone;
        const reads = countGetterReads(distributor, tune, true);
        const forked = distributor.fork();

        assert.deepEqual(await drain(forked), chunks);
        assert.equal(reads(), chunks.length + 1);
      });
    });

    describe('::ForkedReadableStreamHighWaterMark()', () => {
      it('should default to 1', () => {
        assert.equal(
          Get.ForkedReadableStreamHighWaterMark(makeDistributor()),
          1,
        );
      });

      it('should be read once per fork, at construction', () => {
        const distributor = makeDistributor();
        const reads = countGetterReads(
          distributor,
          Tune.ForkedReadableStreamHighWaterMark,
          1,
        );

        distributor.fork();
        assert.equal(reads(), 1);

        distributor.fork();
        assert.equal(reads(), 2);
      });

      it('should be the queue depth of a fork', async () => {
        const distributor = makeDistributor(['a', 'b', 'c', 'd', 'e']);
        const tune = Tune.MaxChunkStashByteLength;
        const reads = countGetterReads(distributor, tune, LIMIT);

        Tune.ForkedReadableStreamHighWaterMark(distributor, 3);

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

        Tune.ForkedReadableStreamHighWaterMark(distributor, 1);

        const tune = Tune.MaxChunkStashByteLength;
        const reads = countGetterReads(distributor, tune, LIMIT);
        const reader = distributor.fork().getReader();

        await settle();
        assert.equal(reads(), 1);

        Tune.ForkedReadableStreamHighWaterMark(distributor, 5);

        await reader.read();
        await settle();
        assert.equal(reads(), 2);

        await reader.cancel();
      });

      it('should be answered raw, without normalisation', () => {
        const distributor = makeDistributor();

        Tune.ForkedReadableStreamHighWaterMark(distributor, '3');

        assert.equal(Get.ForkedReadableStreamHighWaterMark(distributor), '3');
      });
    });

    describe('::MaxTransferrerDumpRetryCount()', () => {
      it('should default to Infinity', () => {
        assert.equal(
          Get.MaxTransferrerDumpRetryCount(makeDistributor()),
          Infinity,
        );
      });
    });

    describe('::MaxTransferrerDrainRetryCount()', () => {
      it('should default to Infinity', () => {
        assert.equal(
          Get.MaxTransferrerDrainRetryCount(makeDistributor()),
          Infinity,
        );
      });
    });

    describe('::TransferrerDumpRetryInterval()', () => {
      it('should default to 1 second', () => {
        assert.equal(Get.TransferrerDumpRetryInterval(makeDistributor()), 1e3);
      });
    });

    describe('::TransferrerDrainRetryInterval()', () => {
      it('should default to 1 second', () => {
        assert.equal(Get.TransferrerDrainRetryInterval(makeDistributor()), 1e3);
      });
    });
  });

  describe('::Preset', () => {
    it('should answer the retry counts of one side', () => {
      const distributor = makeDistributor();

      Preset.noChunkReaderInitializeRetry(distributor);
      assert.equal(Get.MaxChunkReaderInitializeRetryCount(distributor), 0);

      Preset.unlimitedChunkReaderInitializeRetry(distributor);
      assert.equal(
        Get.MaxChunkReaderInitializeRetryCount(distributor),
        Infinity,
      );

      Preset.noTransferrerInitializeRetry(distributor);
      assert.equal(Get.MaxTransferrerInitializeRetryCount(distributor), 0);
      assert.equal(
        Get.MaxChunkReaderInitializeRetryCount(distributor),
        Infinity,
      );
      assert.equal(Get.MaxTransferrerDumpRetryCount(distributor), Infinity);

      Preset.unlimitedTransferrerInitializeRetry(distributor);
      assert.equal(
        Get.MaxTransferrerInitializeRetryCount(distributor),
        Infinity,
      );

      Preset.noTransferrerDumpRetry(distributor);
      assert.equal(
        Get.MaxChunkReaderInitializeRetryCount(distributor),
        Infinity,
      );
      assert.equal(Get.MaxTransferrerDumpRetryCount(distributor), 0);
      assert.equal(Get.MaxTransferrerDrainRetryCount(distributor), Infinity);

      Preset.unlimitedTransferrerDumpRetry(distributor);
      assert.equal(Get.MaxTransferrerDumpRetryCount(distributor), Infinity);

      Preset.noTransferrerDrainRetry(distributor);
      assert.equal(Get.MaxTransferrerDumpRetryCount(distributor), Infinity);
      assert.equal(Get.MaxTransferrerDrainRetryCount(distributor), 0);

      Preset.unlimitedTransferrerDrainRetry(distributor);
      assert.equal(Get.MaxTransferrerDrainRetryCount(distributor), Infinity);
    });

    it('should answer the retry counts of both sides', () => {
      const distributor = makeDistributor();

      Preset.noRetry(distributor);
      assert.equal(Get.MaxChunkReaderInitializeRetryCount(distributor), 0);
      assert.equal(Get.MaxTransferrerInitializeRetryCount(distributor), 0);
      assert.equal(Get.MaxTransferrerDumpRetryCount(distributor), 0);
      assert.equal(Get.MaxTransferrerDrainRetryCount(distributor), 0);

      Preset.unlimitedRetry(distributor);
      assert.equal(
        Get.MaxChunkReaderInitializeRetryCount(distributor),
        Infinity,
      );
      assert.equal(
        Get.MaxTransferrerInitializeRetryCount(distributor),
        Infinity,
      );
      assert.equal(Get.MaxTransferrerDumpRetryCount(distributor), Infinity);
      assert.equal(Get.MaxTransferrerDrainRetryCount(distributor), Infinity);
    });
  });
});
