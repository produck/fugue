import assert from 'node:assert/strict';
import { it } from 'node:test';

import * as Fugue from '@produck/fugue';

import {
  makeFamily,
  makeSource,
  settle,
  TestDegradedChunkReader,
  TestTransferrer,
} from '#test/baseline.mjs';

const { _I: TRANSFERRER } = Fugue.SYMBOL.TRANSFERRER;
const { _I: READER } = Fugue.SYMBOL.DEGRADED_CHUNK_READER;

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
  Fugue.Options.Tune.MaxStashByteLength(distributor, 0);
  Fugue.Options.Asset.noRetry(distributor);

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
  Fugue.Options.Tune.MaxStashByteLength(distributor, 0);
  Fugue.Options.Tune.MaxBacklogWarningByteLength(distributor, 1024);
  Fugue.Options.Asset.noRetry(distributor);

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
  Fugue.Options.Tune.MaxStashByteLength(distributor, 0);
  Fugue.Options.Tune.MaxDumpRetryCount(distributor, 1);
  Fugue.Options.Tune.DumpRetryInterval(distributor, 0);

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

  Fugue.Options.Tune.MaxStashByteLength(distributor, 0);
  Fugue.Options.Tune.MaxBacklogWarningByteLength(distributor, 3);

  await reading.read();
  await reading.read();
  await reading.read();

  assert.equal(warns.length, 1);
  assert.equal(warns[0].code, 'transferrer-backlog');
  assert.equal(warns[0].payload.pendingByteLength, 5);
});

it('should dispatch warn(degraded-reader-initialize-failed) on the switch', async () => {
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

  Fugue.Options.Tune.MaxStashByteLength(distributor, 0);
  Fugue.Options.Asset.noRetry(distributor);

  await assert.rejects(reader.read(), cause);
  await settle();

  assert.equal(warns.length, 1);
  assert.equal(warns[0].code, 'degraded-reader-initialize-failed');
  assert.equal(warns[0].payload.cause, cause);
  assert.equal(warns[0].payload.retry, 0);
});

it('should dispatch warn(degraded-reader-initialize-failed) once per attempt', async () => {
  const cause = new Error('the medium refuses to open');
  let calls = 0;

  class FailingInitializeReader extends TestDegradedChunkReader {
    [READER.INITIALIZE]() {
      calls += 1;

      throw cause;
    }
  }

  const family = makeFamily({ reader: FailingInitializeReader });
  const distributor = new family.Distributor(makeSource(['a']));
  const reading = distributor.fork().getReader();
  const warns = [];

  distributor.addEventListener('warn', (event) => warns.push(event.detail));

  Fugue.Options.Tune.MaxStashByteLength(distributor, 0);
  Fugue.Options.Tune.MaxInitializeRetryCount(distributor, 1);
  Fugue.Options.Tune.InitializeRetryInterval(distributor, 0);

  await assert.rejects(reading.read(), cause);

  const attempts = warns.filter(
    (warn) => warn.code === 'degraded-reader-initialize-failed',
  );

  assert.equal(calls, 2);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].payload.cause, cause);
  assert.equal(attempts[1].payload.cause, cause);
  assert.equal(attempts[0].payload.retry, 0);
  assert.equal(attempts[1].payload.retry, 1);
});

it('should land the initialize when the medium answers the retry', async () => {
  let calls = 0;

  class HiccupInitializeReader extends TestDegradedChunkReader {
    [READER.INITIALIZE]() {
      calls += 1;

      if (calls === 1) {
        throw new Error('a hiccup');
      }
    }
  }

  const family = makeFamily({ reader: HiccupInitializeReader });
  const distributor = new family.Distributor(makeSource(['a']));
  const reading = distributor.fork().getReader();
  const warns = [];

  distributor.addEventListener('warn', (event) => warns.push(event.detail));

  Fugue.Options.Tune.MaxStashByteLength(distributor, 0);
  Fugue.Options.Tune.MaxInitializeRetryCount(distributor, 1);
  Fugue.Options.Tune.InitializeRetryInterval(distributor, 0);

  assert.equal((await reading.read()).value.toString(), 'a');
  assert.equal(calls, 2);
  assert.equal(warns.length, 1);
  assert.equal(warns[0].payload.retry, 0);
});

it('should stop retrying the initialize once the reader is released', async () => {
  const cause = new Error('the medium never answers');
  let calls = 0;
  let release = null;

  const started = new Promise((resolve) => {
    release = resolve;
  });

  class FailingInitializeReader extends TestDegradedChunkReader {
    [READER.INITIALIZE]() {
      calls += 1;
      release();

      throw cause;
    }
  }

  const family = makeFamily({ reader: FailingInitializeReader });
  const distributor = new family.Distributor(makeSource(['a']));
  const reading = distributor.fork().getReader();

  reading.read().catch(() => {});

  Fugue.Options.Tune.MaxStashByteLength(distributor, 0);
  Fugue.Options.Tune.MaxInitializeRetryCount(distributor, Infinity);
  Fugue.Options.Tune.InitializeRetryInterval(distributor, 100);

  await started;
  await distributor.destroy();

  const atRelease = calls;
  const window = Fugue.Options.Get.InitializeRetryInterval(distributor) * 1.5;

  await new Promise((resolve) => setTimeout(resolve, window));

  assert.equal(calls, atRelease);
});
