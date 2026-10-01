import assert from 'node:assert/strict';
import { it } from 'node:test';

import { Options } from '@produck/fugue';

import { makeSource, TestDistributor } from '#test/baseline.mjs';

it('should dispatch the degrade event on the crossing pull', async () => {
  const distributor = new TestDistributor(makeSource(['a', 'b']));
  const reader = distributor.fork().getReader();
  const details = [];

  distributor.addEventListener('degrade', (event) => {
    details.push(event.detail);
  });

  Options.Tune.MaxStashByteLength(distributor, 1);

  await reader.read();
  assert.deepEqual(details, []);

  await reader.read();

  assert.deepEqual(details, [{ byteLength: 2 }]);
});

it('should dispatch the degrade event with degraded already true', async () => {
  const distributor = new TestDistributor(makeSource(['a', 'b']));
  const reader = distributor.fork().getReader();
  const seen = [];

  distributor.addEventListener('degrade', () => {
    seen.push(distributor.degraded);
  });

  Options.Tune.MaxStashByteLength(distributor, 0);

  await reader.read();

  assert.deepEqual(seen, [true]);
});

it('should not dispatch the degrade event again on later pulls', async () => {
  const distributor = new TestDistributor(makeSource(['a', 'b', 'c']));
  const reader = distributor.fork().getReader();
  let count = 0;

  distributor.addEventListener('degrade', () => count++);

  Options.Tune.MaxStashByteLength(distributor, 0);

  await reader.read();
  await reader.read();
  await reader.read();

  assert.equal(count, 1);
});
