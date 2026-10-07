import { Ow } from '@produck/argot';

import * as Options from './Options.mjs';
import { $I, A } from './_Symbol.mjs';
import { DISTRIBUTOR, _A } from './_Borrow.mjs';

export default class ForkedReadableStream extends ReadableStream {
  constructor(distributor, bufferReader) {
    const registry = distributor[DISTRIBUTOR.A.$I.REGISTRY];
    const highWaterMark = Options.getHighWaterMark(distributor);
    let _controller;

    const conclude = () => {
      this[A.I.READER][_A.READER.$I.CLOSE]();
      registry.prune(this);
    };

    const start = (controller) => (_controller = controller);
    const cancel = () => conclude();

    const read = async () => {
      try {
        return await this[A.I.READER][_A.READER.$I.ENSURE_THEN_READ]();
      } catch (cause) {
        conclude();
        Ow.throw(cause);
      }
    };

    const pull = async (controller) => {
      const result = await read();

      if (result.done) {
        controller.close();
        conclude();
      } else {
        controller.enqueue(result.value);
      }
    };

    super({ start, pull, cancel }, { highWaterMark });
    this[A.I.READER] = bufferReader;
    registry.add(this, _controller);
  }

  get [A.$I.READER]() {
    return this[A.I.READER];
  }

  [$I.SET_DEGRADED_CHUNK_READER](reader) {
    this[A.I.READER] = reader;
  }
}
