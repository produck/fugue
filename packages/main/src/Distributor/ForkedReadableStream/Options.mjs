import { Get } from '../Options/index.mjs';

export function getHighWaterMark(distributor) {
  return Get.ForkedReadableStreamHighWaterMark(distributor);
}
