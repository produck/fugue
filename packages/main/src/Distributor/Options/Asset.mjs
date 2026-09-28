import { Tune } from './Accessor.mjs';

export function noDumpRetry(distributor) {
  Tune.MaxDumpRetryCount(distributor, 0);
}

export function noDrainRetry(distributor) {
  Tune.MaxDrainRetryCount(distributor, 0);
}

export function unlimitedDumpRetry(distributor) {
  Tune.MaxDumpRetryCount(distributor, Infinity);
}

export function unlimitedDrainRetry(distributor) {
  Tune.MaxDrainRetryCount(distributor, Infinity);
}

export function noRetry(distributor) {
  noDumpRetry(distributor);
  noDrainRetry(distributor);
}

export function unlimitedRetry(distributor) {
  unlimitedDumpRetry(distributor);
  unlimitedDrainRetry(distributor);
}
