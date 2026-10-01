import {
  Distributor,
  DegradedChunkReader,
  SYMBOL,
  Transferrer,
} from '@produck/fugue';

const { DEGRADED_CHUNK_READER_CTOR } = SYMBOL.DISTRIBUTOR._S;
const { _I: READER, _S: READER_S } = SYMBOL.DEGRADED_CHUNK_READER;
const { _I: TRANSFERRER } = SYMBOL.TRANSFERRER;

const MEDIUM = Symbol('.#medium');
const CURSOR = Symbol('.#cursor');

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

export const settle = async (turns = 6) => {
  for (let i = 0; i < turns; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

export class TestTransferrer extends Transferrer {
  [MEDIUM] = [];

  constructor(...args) {
    super();
    this.args = args;
  }

  [TRANSFERRER.DUMP](stash) {
    this[MEDIUM] = [...stash.chunks()];
  }

  async [TRANSFERRER.WRITE](buffer) {
    this[MEDIUM].push(buffer);
  }

  [TRANSFERRER.DROP]() {}

  get medium() {
    return this[MEDIUM];
  }
}

export class TestDegradedChunkReader extends DegradedChunkReader {
  static [READER_S.TRANSFERRER_CTOR] = TestTransferrer;

  [CURSOR] = 0;

  [READER.INITIALIZE]() {}

  [READER.SEEK]() {
    if (this[CURSOR] >= this.transferrer.medium.length) {
      return false;
    }

    this[CURSOR]++;

    return true;
  }

  [READER.READ]() {
    const medium = this.transferrer.medium;

    if (this[CURSOR] >= medium.length) {
      return { done: true, value: undefined };
    }

    const value = medium[this[CURSOR]++];

    return { done: false, value };
  }

  [READER.CLOSE]() {}
}

export class TestDistributor extends Distributor {
  static [DEGRADED_CHUNK_READER_CTOR] = TestDegradedChunkReader;
}

export const makeDistributor = (chunks = []) =>
  new TestDistributor(makeSource(chunks));

export const makeFamily = (bases = {}) => {
  const {
    medium: MediumBase = TestTransferrer,
    reader: ReaderBase = TestDegradedChunkReader,
  } = bases;
  const created = [];

  class Medium extends MediumBase {
    constructor(...args) {
      super(...args);
      created.push(this);
    }
  }

  class Reader extends ReaderBase {}

  Reader[READER_S.TRANSFERRER_CTOR] = Medium;

  class FamilyDistributor extends Distributor {}

  FamilyDistributor[DEGRADED_CHUNK_READER_CTOR] = Reader;

  return { Distributor: FamilyDistributor, Medium, Reader, created };
};
