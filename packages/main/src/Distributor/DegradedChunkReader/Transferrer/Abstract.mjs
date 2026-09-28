import * as Ow from '@produck/ow';
import Abstract, { Member as M } from '@produck/es-abstract';

import { I, $I, _I, _S, A } from './_Symbol.mjs';
import { PART, _A } from './_External.mjs';
import * as Part from '../../Part/index.mjs';

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
  [I.DUMPING] = null;
  [I.ERROR] = null;
  [I.DONE] = false;
  [I.DROPPED] = false;

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

  [I.FAIL](cause) {
    if (this[I.ERROR] === null) {
      this[I.ERROR] = cause;
    }

    this[I.SETTLE]();
  }

  async [I.START_DUMPING](stash) {
    this[I.PENDING_CHUNKS] = [...stash.chunks()];

    try {
      await this[_I.DUMP](stash);
    } catch (cause) {
      this[I.FAIL](cause);
      // TODO: settle the post-processing of this point (EXCEPTIONS.md).
      this[PART.$I.WARN]('transferrer-dump-failed', cause);
      Ow.Error.Common('Failed to dump the ChunkStash.', { cause });
    }

    const { length } = stash;

    stash[_A.STASH.$I.DROP]();
    this[I.PENDING_CHUNKS].splice(0, length);
    this[A.I.WRITTEN_COUNT] = length;
    this[I.SETTLE]();
  }

  [$I.DUMP](stash) {
    return (this[I.DUMPING] = this[I.START_DUMPING](stash));
  }

  async [I.DRAIN]() {
    if (this[I.DUMPING] !== null) {
      await Promise.allSettled([this[I.DUMPING]]);
    }

    // A drain started while the dump was still in flight wakes up here on a
    //   failed dump — $I.WRITE guards only the drains started after it. The
    //   chunks already queued stay put, for the queue still serves them.
    if (this[I.ERROR] === null) {
      while (this[I.PENDING_CHUNKS].length > 0) {
        const buffer = this[I.PENDING_CHUNKS][0];

        try {
          await this[_I.WRITE](buffer);
        } catch (cause) {
          this[I.FAIL](cause);
          // TODO: settle the post-processing of this point (EXCEPTIONS.md).
          this[PART.$I.WARN]('transferrer-write-failed', cause);
          break;
        }

        this[I.PENDING_CHUNKS].shift();
        this[I.PENDING_BYTE_LENGTH] -= buffer.byteLength;
        this[A.I.WRITTEN_COUNT] += 1;
      }
    }

    this[I.DRAINING] = null;
  }

  [$I.WRITE](chunk) {
    if (this[I.ERROR] !== null) {
      Ow.throw(this[I.ERROR]);
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

    if (!accepted && this[I.ERROR] !== null) {
      Ow.throw(this[I.ERROR]);
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
    return this[I.ERROR];
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
