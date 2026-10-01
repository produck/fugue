import * as Core from '@produck/readable-stream-distributor';

import * as TemporaryFile from '@produck/readable-stream-distributor-degraded-temporary-file';

const { Distributor, SYMBOL } = Core;
const { ChunkReader, Transferrer } = TemporaryFile;
const { DEGRADED_CHUNK_READER_CTOR } = SYMBOL.DISTRIBUTOR._S;
const { _S: READER_S } = SYMBOL.DEGRADED_CHUNK_READER;
const { _I: TRANSFERRER } = SYMBOL.TRANSFERRER;

export const makeSource = (chunks = []) => {
  let pulled = 0;

  return new ReadableStream({
    pull(controller) {
      if (pulled < chunks.length) {
        controller.enqueue(Buffer.from(chunks[pulled]));
        pulled++;
      } else {
        controller.close();
      }
    },
  });
};

export const drain = async (stream) => {
  const got = [];

  for await (const chunk of stream) {
    got.push(chunk.toString());
  }

  return got;
};

export const makeFamily = (bases = {}) => {
  const { medium: MediumBase = Transferrer, reader: ReaderBase = ChunkReader } =
    bases;
  const created = [];

  class Medium extends MediumBase {
    release = null;

    constructor(...args) {
      super(...args);
      created.push(this);
    }

    [TRANSFERRER.DROP]() {
      this.release = super[TRANSFERRER.DROP]();

      return this.release;
    }
  }

  class Reader extends ReaderBase {
    static get [READER_S.TRANSFERRER_CTOR]() {
      return Medium;
    }
  }

  class FamilyDistributor extends Distributor {}

  FamilyDistributor[DEGRADED_CHUNK_READER_CTOR] = Reader;

  return { Distributor: FamilyDistributor, Medium, Reader, created };
};
