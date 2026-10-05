import { ThrowTypeError } from '@produck/argot';

export function ReadableStreamResult(value) {
  if (typeof value !== 'object' || value === null) {
    ThrowTypeError('result', 'an object');
  }

  if (typeof value.done !== 'boolean') {
    ThrowTypeError('result.done', 'a boolean');
  }

  if (!value.done && value.value === undefined) {
    ThrowTypeError('result.value', 'a chunk');
  }

  return value;
}
