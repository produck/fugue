import assert from 'node:assert/strict';
import { it } from 'node:test';

import { Options, SYMBOL } from '@produck/readable-stream-distributor';

import {
  makeFamily,
  makeSource,
  settle,
  TestDegradedChunkReader,
  TestTransferrer,
} from '#test/baseline.mjs';

const { _I: TRANSFERRER } = SYMBOL.TRANSFERRER;
const { _I: READER } = SYMBOL.DEGRADED_CHUNK_READER;

it('should dispatch warn(transferrer-dump-failed) when the dump fails', async () => {
  const refused = new Error('the medium refuses the dump');

  class RefusingTransferrer extends TestTransferrer {
    [TRANSFERRER.DUMP]() {
      throw refused;
    }
  }

  const family = makeFamily({ medium: RefusingTransferrer });
  const distributor = new family.Distributor(makeSource(['a']));
  const reader = distributor.fork().getReader();
  const warns = [];
  const onWarn = (event) => warns.push(event.detail);

  distributor.addEventListener('warn', onWarn);
  Options.Tune.MaxStashByteLength(distributor, 0);
  Options.Asset.noRetry(distributor);

  await reader.read();
  await settle();

  assert.deepEqual(
    warns.map((warn) => warn.code),
    ['transferrer-dump-failed'],
  );
  assert.equal(warns[0].payload.cause, refused);
  assert.equal(warns[0].payload.retry, 0);
});

it('should dispatch warn(transferrer-write-failed) when the write fails', async () => {
  const refused = new Error('the medium refuses the write');

  class RefusingWriteTransferrer extends TestTransferrer {
    [TRANSFERRER.WRITE]() {
      throw refused;
    }
  }

  const family = makeFamily({ medium: RefusingWriteTransferrer });
  const distributor = new family.Distributor(makeSource(['a', 'b']));
  const reader = distributor.fork().getReader();
  const warns = [];

  distributor.addEventListener('warn', (event) => warns.push(event.detail));
  Options.Tune.MaxStashByteLength(distributor, 0);
  Options.Tune.MaxBacklogWarningByteLength(distributor, 1024);
  Options.Asset.noRetry(distributor);

  await reader.read();

  assert.equal((await reader.read()).value.toString(), 'b');

  await settle();

  assert.equal(warns.length, 1);
  assert.equal(warns[0].code, 'transferrer-write-failed');
  assert.equal(warns[0].payload.cause, refused);
  assert.equal(warns[0].payload.retry, 0);
});

it('should dispatch warn(transferrer-dump-failed) once per attempt', async () => {
  const cause = new Error('the medium never answers');
  let calls = 0;
  let release = null;

  const retried = new Promise((resolve) => {
    release = resolve;
  });

  class RefusingTransferrer extends TestTransferrer {
    [TRANSFERRER.DUMP]() {
      calls += 1;

      if (calls === 2) {
        release();
      }

      throw cause;
    }
  }

  const family = makeFamily({ medium: RefusingTransferrer });
  const distributor = new family.Distributor(makeSource(['a']));
  const reading = distributor.fork().getReader();
  const warns = [];

  distributor.addEventListener('warn', (event) => warns.push(event.detail));
  Options.Tune.MaxStashByteLength(distributor, 0);
  Options.Tune.MaxDumpRetryCount(distributor, 1);
  Options.Tune.DumpRetryInterval(distributor, 0);

  await reading.read();
  await retried;
  await settle();

  const attempts = warns.filter(
    (warn) => warn.code === 'transferrer-dump-failed',
  );

  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].payload.cause, cause);
  assert.equal(attempts[1].payload.cause, cause);
  assert.equal(attempts[0].payload.retry, 0);
  assert.equal(attempts[1].payload.retry, 1);
});

it('should dispatch warn(transferrer-backlog) once over the limit', async () => {
  class HangingWriteTransferrer extends TestTransferrer {
    [TRANSFERRER.WRITE]() {
      return new Promise(() => {});
    }
  }

  const family = makeFamily({ medium: HangingWriteTransferrer });
  const distributor = new family.Distributor(makeSource(['a', 'bb', 'ccc']));
  const reading = distributor.fork().getReader();
  const warns = [];

  distributor.addEventListener('warn', (event) => warns.push(event.detail));

  Options.Tune.MaxStashByteLength(distributor, 0);
  Options.Tune.MaxBacklogWarningByteLength(distributor, 3);

  await reading.read();
  await reading.read();
  await reading.read();

  assert.equal(warns.length, 1);
  assert.equal(warns[0].code, 'transferrer-backlog');
  assert.equal(warns[0].payload.byteLength, 5);
});

it('should dispatch warn(initialize-failed) on the switch', async () => {
  const cause = new Error('the medium refused to open');

  class RefusingInitializeReader extends TestDegradedChunkReader {
    [READER.INITIALIZE]() {
      throw cause;
    }
  }

  const family = makeFamily({ reader: RefusingInitializeReader });
  const distributor = new family.Distributor(makeSource(['a']));
  const reader = distributor.fork().getReader();
  const warns = [];

  distributor.addEventListener('warn', (event) => warns.push(event.detail));

  Options.Tune.MaxStashByteLength(distributor, 0);

  await assert.rejects(reader.read(), cause);
  await settle();

  assert.equal(warns.length, 1);
  assert.equal(warns[0].code, 'initialize-failed');
  assert.equal(warns[0].payload, cause);
});
