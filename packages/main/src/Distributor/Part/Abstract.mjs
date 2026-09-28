import Abstract from '@produck/es-abstract';

import { $I } from './_Symbol.mjs';
import { DISTRIBUTOR } from './_External.mjs';

class AbstractPart {
  [$I.DISTRIBUTOR] = null;

  constructor(distributor = null) {
    this[$I.SET_DISTRIBUTOR](distributor);
  }

  [$I.SET_DISTRIBUTOR](distributor) {
    this[$I.DISTRIBUTOR] = distributor;
  }

  [$I.WARN](code, payload) {
    this[$I.DISTRIBUTOR][DISTRIBUTOR.$I.WARN](code, payload);
  }
}

export default Abstract(AbstractPart);
