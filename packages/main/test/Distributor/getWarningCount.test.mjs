import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as Fugue from '@produck/fugue';

import {
  makeDistributor,
  makeFamily,
  makeSource,
  settle,
  TestTransferrer,
} from '#test/baseline.mjs';

const { _I: TRANSFERRER } = Fugue.SYMBOL.TRANSFERRER;

const EXPECTED = {
  NOT_A_CODE: {
    name: 'TypeError',
    message: /Invalid "code", one "warning code" expected\./,
  },
};

describe('.getWarningCount()', () => {
  it('should count every report of a code and nothing else', async () => {
    class RefusingTransferrer extends TestTransferrer {
      [TRANSFERRER.DUMP]() {
        throw new Error('the medium refuses the dump');
      }
    }

    const family = makeFamily({ medium: RefusingTransferrer });
    const distributor = new family.Distributor(makeSource(['a']));
    const reader = distributor.fork().getReader();

    Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 0);
    Fugue.Options.Preset.noRetry(distributor);

    await reader.read().catch(() => {});
    await settle();

    assert.equal(distributor.getWarningCount('transferrer-dump-failed'), 1);
    assert.equal(distributor.getWarningCount('source-read-failed'), 0);
    assert.equal(distributor.getWarningCount('transferrer-backlog'), 0);
  });

  it('should count one per attempt', async () => {
    let calls = 0;
    let release = null;

    const second = new Promise((resolve) => {
      release = resolve;
    });

    class RefusingTransferrer extends TestTransferrer {
      [TRANSFERRER.DUMP]() {
        calls += 1;

        if (calls === 2) {
          release();
        }

        throw new Error('the medium refuses the dump');
      }
    }

    const family = makeFamily({ medium: RefusingTransferrer });
    const distributor = new family.Distributor(makeSource(['a']));
    const reader = distributor.fork().getReader();

    Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 0);
    Fugue.Options.Tune.MaxTransferrerDumpRetryCount(distributor, 1);
    Fugue.Options.Tune.TransferrerDumpRetryInterval(distributor, 0);

    const reading = reader.read().catch(() => {});

    await Promise.all([second, reading]);
    await settle();

    assert.equal(calls, 2);
    assert.equal(distributor.getWarningCount('transferrer-dump-failed'), 2);
  });

  it('should refuse a code outside the warning vocabulary', () => {
    const distributor = makeDistributor();
    const attempt = () => distributor.getWarningCount('constructor');

    assert.throws(attempt, EXPECTED.NOT_A_CODE);
  });
});
