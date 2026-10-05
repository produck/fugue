import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { describe, it } from 'node:test';

import * as Fugue from '@produck/fugue';

import * as TemporaryFile from '@produck/fugue-degraded-temporary-file';

import { drain, makeFamily, makeSource } from '#test/baseline.mjs';

const { Transferrer } = TemporaryFile;
const NAMED = 'probe-named.tmp';
const NESTED = 'probe-nested/probe-named.tmp';
const EXPECTED = {
  TYPED: { name: 'TypeError', message: /one "string"/ },
  OUTSIDE: { name: 'TypeError', message: /one "relative path"/ },
  ON_DIRECTORY: {
    name: 'TypeError',
    message: /one "path inside the temporary directory"/,
  },
};

const makeNaming = (name) => {
  return class extends Transferrer {
    static generateFileName() {
      return name;
    }
  };
};

const makeSpooling = (chunks, bases) => {
  const family = makeFamily(bases);
  const distributor = new family.Distributor(makeSource(chunks));

  Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 0);

  return { distributor, family };
};

describe('TemporaryFileTransferrer', () => {
  describe('::generateFileName()', () => {
    it('should name a fugue temporary file', () => {
      assert.match(Transferrer.generateFileName(), /^fugue-[\da-f-]{36}\.tmp$/);
    });

    it('should answer a fresh name on every call', () => {
      assert.notEqual(
        Transferrer.generateFileName(),
        Transferrer.generateFileName(),
      );
    });
  });

  describe('constructor()', () => {
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

    it('should take the name from the class being built', async () => {
      class NamedTransferrer extends Transferrer {
        static generateFileName() {
          return NAMED;
        }
      }

      const { distributor, family } = makeSpooling(['a'], {
        medium: NamedTransferrer,
      });

      assert.deepEqual(await drain(distributor.fork()), ['a']);

      const [medium] = family.created;

      assert.equal(medium.pathname, join(tmpdir(), NAMED));

      await distributor.destroy();
      await medium.release;
    });

    it('should take a relative name that reaches into a directory', () => {
      const NestedTransferrer = makeNaming(NESTED);

      assert.equal(new NestedTransferrer().pathname, join(tmpdir(), NESTED));
    });

    it('should refuse an absolute or climbing name', async () => {
      const refused = [join(tmpdir(), NAMED), `../${NAMED}`];

      for (const name of refused) {
        const { distributor } = makeSpooling(['a'], {
          medium: makeNaming(name),
        });

        await assert.rejects(drain(distributor.fork()), EXPECTED.OUTSIDE);
      }
    });

    it('should refuse a name that is the temporary directory itself', async () => {
      const refused = ['', '.', 'probe-nested/..'];

      for (const name of refused) {
        const { distributor } = makeSpooling(['a'], {
          medium: makeNaming(name),
        });

        await assert.rejects(drain(distributor.fork()), EXPECTED.ON_DIRECTORY);
      }
    });

    it('should refuse a name that is not a string', async () => {
      const { distributor } = makeSpooling(['a'], { medium: makeNaming(0) });

      await assert.rejects(drain(distributor.fork()), EXPECTED.TYPED);
    });
  });
});
