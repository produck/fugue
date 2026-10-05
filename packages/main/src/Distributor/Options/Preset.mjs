import { Tune } from './Accessor.mjs';

export function noInitializeRetry(distributor) {
  Tune.MaxChunkReaderInitializeRetryCount(distributor, 0);
}

export function noTransferrerInitializeRetry(distributor) {
  Tune.MaxTransferrerInitializeRetryCount(distributor, 0);
}

export function noDumpRetry(distributor) {
  Tune.MaxTransferrerDumpRetryCount(distributor, 0);
}

export function noDrainRetry(distributor) {
  Tune.MaxTransferrerDrainRetryCount(distributor, 0);
}

export function unlimitedInitializeRetry(distributor) {
  Tune.MaxChunkReaderInitializeRetryCount(distributor, Infinity);
}

export function unlimitedTransferrerInitializeRetry(distributor) {
  Tune.MaxTransferrerInitializeRetryCount(distributor, Infinity);
}

export function unlimitedDumpRetry(distributor) {
  Tune.MaxTransferrerDumpRetryCount(distributor, Infinity);
}

export function unlimitedDrainRetry(distributor) {
  Tune.MaxTransferrerDrainRetryCount(distributor, Infinity);
}

export function noRetry(distributor) {
  noInitializeRetry(distributor);
  noTransferrerInitializeRetry(distributor);
  noDumpRetry(distributor);
  noDrainRetry(distributor);
}

export function unlimitedRetry(distributor) {
  unlimitedInitializeRetry(distributor);
  unlimitedTransferrerInitializeRetry(distributor);
  unlimitedDumpRetry(distributor);
  unlimitedDrainRetry(distributor);
}
