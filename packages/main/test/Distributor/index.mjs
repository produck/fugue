import { describe } from 'node:test';

describe('Distributor', async () => {
  await import('./constructor.test.mjs');
  await import('./fork.test.mjs');
  await import('./getWarningCount.test.mjs');
  await import('./degraded/index.mjs');
  await import('./terminated.test.mjs');
  await import('./options.test.mjs');
  await import('./setTransferrerArgs.test.mjs');
  await import('./terminate.test.mjs');
  await import('./destroy/index.mjs');
});
