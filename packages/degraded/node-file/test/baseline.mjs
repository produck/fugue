import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as Fugue from '@produck/fugue';

import * as NodeFile from '@produck/fugue-degraded-node-file';

const { FileChunkReader, FileTransferrer } = NodeFile;
const { DEGRADED_CHUNK_READER_CTOR } = Fugue.SYMBOL.DISTRIBUTOR._S;
const { _S: READER_S } = Fugue.SYMBOL.DEGRADED_CHUNK_READER;
const { _I: TRANSFERRER } = Fugue.SYMBOL.TRANSFERRER;

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

export const makeTemporaryDirectory = () =>
  mkdtemp(join(tmpdir(), 'degraded-node-file-'));

export const removeTemporaryDirectory = (directory) =>
  rm(directory, { recursive: true, force: true });

export const makeFamily = (bases = {}) => {
  const {
    medium: MediumBase = FileTransferrer,
    reader: ReaderBase = FileChunkReader,
  } = bases;
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

  class FamilyDistributor extends Fugue.Distributor {}

  FamilyDistributor[DEGRADED_CHUNK_READER_CTOR] = Reader;

  return { Distributor: FamilyDistributor, Medium, Reader, created };
};
