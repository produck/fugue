import { Tune } from './Accessor.mjs';

export function noInitializeRetry(distributor) {
  Tune.MaxInitializeRetryCount(distributor, 0);
}

export function noDumpRetry(distributor) {
  Tune.MaxDumpRetryCount(distributor, 0);
}

export function noDrainRetry(distributor) {
  Tune.MaxDrainRetryCount(distributor, 0);
}

export function unlimitedInitializeRetry(distributor) {
  Tune.MaxInitializeRetryCount(distributor, Infinity);
}

export function unlimitedDumpRetry(distributor) {
  Tune.MaxDumpRetryCount(distributor, Infinity);
}

export function unlimitedDrainRetry(distributor) {
  Tune.MaxDrainRetryCount(distributor, Infinity);
}

export function noRetry(distributor) {
  noInitializeRetry(distributor);
  noDumpRetry(distributor);
  noDrainRetry(distributor);
}

export function unlimitedRetry(distributor) {
  unlimitedInitializeRetry(distributor);
  unlimitedDumpRetry(distributor);
  unlimitedDrainRetry(distributor);
}
