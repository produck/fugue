import * as Ow from '@produck/ow';
import { Common } from '@produck/argot';
import Abstract, { Member as M } from '@produck/es-abstract';

import { I, $I, _I, _S, A } from './_Symbol.mjs';
import { PART, _A } from './_External.mjs';
import * as Options from './Options.mjs';
import * as Part from '../../Part/index.mjs';
import * as Warning from '../../Warning.mjs';

const CODE = Warning.CODES.TRANSFERRER;

class AbstractTransferrer extends Part.Abstract {
  static [_S.PARSE_ARGUMENTS](args) {
    return args;
  }

  constructor() {
    super();
  }

  [A.I.WRITTEN_COUNT] = 0;
  [I.PENDING_CHUNKS] = [];
  [I.PENDING_BYTE_LENGTH] = 0;
  [I.WAITING_POSITION_TABLE] = new Map();
  [I.DRAINING] = null;
  [I.DRAINING_ERROR] = null;
  [I.PREPARING] = null;
  [I.PREPARING_ERROR] = null;
  [I.DONE] = false;
  [I.DROPPED] = false;

  get [I.ERROR]() {
    return this[I.PREPARING_ERROR] ?? this[I.DRAINING_ERROR];
  }

  [I.SETTLE]() {
    const waitingPositions = this[I.WAITING_POSITION_TABLE];

    if (waitingPositions.size === 0) {
      return;
    }

    const total = this[A.I.WRITTEN_COUNT] + this[I.PENDING_CHUNKS].length;
    const isTerminal = this[I.DONE] || this[I.ERROR] !== null;

    for (const [release, position] of waitingPositions) {
      if (position < total || isTerminal) {
        waitingPositions.delete(release);
        release(position < total);
      }
    }
  }

