import * as Ow from '@produck/ow';
import { ErrorMessage, ThrowTypeError } from '@produck/type-error';

export function NonNegativeInteger(value) {
  if (!Number.isInteger(value) || value < 0) {
    ThrowTypeError('member', 'non-negative integer');
  }

  return value;
}

export function NonNegativeIntegerOrInfinity(value) {
  if (value !== Infinity && (!Number.isInteger(value) || value < 0)) {
    ThrowTypeError('member', 'non-negative integer or Infinity');
  }

  return value;
}

export function Boolean(value) {
  if (typeof value !== 'boolean') {
    ThrowTypeError('member', 'boolean');
  }

  return value;
}

export function HighWaterMark(value) {
  if (typeof value === 'bigint') {
    Ow.Error.Type('Cannot convert a BigInt value to a number');
  }

  const number = Number(value);

  if (Number.isNaN(number) || number < 0) {
    Ow.Error.Range(ErrorMessage('member', 'non-negative number'));
  }

  return value;
}
