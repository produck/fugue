import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { describe, it } from 'node:test';

import * as Fugue from '@produck/fugue';

import { drain, makeFamily, makeSource } from '#test/baseline.mjs';

const { Options } = Fugue;

const makeSpooling = (chunks) => {
  const family = makeFamily();
  const distributor = new family.Distributor(makeSource(chunks));

  Options.Tune.MaxStashByteLength(distributor, 0);

  return { distributor, family };
};

describe('Distributor', () => {
  describe('.fork()', () => {
    it('should answer the whole source from the temporary file', async () => {
      const { distributor } = makeSpooling(['a', 'b', 'c']);

      assert.deepEqual(await drain(distributor.fork()), ['a', 'b', 'c']);
      assert.equal(distributor.degraded, true);

      await distributor.destroy();
    });

    it('should answer a copy forked after the switch', async () => {
      const { distributor } = makeSpooling(['a', 'b']);

      await drain(distributor.fork());

      assert.equal(distributor.degraded, true);
      assert.deepEqual(await drain(distributor.fork()), ['a', 'b']);

      await distributor.destroy();
    });
  });

  describe('.setTransferrerArgs()', () => {
    it('should build the same medium when the host calls it', async () => {
      const family = makeFamily();
      const distributor = new family.Distributor(makeSource(['a']));

      distributor.setTransferrerArgs();
      Options.Tune.MaxStashByteLength(distributor, 0);

      assert.deepEqual(await drain(distributor.fork()), ['a']);

      await distributor.destroy();
    });
  });

  describe('.destroy()', () => {
    it('should remove the temporary file at the release', async () => {
      const { distributor, family } = makeSpooling(['a', 'b']);

      assert.deepEqual(await drain(distributor.fork()), ['a', 'b']);

      const [medium] = family.created;

      await distributor.destroy();
      await medium.release;

      await assert.rejects(stat(medium.pathname), { code: 'ENOENT' });
    });
  });
});
