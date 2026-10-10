import { $I } from './_Symbol.mjs';
import { DISTRIBUTOR } from './_Borrow.mjs';

class Part {
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

export default Part;
