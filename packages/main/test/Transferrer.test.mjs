import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Options } from '@produck/fugue';

import {
  makeFamily,
  makeSource,
  settle,
  TestTransferrer,
} from '#test/baseline.mjs';

import {
  I as TRANSFERRER_I,
  _I as HOST,
} from '../src/Distributor/DegradedChunkReader/Transferrer/_Symbol.mjs';

describe('Transferrer', () => {
  describe('constructor()', () => {
    it('should receive the parsed argument list', async () => {
      const family = makeFamily();
      const distributor = new family.Distributor(makeSource(['a']));
      const forked = distributor.fork();

      distributor.setTransferrerArgs('x', 'y');
      Options.Tune.MaxStashByteLength(distributor, 0);

      await forked.getReader().read();

      assert.deepEqual(family.created.at(-1).args, ['x', 'y']);
    });

    describe('>instance', () => {
      it('should start with nothing pending', () => {
        assert.equal(new TestTransferrer().pendingByteLength, 0);
      });

      it('should start not done, not dropped and without error', () => {
        const medium = new TestTransferrer();

        assert.equal(medium.done, false);
        assert.equal(medium.dropped, false);
        assert.equal(medium[TRANSFERRER_I.ERROR], null);
      });
    });
  });

  describe('.pendingByteLength', () => {
    it('should count only what came in after the hand-over', async () => {
      class HangingWriteTransferrer extends TestTransferrer {
        [HOST.WRITE]() {
          return new Promise(() => {});
        }
      }

      const family = makeFamily({ medium: HangingWriteTransferrer });
      const distributor = new family.Distributor(makeSource(['aa', 'bb']));
      const reading = distributor.fork().getReader();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await reading.read();
      await reading.read();

      const medium = family.created.at(-1);

      assert.equal(medium.pendingByteLength, 2);
    });

    it('should fall back as the drain writes', async () => {
      let releaseWrite = null;

      class SlowTransferrer extends TestTransferrer {
        async [HOST.WRITE](buffer) {
          await new Promise((resolve) => {
            releaseWrite = resolve;
          });

          await super[HOST.WRITE](buffer);
        }
      }

      const family = makeFamily({ medium: SlowTransferrer });
      const distributor = new family.Distributor(makeSource(['aa', 'bb']));
      const reading = distributor.fork().getReader();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await reading.read();

      const medium = family.created.at(-1);
      const rest = reading.read();

      await settle();
      assert.equal(medium.pendingByteLength, 2);

      releaseWrite();
      await settle();
      await rest;

      assert.equal(medium.pendingByteLength, 0);
    });

    it('should keep the chunks a failed dump left undrained', async () => {
      const cause = new Error('the medium failed');
      let refuseDump = null;
      let writes = 0;

      class RefusingDumpTransferrer extends TestTransferrer {
        [HOST.DUMP]() {
          return new Promise((resolve, reject) => {
            refuseDump = () => reject(cause);
          });
        }

        async [HOST.WRITE](buffer) {
          writes += 1;

          return super[HOST.WRITE](buffer);
        }
      }

      const family = makeFamily({ medium: RefusingDumpTransferrer });
      const distributor = new family.Distributor(makeSource(['a', 'b', 'c']));
      const reading = distributor.fork().getReader();

      Options.Tune.MaxStashByteLength(distributor, 0);
      Options.Asset.noRetry(distributor);

      await reading.read();
      await reading.read();

      const medium = family.created.at(-1);

      refuseDump();
      await settle();

      assert.equal(medium[TRANSFERRER_I.ERROR], cause);
      assert.equal(writes, 0);
      assert.equal(medium.pendingByteLength, 1);

      await assert.rejects(reading.read(), cause);
      assert.equal(writes, 0);
    });

    it('should retry the dump until the option runs out', async () => {
      const cause = new Error('the medium kept failing');
      let calls = 0;
      let release = null;

      const retried = new Promise((resolve) => {
        release = resolve;
      });

      class FailingDumpTransferrer extends TestTransferrer {
        [HOST.DUMP]() {
          calls += 1;

          if (calls === 2) {
            release();
          }

          throw cause;
        }
      }

      const family = makeFamily({ medium: FailingDumpTransferrer });
      const distributor = new family.Distributor(makeSource(['a', 'b']));
      const reading = distributor.fork().getReader();

      Options.Tune.MaxStashByteLength(distributor, 0);
      Options.Tune.MaxDumpRetryCount(distributor, 1);
      Options.Tune.DumpRetryInterval(distributor, 0);

      await reading.read();
      await retried;

      const medium = family.created.at(-1);

      assert.equal(calls, 2);
      assert.equal(medium[TRANSFERRER_I.ERROR], cause);
    });

    it('should land the dump when the medium answers the retry', async () => {
      let calls = 0;
      let release = null;

      const retried = new Promise((resolve) => {
        release = resolve;
      });

      class HiccupTransferrer extends TestTransferrer {
        [HOST.DUMP](stash) {
          calls += 1;

          if (calls === 2) {
            release();
          }

          if (calls === 1) {
            throw new Error('a hiccup');
          }

          return super[HOST.DUMP](stash);
        }
      }

      const family = makeFamily({ medium: HiccupTransferrer });
      const distributor = new family.Distributor(makeSource(['a', 'b']));
      const reading = distributor.fork().getReader();

      Options.Tune.MaxStashByteLength(distributor, 0);
      Options.Tune.MaxDumpRetryCount(distributor, 1);
      Options.Tune.DumpRetryInterval(distributor, 0);

      await reading.read();
      await retried;
      await settle();

      const medium = family.created.at(-1);

      assert.equal(calls, 2);
      assert.equal(medium[TRANSFERRER_I.ERROR], null);
      assert.equal(medium.medium[0].toString(), 'a');
    });

    it('should stop retrying once the transferrer is released', async () => {
      let calls = 0;
      let release = null;

      const retried = new Promise((resolve) => {
        release = resolve;
      });

      class FailingDumpTransferrer extends TestTransferrer {
        [HOST.DUMP]() {
          calls += 1;

          if (calls === 2) {
            release();
          }

          throw new Error('nope');
        }
      }

      const family = makeFamily({ medium: FailingDumpTransferrer });
      const distributor = new family.Distributor(makeSource(['a', 'b']));
      const reading = distributor.fork().getReader();

      Options.Tune.MaxStashByteLength(distributor, 0);
      Options.Tune.MaxDumpRetryCount(distributor, Infinity);
      Options.Tune.DumpRetryInterval(distributor, 0);

      await reading.read();
      await retried;

      const medium = family.created.at(-1);

      assert.ok(calls > 1);

      await distributor.destroy();

      const atRelease = calls;

      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.equal(calls, atRelease);
      assert.equal(medium[TRANSFERRER_I.ERROR], null);
    });

    it('should retry the write when the medium answers the second time', async () => {
      let calls = 0;
      let release = null;

      const retried = new Promise((resolve) => {
        release = resolve;
      });

      class HiccupTransferrer extends TestTransferrer {
        async [HOST.WRITE](buffer) {
          calls += 1;

          if (calls === 2) {
            release();
          }

          if (calls === 1) {
            throw new Error('a hiccup');
          }

          return super[HOST.WRITE](buffer);
        }
      }

      const family = makeFamily({ medium: HiccupTransferrer });
      const distributor = new family.Distributor(makeSource(['a', 'b']));
      const reading = distributor.fork().getReader();
      const warns = [];

      distributor.addEventListener('warn', (event) => warns.push(event.detail));
      Options.Tune.MaxStashByteLength(distributor, 0);
      Options.Tune.MaxBacklogWarningByteLength(distributor, 1024);
      Options.Tune.MaxDrainRetryCount(distributor, 1);
      Options.Tune.DrainRetryInterval(distributor, 0);

      await reading.read();
      await reading.read();
      await retried;
      await settle();

      const medium = family.created.at(-1);
      const attempts = warns.filter(
        (warn) => warn.code === 'transferrer-write-failed',
      );

      assert.equal(calls, 2);
      assert.equal(medium[TRANSFERRER_I.ERROR], null);
      assert.equal(
        medium.medium.map((chunk) => chunk.toString()).join(''),
        'ab',
      );
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].payload.retry, 0);
    });

    it('should give up the drain once the retry option runs out', async () => {
      const cause = new Error('the medium keeps failing');
      let calls = 0;
      let release = null;

      const retried = new Promise((resolve) => {
        release = resolve;
      });

      class FailingWriteTransferrer extends TestTransferrer {
        async [HOST.WRITE]() {
          calls += 1;

          if (calls === 2) {
            release();
          }

          throw cause;
        }
      }

      const family = makeFamily({ medium: FailingWriteTransferrer });
      const distributor = new family.Distributor(makeSource(['a', 'b']));
      const reading = distributor.fork().getReader();

      Options.Tune.MaxStashByteLength(distributor, 0);
      Options.Tune.MaxBacklogWarningByteLength(distributor, 1024);
      Options.Tune.MaxDrainRetryCount(distributor, 1);
      Options.Tune.DrainRetryInterval(distributor, 0);

      await reading.read();
      reading.read().catch(() => {});
      await retried;
      await settle();

      const medium = family.created.at(-1);

      assert.equal(calls, 2);
      assert.equal(medium[TRANSFERRER_I.ERROR], cause);
    });

    it('should stop draining once the transferrer is released', async () => {
      let calls = 0;
      let release = null;

      const retried = new Promise((resolve) => {
        release = resolve;
      });

      class FailingWriteTransferrer extends TestTransferrer {
        async [HOST.WRITE]() {
          calls += 1;

          if (calls === 2) {
            release();
          }

          throw new Error('nope');
        }
      }

      const family = makeFamily({ medium: FailingWriteTransferrer });
      const distributor = new family.Distributor(makeSource(['a', 'b']));
      const reading = distributor.fork().getReader();

      Options.Tune.MaxStashByteLength(distributor, 0);
      Options.Tune.MaxBacklogWarningByteLength(distributor, 1024);
      Options.Tune.MaxDrainRetryCount(distributor, Infinity);
      Options.Tune.DrainRetryInterval(distributor, 0);

      await reading.read();
      reading.read().catch(() => {});
      await retried;

      const medium = family.created.at(-1);

      assert.ok(calls > 1);

      await distributor.destroy();

      const atRelease = calls;

      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.equal(calls, atRelease);
      assert.equal(medium[TRANSFERRER_I.ERROR], null);
    });

    it('should answer zero once the store is released', async () => {
      class HangingWriteTransferrer extends TestTransferrer {
        [HOST.WRITE]() {
          return new Promise(() => {});
        }
      }

      const family = makeFamily({ medium: HangingWriteTransferrer });
      const distributor = new family.Distributor(makeSource(['aa', 'bb']));
      const reading = distributor.fork().getReader();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await reading.read();
      await reading.read();

      const medium = family.created.at(-1);

      assert.equal(medium.pendingByteLength, 2);

      await distributor.destroy();

      assert.equal(medium.pendingByteLength, 0);
    });
  });

  describe('.dumping', () => {
    it('should be null before the stash is taken over', () => {
      assert.equal(new TestTransferrer().dumping, null);
    });

    it('should be the promise of the taking over, while it runs', async () => {
      let releaseDump = null;
      let settled = false;

      class SlowTransferrer extends TestTransferrer {
        [HOST.DUMP](stash) {
          return new Promise((resolve) => {
            releaseDump = () => {
              super[HOST.DUMP](stash);

              resolve();
            };
          });
        }
      }

      const family = makeFamily({ medium: SlowTransferrer });
      const distributor = new family.Distributor(makeSource(['a']));
      const forked = distributor.fork();

      Options.Tune.MaxStashByteLength(distributor, 0);

      forked.getReader().read();

      await settle();

      const medium = family.created.at(-1);

      assert.ok(medium.dumping instanceof Promise);

      medium.dumping.then(() => {
        settled = true;
      });

      await settle();
      assert.equal(settled, false);

      releaseDump();
      await medium.dumping;

      assert.equal(settled, true);
    });
  });

  describe('.done', () => {
    it('should turn true when the source had ended at the switch', async () => {
      const family = makeFamily();
      const distributor = new family.Distributor(makeSource(['a']));
      const reading = distributor.fork().getReader();

      Options.Tune.DegradeOnStashFullAndDone(distributor, true);
      Options.Tune.MaxStashByteLength(distributor, 1);

      await reading.read();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await reading.read();

      assert.equal(distributor.degraded, true);
      assert.equal(family.created.at(-1).done, true);
    });

    it('should turn true when the distributor is destroyed', async () => {
      const family = makeFamily();
      const distributor = new family.Distributor(makeSource(['a', 'b']));
      const forked = distributor.fork();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await forked.getReader().read();

      const medium = family.created.at(-1);

      assert.equal(medium.done, false);

      await distributor.destroy();

      assert.equal(medium.done, true);
    });
  });

  describe('.dropped', () => {
    it('should turn true when the distributor releases the store', async () => {
      const family = makeFamily();
      const distributor = new family.Distributor(makeSource(['a', 'b']));
      const forked = distributor.fork();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await forked.getReader().read();

      const medium = family.created.at(-1);

      assert.equal(medium.dropped, false);

      await distributor.destroy();

      assert.equal(medium.dropped, true);
    });

    it('should swallow a failure of the release', async () => {
      class RefusingDropTransferrer extends TestTransferrer {
        async [HOST.DROP]() {
          throw new Error('the medium refuses to release');
        }
      }

      const family = makeFamily({ medium: RefusingDropTransferrer });
      const distributor = new family.Distributor(makeSource(['a']));
      const forked = distributor.fork();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await forked.getReader().read();

      const medium = family.created.at(-1);

      await distributor.destroy();

      assert.equal(medium.dropped, true);
    });

    it('should swallow a synchronous failure of the release', async () => {
      let calls = 0;

      class ThrowingDropTransferrer extends TestTransferrer {
        [HOST.DROP]() {
          calls += 1;

          throw new Error('the medium refuses to release');
        }
      }

      const family = makeFamily({ medium: ThrowingDropTransferrer });
      const distributor = new family.Distributor(makeSource(['a']));
      const forked = distributor.fork();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await forked.getReader().read();

      const medium = family.created.at(-1);

      await assert.doesNotReject(distributor.destroy());

      assert.equal(calls, 1);
      assert.equal(medium.dropped, true);
    });

    it('should not wait for the medium to release its own resources', async () => {
      class HangingDropTransferrer extends TestTransferrer {
        [HOST.DROP]() {
          return new Promise(() => {});
        }
      }

      const family = makeFamily({ medium: HangingDropTransferrer });
      const distributor = new family.Distributor(makeSource(['a']));
      const forked = distributor.fork();

      Options.Tune.MaxStashByteLength(distributor, 0);

      await forked.getReader().read();

      const medium = family.created.at(-1);

      await distributor.destroy();

      assert.equal(medium.dropped, true);
    });
  });
});
