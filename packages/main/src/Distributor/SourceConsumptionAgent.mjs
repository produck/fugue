import { $I, A } from './_Symbol.mjs';
import { _A, PART, TRANSFERRER } from './_Borrow.mjs';
import * as Part from './Part/index.mjs';
import * as Options from './Options/index.mjs';

const { Get } = Options;

export default class SourceConsumptionAgent extends Part.Concrete {
  pulling = null;
  pulledChunkCount = 0;

  get pullingSettled() {
    return Promise.allSettled([this.pulling]);
  }

  async settlePulling() {
    try {
      await this.pull();
    } finally {
      this.pulling = null;
    }
  }

  // Ensure the chunk is ready before downstream actually consumes it.
  async ensure(target) {
    const distributor = this[PART.$I.DISTRIBUTOR];
    const source = distributor[A.I.SOURCE];

    while (target >= this.pulledChunkCount && !source.finished) {
      if (this.pulling === null) {
        this.pulling = this.settlePulling();
      }

      await this.pulling;
    }

    // Tail of the guarantee above: a pull still in flight belongs to another
    //   copy, so the store is not settled yet. No driving pattern reaches it
    //   (six of them, 14k ensure calls, see DEV.md); nothing outside rules it
    //   out, so the wait stays.
    /* c8 ignore next 3 */
    if (source.finished && this.pulling !== null) {
      await this.pulling;
    }
  }

  async pull() {
    const distributor = this[PART.$I.DISTRIBUTOR];
    const { value, done } = await distributor[A.I.SOURCE].read();

    if (distributor.degraded) {
      this.toTransferrer(value, done);
    } else {
      this.toStash(value, done);
      this.degradeIfNeeded();
    }

    if (!done) {
      this.pulledChunkCount++;
    }
  }

  degradeIfNeeded() {
    const distributor = this[PART.$I.DISTRIBUTOR];
    const stash = distributor[A.$I.STASH];

    if (stash.byteLength <= Get.MaxChunkStashByteLength(distributor)) {
      return;
    }

    if (stash.done && !Get.DegradeOnChunkStashFullAndDone(distributor)) {
      return;
    }

    distributor[$I.DEGRADE]();
  }

  toStash(chunk, done) {
    const distributor = this[PART.$I.DISTRIBUTOR];
    const stash = distributor[A.$I.STASH];

    if (done) {
      return void stash[_A.STASH.$I.SET_DONE]();
    }

    stash[_A.STASH.$I.PUSH](chunk);
  }

  toTransferrer(chunk, done) {
    const transferrer = this[PART.$I.DISTRIBUTOR][$I.TRANSFERRER];

    if (done) {
      return void transferrer[TRANSFERRER.$I.SET_DONE]();
    }

    transferrer[TRANSFERRER.$I.WRITE](chunk);
  }
}
