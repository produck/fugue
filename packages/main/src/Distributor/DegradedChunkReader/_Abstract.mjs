import { Common, Ow } from '@produck/argot';
import Abstract, { Member as M } from '@produck/es-abstract';

import * as ChunkReader from '../ChunkReader/index.mjs';
import { I, $I, _I, _S, A } from './_Symbol.mjs';
import { TRANSFERRER, DISTRIBUTOR, PART, _A } from './_Borrow.mjs';
import * as Options from './Options.mjs';
import * as Warning from '../Warning.mjs';

const CODE = Warning.CODES.DEGRADED_READER;

class AbstractDegradedChunkReader extends ChunkReader.Abstract {
  [I.CLOSED] = false;
  [I.INITIALIZED];
  [A.I.SEEKED_COUNT] = 0;

  get chunkStash() {
    return this[PART.$I.DISTRIBUTOR][DISTRIBUTOR.A.$I.STASH];
  }

  get closed() {
    return this[I.CLOSED];
  }

  get transferrer() {
    return this[PART.$I.DISTRIBUTOR][DISTRIBUTOR.$I.TRANSFERRER];
  }

  [$I.REQUEST_INITIALIZE](progress) {
    this[_A.READER.A.$I.CONSUMED_COUNT] = progress;
    this[I.INITIALIZED] = this[I.INITIALIZE]();

    return this[I.INITIALIZED];
  }

  async [I.INITIALIZE]() {
    const distributor = this[PART.$I.DISTRIBUTOR];
    const maxRetryCount = Options.getMaxInitializeRetryCount(distributor);
    const retryInterval = Options.getInitializeRetryInterval(distributor);
    const state = { retry: 0, cause: null };
    let ok = false;

    await this.transferrer.prepared;

    while (!this[I.CLOSED]) {
      try {
        await this[_I.INITIALIZE]();
        ok = true;

        break;
      } catch (cause) {
        state.cause = cause;
        this[PART.$I.WARN](CODE.INITIALIZE_FAILED, { ...state });

        if (state.retry >= maxRetryCount) {
          break;
        }

        state.retry++;
        await Common.sleep(retryInterval);
      }
    }

    if (this[I.CLOSED]) {
      return;
    }

    if (!ok) {
      Ow.throw(state.cause);
    }

    await this[I.SYNC]();
  }

  async [I.SYNC]() {
    const target = this[_A.READER.A.$I.CONSUMED_COUNT];
    let count = this[A.I.SEEKED_COUNT];

    try {
      while (count < target) {
        if (!(await this[_I.SEEK]())) {
          break;
        }

        count++;
      }
    } catch (cause) {
      this[PART.$I.WARN](CODE.SEEK_FAILED, { cause });
      Ow.throw(cause);
    }

    this[A.I.SEEKED_COUNT] = count;
  }

  async [_A.READER.$I.CLOSE]() {
    if (this[I.CLOSED]) {
      return;
    }

    this[I.CLOSED] = true;

    try {
      await this[_I.CLOSE]();
    } catch (cause) {
      this[PART.$I.WARN](CODE.CLOSE_FAILED, { cause });
    }
  }

  async [_A.READER._I.READ]() {
    const transferrer = this.transferrer;
    const position = this[_A.READER.A.$I.CONSUMED_COUNT];

    await transferrer[TRANSFERRER.$I.WAIT_POSITION](position);

    const chunk = transferrer[TRANSFERRER.$I.PEEK](position);

    if (chunk !== undefined) {
      return { done: false, value: chunk };
    }

    return await this[I.READ_BACK]();
  }

  async [I.READ_BACK]() {
    await this[I.INITIALIZED];
    await this[I.SYNC]();

    let result;

    try {
      result = await this[_I.READ]();
    } catch (cause) {
      this[PART.$I.WARN](CODE.READ_FAILED, { cause });
      Ow.throw(cause);
    }

    if (!result.done) {
      this[A.I.SEEKED_COUNT]++;
    }

    return result;
  }

  async [_I.INITIALIZE]() {}
}

export default Abstract(
  AbstractDegradedChunkReader,
  Abstract({
    [_I.READ]: M.Method().returns(
      M.OrPromiseLike(ChunkReader.Parser.ReadableStreamResult),
    ),
    [_I.INITIALIZE]: M.Method().returns(M.OrPromiseLike(M.Undefined)),
    [_I.CLOSE]: M.Method().returns(M.OrPromiseLike(M.Undefined)),
    [_I.SEEK]: M.Method().returns(M.OrPromiseLike(M.Boolean)),
  }),
  Abstract.Static({
    [_S.TRANSFERRER_CTOR]: M.Function,
  }),
);
