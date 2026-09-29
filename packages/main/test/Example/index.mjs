import { describe } from 'node:test';

describe('Example', async () => {
  await import('./QuickStart.test.mjs');
  await import('./HttpUpload.test.mjs');
});
