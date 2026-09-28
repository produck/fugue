import * as Ow from '@produck/ow';
import Abstract, { Member as M } from '@produck/es-abstract';

import { I, $I, _I, _S, A } from './_Symbol.mjs';
import { PART, _A } from './_External.mjs';
import * as Part from '../../Part/index.mjs';
import * as Options from '../../Options/index.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  [I.DUMPING] = null;
  [I.DUMPING_ERROR] = null;
  [I.DONE] = false;
  [I.DROPPED] = false;

  [I.SETTLE]() {
    const waitingPositions = this[I.WAITING_POSITION_TABLE];

    if (waitingPositions.size === 0) {
      return;
    }

    const total = this[A.I.WRITTEN_COUNT] + this[I.PENDING_CHUNKS].length;
    const isTerminal =
      this[I.DONE] ||
      this[I.DUMPING_ERROR] !== null ||
      this[I.DRAINING_ERROR] !== null;

    for (const [release, position] of waitingPositions) {
      if (position < total || isTerminal) {
        waitingPositions.delete(release);
        release(position < total);
      }
    }
  }

  async [I.DUMP](stash) {
    const distributor = this[PART.$I.DISTRIBUTOR];
    const maxRetryCount = Options.Get.MaxDumpRetryCount(distributor);
    const retryInterval = Options.Get.DumpRetryInterval(distributor);
    const state = { retry: 0, cause: null };

    while (!this[I.DROPPED]) {
      try {
        await this[_I.DUMP](stash);
        state.cause = null;

        break;
      } catch (cause) {
        state.cause = cause;
        this[PART.$I.WARN]('transferrer-dump-failed', { ...state });

        if (state.retry >= maxRetryCount) {
          break;
        }

        state.retry++;
        await sleep(retryInterval);
      }
    }

    if (this[I.DROPPED]) {
      stash[_A.STASH.$I.DROP]();

      return;
    }

    if (state.cause !== null) {
      this[I.DUMPING_ERROR] = state.cause;
      this[I.SETTLE]();

      return;
    }

    const { length } = stash;

    stash[_A.STASH.$I.DROP]();
    this[I.PENDING_CHUNKS].splice(0, length);
    this[A.I.WRITTEN_COUNT] = length;
    this[I.SETTLE]();
  }

  [$I.DUMP](stash) {
    this[I.PENDING_CHUNKS] = [...stash.chunks()];
    this[I.DUMPING] = this[I.DUMP](stash);
  }

  async [I.DRAIN](retry = 0) {
    if (this[I.DUMPING] !== null) {
      await Promise.allSettled([this[I.DUMPING]]);
    }

    // A drain started while the dump was still in flight wakes up here on a
    //   failed dump — $I.WRITE guards only the drains started after it. The
    //   chunks already queued stay put, for the queue still serves them.
    while (
      this[I.DUMPING_ERROR] === null &&
      this[I.PENDING_CHUNKS].length > 0
    ) {
      const buffer = this[I.PENDING_CHUNKS][0];

      try {
        await this[_I.WRITE](buffer);
      } catch (cause) {
        // TODO: settle the post-processing of this point (EXCEPTIONS.md).
        this[PART.$I.WARN]('transferrer-write-failed', { cause, retry });
        this[I.DRAINING_ERROR] = cause;
        this[I.SETTLE]();
        // setTimeout(() => this[I.DRAIN](retry + 1), 10);
        break;
      }

      this[I.PENDING_CHUNKS].shift();
      this[I.PENDING_BYTE_LENGTH] -= buffer.byteLength;
      this[A.I.WRITTEN_COUNT] += 1;
    }

    this[I.DRAINING] = null;
  }

  [$I.WRITE](chunk) {
    const error = this[I.DUMPING_ERROR] ?? this[I.DRAINING_ERROR];

    if (error !== null) {
      Ow.throw(error);
    }

    this[I.PENDING_CHUNKS].push(chunk);
    this[I.PENDING_BYTE_LENGTH] += chunk.byteLength;
    this[I.SETTLE]();

    if (this[I.DRAINING] === null) {
      this[I.DRAINING] = this[I.DRAIN]();
    }
  }

  async [$I.WAIT_POSITION](position) {
    const { promise, resolve: release } = Promise.withResolvers();

    this[I.WAITING_POSITION_TABLE].set(release, position);
    this[I.SETTLE]();

    const accepted = await promise;
    const error = this[I.DUMPING_ERROR] ?? this[I.DRAINING_ERROR];

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
      this[PART.$I.WARN]('drop-failed', cause);
    }
  }

  get dumping() {
    return this[I.DUMPING];
  }

  get done() {
    return this[I.DONE];
  }

  get error() {
    return this[I.DUMPING_ERROR] ?? this[I.DRAINING_ERROR];
  }

  get dropped() {
    return this[I.DROPPED];
  }

  get pendingByteLength() {
    return this[I.PENDING_BYTE_LENGTH];
  }
}

export default Abstract(
  AbstractTransferrer,
  Abstract({
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
