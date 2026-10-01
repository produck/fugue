import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
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

const frameOf = (chunk) => {
  const header = Buffer.alloc(FRAME_HEADER);

  header.writeUInt32BE(chunk.byteLength);

  return Buffer.concat([header, chunk]);
};

describe('FileTransferrer', () => {
  describe('.pathname', () => {
    it('should be the file the host named', async (t) => {
      const directory = await makeTemporaryDirectory();

      t.after(() => removeTemporaryDirectory(directory));

      const path = join(directory, 'spool');
      const family = makeFamily();
      const distributor = new family.Distributor(makeSource(['a']));

      distributor.setTransferrerArgs(path);
      Options.Tune.MaxStashByteLength(distributor, 0);

      assert.deepEqual(await drain(distributor.fork()), ['a']);

      const [medium] = family.created;

      assert.equal(medium.pathname, path);

      await distributor.destroy();
      await medium.release;

      await assert.rejects(stat(path), { code: 'ENOENT' });
    });
  });

  it('should overwrite the record when a write is retried', async (t) => {
    const directory = await makeTemporaryDirectory();

    t.after(() => removeTemporaryDirectory(directory));

    const path = join(directory, 'spool');
    const retried = Promise.withResolvers();
    let attempts = 0;

    class HalfWrittenMedium extends FileTransferrer {
      async [TRANSFERRER.WRITE](chunk) {
        if (attempts++ === 0) {
          const noise = Buffer.alloc(FRAME_HEADER, 0xff);

          await this.handle.write(
            noise,
            0,
            noise.byteLength,
            this.writtenByteLength,
          );

          throw new Error('the write stopped halfway');
        }

        await super[TRANSFERRER.WRITE](chunk);
        retried.resolve();
      }
    }

    const family = makeFamily({ medium: HalfWrittenMedium });
    const distributor = new family.Distributor(makeSource(['a', 'b']));

    distributor.setTransferrerArgs(path);
    Options.Tune.MaxStashByteLength(distributor, 0);
    Options.Tune.MaxDrainRetryCount(distributor, 1);
    Options.Tune.DrainRetryInterval(distributor, 0);

    assert.deepEqual(await drain(distributor.fork()), ['a', 'b']);

    // The copy is served from the queue, so it can end before the retrying
    //   write lands; the file is only asserted once that write is through.
    await retried.promise;

    const [medium] = family.created;
    const spool = await readFile(path);

    assert.deepEqual(
      spool,
      Buffer.concat([frameOf(Buffer.from('a')), frameOf(Buffer.from('b'))]),
    );

    await distributor.destroy();
    await medium.release;
  });
});
