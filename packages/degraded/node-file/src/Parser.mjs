import { isAbsolute } from 'node:path';

import { ThrowTypeError } from '@produck/type-error';

export const absolutePathname = (value, role) => {
  if (typeof value !== 'string') {
    ThrowTypeError(role, 'string');
  }

  if (!isAbsolute(value)) {
    ThrowTypeError(role, 'absolute path');
  }

  return value;
};
