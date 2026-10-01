import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import * as Fugue from '@produck/fugue';

import * as NodeFile from '@produck/fugue-degraded-node-file';

import {
  drain,
  makeFamily,
  makeSource,
  makeTemporaryDirectory,
  removeTemporaryDirectory,
} from '#test/baseline.mjs';

const { Options, SYMBOL } = Fugue;
const { FileTransferrer } = NodeFile;
const { _I: TRANSFERRER } = SYMBOL.TRANSFERRER;

const FRAME_HEADER = 4;
const EXPECTED = {
  ABORTED: { name: 'AbortError' },
  TYPED: { name: 'TypeError' },
};

const makeSpooling = (path, chunks) => {
  const family = makeFamily();
  const distributor = new family.Distributor(makeSource(chunks));

  distributor.setTransferrerArgs(path);
  Options.Tune.MaxStashByteLength(distributor, 0);

  return { distributor, family };
};

describe('Distributor', () => {
  describe('.fork()', () => {
    it('should answer the whole source from the file', async (t) => {
      const directory = await makeTemporaryDirectory();

      t.after(() => removeTemporaryDirectory(directory));

      const path = join(directory, 'spool');
      const { distributor } = makeSpooling(path, ['a', 'b', 'c']);

      assert.deepEqual(await drain(distributor.fork()), ['a', 'b', 'c']);
      assert.equal(distributor.degraded, true);

      const { size } = await stat(path);

      assert.ok(size > 3);
      assert.equal((size - 3) % FRAME_HEADER, 0);

      await distributor.destroy();
    });

    it('should answer a copy forked after the switch', async (t) => {
      const directory = await makeTemporaryDirectory();

      t.after(() => removeTemporaryDirectory(directory));

      const path = join(directory, 'spool');
      const { distributor } = makeSpooling(path, ['a', 'b']);
      const early = distributor.fork().getReader();

      await early.read();
      assert.equal(distributor.degraded, true);

      assert.deepEqual(await drain(distributor.fork()), ['a', 'b']);

      await early.cancel();
      await distributor.destroy();
    });

    it('should keep a lagging copy whole while a fast one drains', async (t) => {
      const directory = await makeTemporaryDirectory();

      t.after(() => removeTemporaryDirectory(directory));

      const path = join(directory, 'spool');
      const { distributor } = makeSpooling(path, ['a', 'b', 'c']);
      const fast = distributor.fork();
      const lagging = distributor.fork().getReader();
      const first = await lagging.read();

      assert.equal(first.value.toString(), 'a');

      assert.deepEqual(await drain(fast), ['a', 'b', 'c']);

      const rest = [];

      for (;;) {
        const { value, done } = await lagging.read();

        if (done) {
          break;
        }

        rest.push(value.toString());
      }

      assert.deepEqual([first.value.toString(), ...rest], ['a', 'b', 'c']);

      await distributor.destroy();
    });
  });

  describe('.setTransferrerArgs()', () => {
    it('should write into the file it was given', async (t) => {
      const directory = await makeTemporaryDirectory();

      t.after(() => removeTemporaryDirectory(directory));

      const path = join(directory, 'spool');
      const { distributor } = makeSpooling(path, ['a']);

      await drain(distributor.fork());

      assert.equal((await stat(path)).size, 1 + FRAME_HEADER);

      await distributor.destroy();
    });

    it('should refuse a path that is not a string', () => {
      const family = makeFamily();
      const distributor = new family.Distributor(makeSource(['a']));

      assert.throws(() => distributor.setTransferrerArgs(42), EXPECTED.TYPED);
    });

    it('should refuse a path that is not absolute', () => {
      const family = makeFamily();
      const distributor = new family.Distributor(makeSource(['a']));

      assert.throws(
        () => distributor.setTransferrerArgs('./spool'),
        EXPECTED.TYPED,
      );
    });

    it('should refuse to build the medium without a path', async () => {
      const family = makeFamily();
      const distributor = new family.Distributor(makeSource(['a']));

      Options.Tune.MaxStashByteLength(distributor, 0);

      await assert.rejects(drain(distributor.fork()), EXPECTED.TYPED);
    });
  });

  describe('.destroy()', () => {
    it('should remove the file at the release', async (t) => {
      const directory = await makeTemporaryDirectory();

      t.after(() => removeTemporaryDirectory(directory));

      const path = join(directory, 'spool');
      const { distributor, family } = makeSpooling(path, ['a', 'b']);

      await drain(distributor.fork());
      await distributor.destroy();

      const [medium] = family.created;

      await medium.release;

      await assert.rejects(stat(path), { code: 'ENOENT' });
    });

    it('should not write once the medium is released', async (t) => {
      const directory = await makeTemporaryDirectory();

      t.after(() => removeTemporaryDirectory(directory));

      const path = join(directory, 'spool');
      let open;
      const gate = new Promise((resolve) => {
        open = resolve;
      });

      class GatedMedium extends FileTransferrer {
        async [TRANSFERRER.DUMP](stash) {
          await gate;

          return super[TRANSFERRER.DUMP](stash);
        }
      }

      const family = makeFamily({ medium: GatedMedium });
      const distributor = new family.Distributor(makeSource(['a', 'b']));

      distributor.setTransferrerArgs(path);
      Options.Tune.MaxStashByteLength(distributor, 0);

      const degraded = new Promise((resolve) => {
        distributor.addEventListener('degrade', resolve);
      });
      const reading = distributor.fork().getReader().read();

      await degraded;
      await distributor.destroy();

      await assert.rejects(reading, EXPECTED.ABORTED);

      open();
      await family.created[0].dumping;

      await assert.rejects(stat(path), { code: 'ENOENT' });
    });
  });
});
