import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Options, SYMBOL } from '@produck/fugue';

import {
  drain,
  makeFamily,
  makeSource,
  settle,
  TestDegradedChunkReader,
  TestDistributor,
  TestTransferrer,
} from '#test/baseline.mjs';

const { _I: READER } = SYMBOL.DEGRADED_CHUNK_READER;
const { _I: TRANSFERRER } = SYMBOL.TRANSFERRER;

describe('ForkedReadableStream', () => {
  it('should be a ReadableStream', () => {
    const distributor = new TestDistributor(makeSource());

    assert.ok(distributor.fork() instanceof ReadableStream);
  });

  describe('.getReader()', () => {
    describe('>reader', () => {
      it('should keep the prefix, then reject with the cause of a failed dump', async () => {
        const cause = new Error('the medium failed');

        class FailingTransferrer extends TestTransferrer {
          async [TRANSFERRER.DUMP]() {
            throw cause;
          }
        }

        const family = makeFamily({ medium: FailingTransferrer });
        const distributor = new family.Distributor(makeSource(['a']));
        const reader = distributor.fork().getReader();

        Options.Tune.MaxStashByteLength(distributor, 0);
        Options.Asset.noRetry(distributor);

        assert.equal((await reader.read()).value.toString(), 'a');
        await assert.rejects(reader.read(), cause);
      });

      it('should drain the queue, then reject with the cause of a failed write', async () => {
        const cause = new Error('the medium failed');

        class FailingTransferrer extends TestTransferrer {
          async [TRANSFERRER.WRITE]() {
            throw cause;
          }
        }

        const family = makeFamily({ medium: FailingTransferrer });
        const distributor = new family.Distributor(makeSource(['a', 'b']));
        const reader = distributor.fork().getReader();

        Options.Tune.MaxStashByteLength(distributor, 0);
        Options.Tune.MaxBacklogWarningByteLength(distributor, 1024);
        Options.Asset.noRetry(distributor);

        assert.equal((await reader.read()).value.toString(), 'a');
        assert.equal((await reader.read()).value.toString(), 'b');
        await assert.rejects(reader.read(), cause);
      });

      it('should yield every chunk of the source once, in order', async () => {
        const distributor = new TestDistributor(makeSource(['a', 'b', 'c']));

        assert.deepEqual(await drain(distributor.fork()), ['a', 'b', 'c']);
      });

      it('should carry on without a gap across a switch', async () => {
        const distributor = new TestDistributor(makeSource(['a', 'b', 'c']));
        const forked = distributor.fork();
        const reader = forked.getReader();

        Options.Tune.MaxStashByteLength(distributor, 0);

        const first = await reader.read();

        assert.equal(distributor.degraded, true);
        assert.equal(first.value.toString(), 'a');

        reader.releaseLock();

        assert.deepEqual(await drain(forked), ['b', 'c']);
      });

      it('should hold the first chunk until the medium is ready', async () => {
        class NeverReadyReader extends TestDegradedChunkReader {
          [READER.INITIALIZE]() {
            return new Promise(() => {});
          }
        }

        const family = makeFamily({ reader: NeverReadyReader });
        const distributor = new family.Distributor(makeSource(['a', 'b']));
        let settled = false;

        distributor.fork().getReader().read();
        Options.Tune.MaxStashByteLength(distributor, 0);

        await settle();

        const second = distributor.fork().getReader();

        second.read().then(() => {
          settled = true;
        });

        await settle();

        assert.equal(distributor.degraded, true);
        assert.equal(settled, false);
      });

      it('should close once the source is done', async () => {
        const distributor = new TestDistributor(makeSource(['a']));
        const reader = distributor.fork().getReader();
        const first = await reader.read();

        assert.equal(first.done, false);
        assert.deepEqual(await reader.read(), {
          done: true,
          value: undefined,
        });
      });

      it('should reject with the source error itself', async () => {
        const cases = [new Error('the source failed'), 'boom'];

        for (const cause of cases) {
          const source = new ReadableStream({
            pull() {
              throw cause;
            },
          });
          const distributor = new TestDistributor(source);
          const thrown = await drain(distributor.fork()).catch((t) => t);

          assert.equal(thrown, cause);
        }
      });

      it('should dispatch warn(source-read-failed) when the source fails', async () => {
        const cause = new Error('the source failed');
        const warns = [];
        const source = new ReadableStream({
          pull() {
            throw cause;
          },
        });
        const distributor = new TestDistributor(source);

        distributor.addEventListener('warn', (event) => {
          warns.push(event.detail);
        });

        await assert.rejects(drain(distributor.fork()), cause);

        assert.deepEqual(
          warns.map((warn) => warn.code),
          ['source-read-failed'],
        );
        assert.equal(warns[0].payload.cause, cause);
      });

      it('should keep the prefix of every copy when the source breaks', async () => {
        const cause = new Error('the source failed');
        const warns = [];
        let pulls = 0;
        const source = new ReadableStream({
          pull(controller) {
            if (pulls++ === 0) {
              controller.enqueue(Buffer.from('a'));

              return;
            }

            throw cause;
          },
        });
        const distributor = new TestDistributor(source);
        const first = distributor.fork().getReader();
        const second = distributor.fork().getReader();

        distributor.addEventListener('warn', (event) => {
          warns.push(event.detail);
        });

        assert.equal((await first.read()).value.toString(), 'a');
        const failureOfFirst = await first.read().catch((thrown) => thrown);

        assert.equal((await second.read()).value.toString(), 'a');
        const failureOfSecond = await second.read().catch((thrown) => thrown);

        assert.equal(failureOfFirst, cause);
        assert.equal(failureOfSecond, cause);

        assert.deepEqual(
          warns.map((warn) => warn.code),
          ['source-read-failed', 'source-read-failed'],
        );
        assert.equal(warns[0].payload.cause, cause);
        assert.equal(warns[1].payload.cause, cause);
      });

      it('should reject the read when an option getter throws', async () => {
        const cause = new Error('the getter failed');
        const distributor = new TestDistributor(makeSource(['a']));
        const warns = [];
        const reader = distributor.fork().getReader();
        let reads = 0;

        distributor.addEventListener('warn', (event) => {
          warns.push(event.detail);
        });

        Options.Tune.MaxStashByteLength(distributor, () => {
          if (reads++ === 0) {
            return 8;
          }

          throw cause;
        });

        await assert.rejects(reader.read(), cause);
        assert.deepEqual(warns, []);
      });

      it('should dispatch warn(degraded-reader-read-failed) on a failed read', async () => {
        const cause = new Error('the medium failed');

        class BreakingReader extends TestDegradedChunkReader {
          [READER.READ]() {
            const result = super[READER.READ]();

            if (result.value?.toString() === 'b') {
              throw cause;
            }

            return result;
          }
        }

        const family = makeFamily({ reader: BreakingReader });
        const distributor = new family.Distributor(makeSource(['a', 'b']));
        const warns = [];
        const reader = distributor.fork().getReader();

        distributor.addEventListener('warn', (event) => {
          warns.push(event.detail);
        });

        Options.Tune.MaxStashByteLength(distributor, 0);
        Options.Tune.MaxBacklogWarningByteLength(distributor, 1024);

        await reader.read();
        await assert.rejects(reader.read(), cause);

        assert.deepEqual(
          warns.map((warn) => warn.code),
          ['degraded-reader-read-failed'],
        );
        assert.equal(warns[0].payload.cause, cause);
      });

      it('should dispatch warn(degraded-reader-seek-failed) on a failed seek', async () => {
        const cause = new Error('the medium seek failed');

        class UnseekableReader extends TestDegradedChunkReader {
          [READER.SEEK]() {
            throw cause;
          }
        }

        const family = makeFamily({ reader: UnseekableReader });
        const distributor = new family.Distributor(makeSource(['a', 'b']));
        const warns = [];
        const reader = distributor.fork().getReader();

        distributor.addEventListener('warn', (event) => {
          warns.push(event.detail);
        });

        await reader.read();
        Options.Tune.MaxStashByteLength(distributor, 0);

        await assert.rejects(reader.read(), cause);

        assert.deepEqual(
          warns.map((warn) => warn.code),
          ['degraded-reader-seek-failed'],
        );
        assert.equal(warns[0].payload.cause, cause);
      });

      it('should dispatch warn(degraded-reader-close-failed) when it refuses', async () => {
        const cause = new Error('the medium refuses to close');

        class RefusingCloseReader extends TestDegradedChunkReader {
          [READER.CLOSE]() {
            throw cause;
          }
        }

        const family = makeFamily({ reader: RefusingCloseReader });
        const distributor = new family.Distributor(makeSource(['a']));
        const warns = [];
        const forked = distributor.fork();

        distributor.addEventListener('warn', (event) => {
          warns.push(event.detail);
        });

        Options.Tune.MaxStashByteLength(distributor, 0);

        await drain(forked);
        await settle();

        assert.deepEqual(
          warns.map((warn) => warn.code),
          ['degraded-reader-close-failed'],
        );
        assert.equal(warns[0].payload.cause, cause);
      });

      it('should reject with the medium error it hit', async () => {
        const cause = new Error('the medium failed');

        class BreakingReader extends TestDegradedChunkReader {
          [READER.READ]() {
            const result = super[READER.READ]();

            if (result.value?.toString() === 'b') {
              throw cause;
            }

            return result;
          }
        }

        const family = makeFamily({ reader: BreakingReader });
        const distributor = new family.Distributor(makeSource(['a', 'b']));
        const reader = distributor.fork().getReader();

        Options.Tune.MaxStashByteLength(distributor, 0);

        assert.equal((await reader.read()).value.toString(), 'a');
        await assert.rejects(reader.read(), cause);
      });

      it('should reject a malformed answer from the medium', async () => {
        const cases = [null, { done: 'yes' }, { done: false }];

        for (const each of cases) {
          let calls = 0;

          class MalformedReader extends TestDegradedChunkReader {
            [READER.READ]() {
              if (calls++ === 0) {
                return super[READER.READ]();
              }

              return each;
            }
          }

          const family = makeFamily({ reader: MalformedReader });
          const distributor = new family.Distributor(makeSource(['a', 'b']));
          const reading = distributor.fork().getReader();

          Options.Tune.MaxStashByteLength(distributor, 0);

          await reading.read();
          await assert.rejects(reading.read(), { name: 'TypeError' });
        }
      });

      it('should not lose data for a lagging copy', async () => {
        const distributor = new TestDistributor(makeSource(['a', 'b', 'c']));
        const leading = distributor.fork();
        const lagging = distributor.fork();

        assert.deepEqual(await drain(leading), ['a', 'b', 'c']);
        assert.deepEqual(await drain(lagging), ['a', 'b', 'c']);
      });

      it('should not hold a fast copy behind a slow one', async () => {
        const distributor = new TestDistributor(makeSource(['a', 'b', 'c']));
        const slow = distributor.fork().getReader();
        const fast = distributor.fork();

        await slow.read();

        assert.deepEqual(await drain(fast), ['a', 'b', 'c']);
      });
    });
  });

  describe('.cancel()', () => {
    it('should stop the copy it was called on', async () => {
      const distributor = new TestDistributor(makeSource(['a', 'b']));
      const reader = distributor.fork().getReader();

      await reader.read();
      await reader.cancel();

      assert.deepEqual(await reader.read(), {
        done: true,
        value: undefined,
      });
    });

    it('should be idempotent', async () => {
      const distributor = new TestDistributor(makeSource());
      const forked = distributor.fork();

      await assert.doesNotReject(forked.cancel());
      await assert.doesNotReject(forked.cancel());
    });

    it('should leave every other copy reading to its end', async () => {
      const distributor = new TestDistributor(makeSource(['a', 'b']));
      const cancelled = distributor.fork();
      const other = distributor.fork();

      await cancelled.cancel();

      assert.deepEqual(await drain(other), ['a', 'b']);
    });
  });
});
