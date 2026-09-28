import { deepFreeze } from '@produck/deep-freeze-enumerable';

const I_STREAM = Symbol('.#stream');
const I_READER = Symbol('.#reader');
const I_DONE = Symbol('.#done');
const I_CANCELLED = Symbol('.#cancelled');
const I_READING = Symbol('.#reading');
const I_READ = Symbol('.#read()');

export const I = deepFreeze({
  STREAM: I_STREAM,
  READER: I_READER,
  DONE: I_DONE,
  CANCELLED: I_CANCELLED,
  READING: I_READING,
  READ: I_READ,
});
