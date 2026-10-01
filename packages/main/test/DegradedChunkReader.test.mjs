import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DegradedChunkReader, Options, SYMBOL } from '@produck/fugue';

import {
  makeFamily,
  makeSource,
  settle,
  TestDegradedChunkReader,
  TestDistributor,
} from '#test/baseline.mjs';

import { A, $I } from '../src/Distributor/_Symbol.mjs';
import { A as FORKED } from '../src/Distributor/ForkedReadableStream/_Symbol.mjs';

const { _I: READER } = SYMBOL.DEGRADED_CHUNK_READER;

describe('DegradedChunkReader', () => {
  describe('constructor()', () => {
    it('should take the distributor', () => {
      const distributor = new TestDistributor(makeSource());
      const reader = new TestDegradedChunkReader(distributor);

      assert.ok(reader instanceof DegradedChunkReader);
    });

    describe('>instance', () => {
      it('should start open', () => {
        const distributor = new TestDistributor(makeSource());
        const reader = new TestDegradedChunkReader(distributor);

        assert.equal(reader.closed, false);
      });
    });
  });

  describe('.chunkStash', () => {
    it('should answer the stash of the phase', async () => {
      const distributor = new TestDistributor(makeSource(['a']));
      const forked = distributor.fork();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await forked.getReader().read();

      const reader = forked[FORKED.I.READER];

      assert.equal(reader.chunkStash, distributor[A.$I.STASH]);
    });
  });

  describe('.transferrer', () => {
    it('should answer the medium of the phase', async () => {
      const distributor = new TestDistributor(makeSource(['a']));
      const forked = distributor.fork();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await forked.getReader().read();

      const reader = forked[FORKED.I.READER];

      assert.equal(reader.transferrer, distributor[$I.TRANSFERRER]);
    });
  });

  describe('.closed', () => {
    it('should be false while the copy is still readable', async () => {
      const distributor = new TestDistributor(makeSource(['a']));
      const forked = distributor.fork();
      const reading = forked.getReader();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await reading.read();

      const reader = forked[FORKED.I.READER];

      assert.equal(reader.closed, false);

      const end = await reading.read();

      assert.equal(end.done, true);
    });

    it('should turn true once the source is done', async () => {
      const distributor = new TestDistributor(makeSource(['a']));
      const forked = distributor.fork();
      const reading = forked.getReader();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await reading.read();
      await reading.read();

      const reader = forked[FORKED.I.READER];

      assert.equal(reader.closed, true);
    });

    it('should turn true when the distributor is destroyed', async () => {
      const distributor = new TestDistributor(makeSource(['a']));
      const forked = distributor.fork();
      const reading = forked.getReader();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await reading.read();

      const reader = forked[FORKED.I.READER];

      assert.equal(reader.closed, false);

      await distributor.destroy();

      assert.equal(reader.closed, true);
    });

    it('should close each reader only once when a read is in flight at destroy', async () => {
      const cause = new Error('the medium failed');
      let calls = 0;
      let fail = null;
      let closes = 0;

      class FailingReader extends TestDegradedChunkReader {
        [READER.READ]() {
          if (calls++ === 0) {
            return super[READER.READ]();
          }

          return new Promise((resolve, reject) => {
            fail = () => reject(cause);
          });
        }

        [READER.CLOSE]() {
          closes++;
        }
      }

      const family = makeFamily({ reader: FailingReader });
      const distributor = new family.Distributor(makeSource(['a']));
      const first = distributor.fork().getReader();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await first.read();

      const second = distributor.fork().getReader();

      second.read().catch(() => {});

      await settle();
      await distributor.destroy();

      fail();

      await settle();

      assert.equal(closes, 2);
    });
  });
});
