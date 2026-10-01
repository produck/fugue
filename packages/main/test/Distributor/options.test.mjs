import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Options } from '@produck/fugue';

import { makeSource, TestDistributor } from '#test/baseline.mjs';

describe('.options', () => {
  it('should answer every item of the config surface', () => {
    const distributor = new TestDistributor(makeSource());
    const snapshot = distributor.options;
    const items = [
      'DegradeOnStashFullAndDone',
      'DrainRetryInterval',
      'DumpRetryInterval',
      'ForkHighWaterMark',
      'InitializeRetryInterval',
      'MaxBacklogWarningByteLength',
      'MaxDrainRetryCount',
      'MaxDumpRetryCount',
      'MaxInitializeRetryCount',
      'MaxStashByteLength',
    ];

    assert.deepEqual(Object.keys(snapshot).sort(), items);
  });

  it('should build a fresh snapshot on every read', () => {
    const distributor = new TestDistributor(makeSource());

    const first = distributor.options;
    const second = distributor.options;

    assert.notEqual(first, second);
    assert.deepEqual(first, second);
  });

  it('should answer what Tune wrote', () => {
    const distributor = new TestDistributor(makeSource());

    Options.Tune.MaxStashByteLength(distributor, 4);

    assert.equal(distributor.options.MaxStashByteLength, 4);
  });
});