  async [I.INITIALIZE]() {
    const distributor = this[PART.$I.DISTRIBUTOR];
    const maxRetryCount = Options.getMaxInitializeRetryCount(distributor);
    const retryInterval = Options.getInitializeRetryInterval(distributor);
    const state = { retry: 0, cause: null };

    while (!this[I.DROPPED]) {
      try {
        await this[_I.INITIALIZE]();

        return true;
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

    if (!this[I.DROPPED]) {
      this[I.PREPARING_ERROR] = state.cause;
      this[I.SETTLE]();
    }

    return false;
  }

  async [I.DUMP](stash) {
    const distributor = this[PART.$I.DISTRIBUTOR];
    const maxRetryCount = Options.getMaxDumpRetryCount(distributor);
    const retryInterval = Options.getDumpRetryInterval(distributor);
    const state = { retry: 0, cause: null };
    let ok = false;

    while (!this[I.DROPPED]) {
      try {
        await this[_I.DUMP](stash);
        ok = true;

        break;
      } catch (cause) {
        state.cause = cause;
        this[PART.$I.WARN](CODE.DUMP_FAILED, { ...state });

        if (state.retry >= maxRetryCount) {
          break;
        }

        state.retry++;
        await Common.sleep(retryInterval);
      }
    }

    if (this[I.DROPPED]) {
      return void stash[_A.STASH.$I.DROP]();
    }

    if (ok) {
      const { length } = stash;

      stash[_A.STASH.$I.DROP]();
      this[I.PENDING_CHUNKS].splice(0, length);
      this[A.I.WRITTEN_COUNT] = length;
    } else {
      this[I.PREPARING_ERROR] = state.cause;
    }

    this[I.SETTLE]();
  }

  async [I.PREPARE](stash) {
    if (await this[I.INITIALIZE]()) {
      await this[I.DUMP](stash);

      return;
    }

    if (this[I.DROPPED]) {
      stash[_A.STASH.$I.DROP]();
    }
  }

  [$I.PREPARE](stash) {
    this[I.PENDING_CHUNKS] = [...stash.chunks()];
    this[I.PREPARING] = this[I.PREPARE](stash);
  }

  async [I.DRAIN_HEAD](buffer) {
    const distributor = this[PART.$I.DISTRIBUTOR];
    const maxRetryCount = Options.getMaxDrainRetryCount(distributor);
    const retryInterval = Options.getDrainRetryInterval(distributor);
    const state = { retry: 0, cause: null };

    while (!this[I.DROPPED]) {
      try {
        await this[_I.WRITE](buffer);

        return true;
      } catch (cause) {
        state.cause = cause;
        this[PART.$I.WARN](CODE.WRITE_FAILED, { ...state });

        if (state.retry >= maxRetryCount) {
          break;
        }

        state.retry++;
        await Common.sleep(retryInterval);
      }
    }

    if (!this[I.DROPPED]) {
      this[I.DRAINING_ERROR] = state.cause;
      this[I.SETTLE]();
    }

    return false;
  }

  async [I.DRAIN]() {
    if (this[I.PREPARING] !== null) {
      await Promise.allSettled([this[I.PREPARING]]);
    }

    if (this[I.PREPARING_ERROR] !== null) {
      this[I.DRAINING] = null;

      return;
    }

    // A drain started while the dump was still in flight wakes up here on a
    //   failed dump — $I.WRITE guards only the drains started after it. The
    //   chunks already queued stay put, for the queue still serves them.
    while (!this[I.DROPPED]) {
      const chunkLength = this[I.PENDING_CHUNKS].length;
      const error = this[I.PREPARING_ERROR];

      if (error !== null || chunkLength === 0) {
        break;
      }

      const buffer = this[I.PENDING_CHUNKS][0];

      if (!(await this[I.DRAIN_HEAD](buffer))) {
        break;
      }

      this[I.PENDING_CHUNKS].shift();
      this[I.PENDING_BYTE_LENGTH] -= buffer.byteLength;
      this[A.I.WRITTEN_COUNT]++;
    }

    this[I.DRAINING] = null;
  }

  [$I.WRITE](chunk) {
    const error = this[I.ERROR];

    if (error !== null) {
      Ow.throw(error);
    }

    this[I.PENDING_CHUNKS].push(chunk);
    this[I.PENDING_BYTE_LENGTH] += chunk.byteLength;
    this[I.SETTLE]();

    if (this[I.DRAINING] === null) {
      this[I.DRAINING] = this[I.DRAIN]();
    }

    const distributor = this[PART.$I.DISTRIBUTOR];
    const warningLength = Options.getMaxBacklogWarningByteLength(distributor);
    const pendingByteLength = this[I.PENDING_BYTE_LENGTH];

    if (pendingByteLength > warningLength) {
      this[PART.$I.WARN](CODE.BACKLOG, { pendingByteLength });
    }
  }

  async [$I.WAIT_POSITION](position) {
    const { promise, resolve: release } = Promise.withResolvers();

    this[I.WAITING_POSITION_TABLE].set(release, position);
    this[I.SETTLE]();

    const accepted = await promise;
    const error = this[I.ERROR];

    if (!accepted && error !== null) {
      Ow.throw(error);
    }
  }

  [$I.PEEK](position) {
    return this[I.PENDING_CHUNKS][position - this[A.I.WRITTEN_COUNT]];
  }

  [$I.SET_DONE]() {
    this[I.DONE] = true;
    this[I.SETTLE]();
  }

  async [$I.DROP]() {
    this[I.DROPPED] = true;
    this[I.PENDING_CHUNKS] = [];
    this[I.PENDING_BYTE_LENGTH] = 0;

    try {
      await this[_I.DROP]();
    } catch (cause) {
      this[PART.$I.WARN](CODE.DROP_FAILED, { cause });
    }
  }

  get prepared() {
    return this[I.PREPARING];
  }

  get done() {
    return this[I.DONE];
  }

  get dropped() {
    return this[I.DROPPED];
  }

  get pendingByteLength() {
    return this[I.PENDING_BYTE_LENGTH];
  }

  [_I.INITIALIZE]() {}
}

export default Abstract(
  AbstractTransferrer,
  Abstract({
    [_I.INITIALIZE]: M.Method(),
    [_I.DUMP]: M.Method(),
    [_I.WRITE]: M.Method(),
    [_I.DROP]: M.Method(),
  }),
  Abstract.Static({
    [_S.PARSE_ARGUMENTS]: M.Method()
      .args(M.Instance(Array))
      .returns(M.Instance(Array)),
  }),
);
