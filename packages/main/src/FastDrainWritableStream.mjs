export default class FastDrainWritableStream extends WritableStream {
  constructor() {
    super({ write() {} }, { highWaterMark: Infinity });
  }
}
