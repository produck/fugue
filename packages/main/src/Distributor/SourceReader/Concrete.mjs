import * as Ow from '@produck/ow';

import { I } from './_Symbol.mjs';
import { PART } from './_External.mjs';
import * as Part from '../Part/index.mjs';
import * as Warning from '../Warning.mjs';

const CODE = Warning.CODES.SOURCE;

export default class SourceReader extends Part.Abstract {
  [I.DONE] = false;
  [I.CANCELLED] = false;
  [I.READING] = null;

  constructor(distributor, stream) {
    super(distributor);

    if (stream.locked) {
      Ow.Error.Common('Source stream must not be locked');
    }

    this[I.STREAM] = stream;
    this[I.READER] = stream.getReader();
  }

  get done() {
    return this[I.DONE];
  }

  get cancelled() {
    return this[I.CANCELLED];
  }

  get finished() {
    return this.done || this.cancelled;
  }

  async [I.READ]() {
    // Guarantee: `pull()` is the only caller of `read()`, and `ensure()`
    //   starts no pull once `finished` (`done || cancelled`) is true — so a
    //   read never starts after a cancel.
    try {
      const result = await this[I.READER].read();

      if (!this[I.CANCELLED]) {
        this[I.DONE] = result.done;
      }

      return result;
    } catch (cause) {
      this[PART.$I.WARN](CODE.READ_FAILED, { cause });
      Ow.throw(cause);
      // c8/V8: the `finally` clause range never counts.
      /* c8 ignore next */
    } finally {
      this[I.READING] = null;
    }
  }

  read() {
    if (this[I.READING] === null) {
      this[I.READING] = this[I.READ]();
    }

    return this[I.READING];
  }

  async cancel(reason) {
    // Guarantee: `$I.DESTROY` is the only caller, and it is cached by
    //   `$I.DESTROYED`, so a cancel never arrives twice.
    this[I.CANCELLED] = true;

    try {
      await this[I.READER].cancel(reason);
    } catch (cause) {
      this[PART.$I.WARN](CODE.CANCEL_FAILED, { cause });
    }
  }
}
