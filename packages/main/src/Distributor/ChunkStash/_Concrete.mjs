import { I, $I } from './_Symbol.mjs';

export default class ChunkStash {
  [I.CHUNKS] = [];
  [I.BYTE_LENGTH] = 0;
  [I.DONE] = false;

  [$I.SET_DONE]() {
    this[I.DONE] = true;
  }

  [$I.PUSH](chunk) {
    this[I.CHUNKS].push(chunk);
    this[I.BYTE_LENGTH] += chunk.byteLength;
  }

  [$I.DROP]() {
    this[I.CHUNKS] = [];
    this[I.BYTE_LENGTH] = 0;
  }

  get done() {
    return this[I.DONE];
  }

  get length() {
    return this[I.CHUNKS].length;
  }

  get byteLength() {
    return this[I.BYTE_LENGTH];
  }

  get(index) {
    return this[I.CHUNKS][index];
  }

  chunks() {
    return [...this[I.CHUNKS]].values();
  }
}
