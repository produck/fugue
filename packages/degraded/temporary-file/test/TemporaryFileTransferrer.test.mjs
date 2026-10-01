import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute } from 'node:path';
import { describe, it } from 'node:test';

import * as Core from '@produck/readable-stream-distributor';

import { drain, makeFamily, makeSource } from '#test/baseline.mjs';

const { Options } = Core;

const makeSpooling = (chunks) => {
  const family = makeFamily();
  const distributor = new family.Distributor(makeSource(chunks));

  Options.Tune.MaxStashByteLength(distributor, 0);

  return { distributor, family };
};

describe('TemporaryFileTransferrer', () => {
  describe('.pathname', () => {
    it('should name a file under the temporary directory', async () => {
      const { distributor, family } = makeSpooling(['a']);

      assert.deepEqual(await drain(distributor.fork()), ['a']);

      const [medium] = family.created;

      assert.equal(isAbsolute(medium.pathname), true);
      assert.equal(medium.pathname.startsWith(tmpdir()), true);
      assert.equal((await stat(medium.pathname)).isFile(), true);

      await distributor.destroy();
      await medium.release;
    });
  });
});
