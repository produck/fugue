import { Common } from '@produck/argot';

export const isReadableStream = Common.ThrowFalse((value) => {
  return value instanceof ReadableStream;
});
