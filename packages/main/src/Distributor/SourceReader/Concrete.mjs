import * as Ow from '@produck/ow';

import { DISTRIBUTOR } from './_External.mjs';
import { I } from './_Symbol.mjs';

export default class SourceReader {
  [I.DONE] = false;
  [I.CANCELLED] = false;
  [I.READING] = null;

  constructor(distributor, stream) {
    if (stream.locked) {
      Ow.Error.Common('Source stream must not be locked');
    }

    this[I.DISTRIBUTOR] = distributor;
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
      // TODO: settle the post-processing of this point (EXCEPTIONS.md).
      this[I.DISTRIBUTOR][DISTRIBUTOR.$I.WARN]('source-read-failed', cause);
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
    const distributor = this[I.DISTRIBUTOR];

    this[I.CANCELLED] = true;

    try {
      await this[I.READER].cancel(reason);
    } catch (cause) {
      distributor[DISTRIBUTOR.$I.WARN]('source-cancel-failed', cause);
    }
  }
}
