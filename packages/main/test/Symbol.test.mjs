import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as Fugue from '@produck/fugue';

const OPENED = {
  DISTRIBUTOR: {
    _S: ['DEGRADED_CHUNK_READER_CTOR'],
  },
  DEGRADED_CHUNK_READER: {
    _I: ['CLOSE', 'INITIALIZE', 'READ', 'SEEK'],
    _S: ['TRANSFERRER_CTOR'],
  },
  TRANSFERRER: {
    _I: ['DROP', 'DUMP', 'INITIALIZE', 'WRITE'],
    _S: ['PARSE_ARGUMENTS'],
  },
};

describe('SYMBOL', () => {
  it('should open _I and _S of every family, and nothing else', () => {
    assert.deepEqual(
      Object.keys(Fugue.SYMBOL).sort(),
      Object.keys(OPENED).sort(),
    );

    for (const [family, layers] of Object.entries(OPENED)) {
      const opened = Fugue.SYMBOL[family];
      const familyKeys = Object.keys(opened).sort();

      assert.deepEqual(familyKeys, Object.keys(layers).sort(), family);

      for (const [layer, members] of Object.entries(layers)) {
        const table = opened[layer];
        const keys = Object.keys(table).sort();

        assert.deepEqual(keys, [...members].sort(), `${family}.${layer}`);

        for (const name of keys) {
          const kind = typeof table[name];
          const where = `${family}.${layer}.${name}`;

          assert.equal(kind, 'symbol', where);
        }
      }
    }
  });
});
