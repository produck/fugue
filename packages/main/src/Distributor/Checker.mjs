import { Boolean, Is } from '@produck/argot';

const _isReadableStream = Is.Instance.Of(ReadableStream);

export const isReadableStream = Boolean.Adapter.ThrowFalse(_isReadableStream);
