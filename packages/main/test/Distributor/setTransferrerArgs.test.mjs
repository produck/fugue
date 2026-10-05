import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as Fugue from '@produck/fugue';

import {
  makeFamily,
  makeSource,
  TestDistributor,
  TestTransferrer,
} from '#test/baseline.mjs';

const { _S: TRANSFERRER_S } = Fugue.SYMBOL.TRANSFERRER;

const EXPECTED = {
  CONSUMED: { message: /Transferrer args have been consumed/ },
};

describe('.setTransferrerArgs()', () => {
  it('should hand the whole argument array to PARSE_ARGUMENTS', async () => {
    const parsed = [];

    class ParsingTransferrer extends TestTransferrer {}

    ParsingTransferrer[TRANSFERRER_S.PARSE_ARGUMENTS] = (args) => {
      parsed.push(args);

      return args.map((arg) => `${arg}!`);
    };

    const family = makeFamily({ medium: ParsingTransferrer });
    const distributor = new family.Distributor(makeSource(['a']));
    const reader = distributor.fork().getReader();

    distributor.setTransferrerArgs('x', 'y');
    Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 0);

    await reader.read();

    assert.deepEqual(parsed, [['x', 'y']]);
    assert.deepEqual(family.created.at(-1).args, ['x!', 'y!']);
  });

  it('should pass the array through when the medium kept the default', async () => {
    const family = makeFamily();
    const distributor = new family.Distributor(makeSource(['a']));
    const reader = distributor.fork().getReader();

    distributor.setTransferrerArgs('x', 'y');
    Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 0);

    await reader.read();

    assert.deepEqual(family.created.at(-1).args, ['x', 'y']);
  });

  it('should keep the arguments for the switch', async () => {
    const family = makeFamily();
    const distributor = new family.Distributor(makeSource(['a']));
    const reader = distributor.fork().getReader();

    distributor.setTransferrerArgs('first');
    distributor.setTransferrerArgs('second', 'third');

    assert.equal(family.created.length, 0);

    Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 0);

    await reader.read();

    assert.deepEqual(family.created.at(-1).args, ['second', 'third']);
  });

  it('should throw once degraded', async () => {
    const distributor = new TestDistributor(makeSource(['a']));
    const reader = distributor.fork().getReader();

    Fugue.Options.Tune.MaxChunkStashByteLength(distributor, 0);

    await reader.read();

    assert.equal(distributor.degraded, true);

    const attempt = () => distributor.setTransferrerArgs('x');

    assert.throws(attempt, EXPECTED.CONSUMED);
  });
});
