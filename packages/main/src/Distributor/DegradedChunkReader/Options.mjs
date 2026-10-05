import { Get } from '../Options/index.mjs';

export function getMaxInitializeRetryCount(distributor) {
  return Get.MaxChunkReaderInitializeRetryCount(distributor);
}

export function getInitializeRetryInterval(distributor) {
  return Get.ChunkReaderInitializeRetryInterval(distributor);
}
