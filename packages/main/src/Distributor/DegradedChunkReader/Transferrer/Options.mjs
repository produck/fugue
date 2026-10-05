import { Get } from '../../Options/index.mjs';

export function getMaxInitializeRetryCount(distributor) {
  return Get.MaxTransferrerInitializeRetryCount(distributor);
}

export function getInitializeRetryInterval(distributor) {
  return Get.TransferrerInitializeRetryInterval(distributor);
}

export function getMaxDumpRetryCount(distributor) {
  return Get.MaxTransferrerDumpRetryCount(distributor);
}

export function getDumpRetryInterval(distributor) {
  return Get.TransferrerDumpRetryInterval(distributor);
}

export function getMaxDrainRetryCount(distributor) {
  return Get.MaxTransferrerDrainRetryCount(distributor);
}

export function getDrainRetryInterval(distributor) {
  return Get.TransferrerDrainRetryInterval(distributor);
}

export function getMaxBacklogWarningByteLength(distributor) {
  return Get.MaxTransferrerBacklogWarningByteLength(distributor);
}
