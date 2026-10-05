import { Tune } from './Accessor.mjs';

export function noChunkReaderInitializeRetry(distributor) {
  Tune.MaxChunkReaderInitializeRetryCount(distributor, 0);
}

export function noTransferrerInitializeRetry(distributor) {
  Tune.MaxTransferrerInitializeRetryCount(distributor, 0);
}

export function noTransferrerDumpRetry(distributor) {
  Tune.MaxTransferrerDumpRetryCount(distributor, 0);
}

export function noTransferrerDrainRetry(distributor) {
  Tune.MaxTransferrerDrainRetryCount(distributor, 0);
}

export function unlimitedChunkReaderInitializeRetry(distributor) {
  Tune.MaxChunkReaderInitializeRetryCount(distributor, Infinity);
}

export function unlimitedTransferrerInitializeRetry(distributor) {
  Tune.MaxTransferrerInitializeRetryCount(distributor, Infinity);
}

export function unlimitedTransferrerDumpRetry(distributor) {
  Tune.MaxTransferrerDumpRetryCount(distributor, Infinity);
}

export function unlimitedTransferrerDrainRetry(distributor) {
  Tune.MaxTransferrerDrainRetryCount(distributor, Infinity);
}

export function noRetry(distributor) {
  noChunkReaderInitializeRetry(distributor);
  noTransferrerInitializeRetry(distributor);
  noTransferrerDumpRetry(distributor);
  noTransferrerDrainRetry(distributor);
}

export function unlimitedRetry(distributor) {
  unlimitedChunkReaderInitializeRetry(distributor);
  unlimitedTransferrerInitializeRetry(distributor);
  unlimitedTransferrerDumpRetry(distributor);
  unlimitedTransferrerDrainRetry(distributor);
}
