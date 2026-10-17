import { deepFreeze } from '@produck/deep-freeze-enumerable';

const $I_DISTRIBUTOR = Symbol('.$distributor');
const $I_WARN = Symbol('.$warn()');
const $I_METRIC = Symbol('.$metric()');
const $I_SET_DISTRIBUTOR = Symbol('.$setDistributor()');

export const $I = deepFreeze({
  DISTRIBUTOR: $I_DISTRIBUTOR,
  WARN: $I_WARN,
  METRIC: $I_METRIC,
  SET_DISTRIBUTOR: $I_SET_DISTRIBUTOR,
});
