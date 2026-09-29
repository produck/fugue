import { open } from 'node:fs/promises';

import { SYMBOL, Transferrer } from '@produck/readable-stream-distributor';

const { _I, _S } = SYMBOL.TRANSFERRER;

const FRAME_HEADER = 4;

const validated = (path) => {
  if (typeof path !== 'string') {
    throw new TypeError('Invalid "path", one "String" expected.');
  }

  return path;
};

const frameOf = (chunk) => {
  const header = Buffer.alloc(FRAME_HEADER);

  header.writeUInt32BE(chunk.byteLength);

  return Buffer.concat([header, chunk]);
};

const close = async (medium) => {
  await medium.handle?.close();
  medium.handle = null;
};

export class FileTransferrer extends Transferrer {
  handle = null;
  spooledByteLength = 0;

  static [_S.PARSE_ARGUMENTS](args) {
    const [path] = args;

    return [validated(path)];
  }

  constructor(path) {
    super();

    this.path = validated(path);
  }

  async [_I.DUMP](stash) {
    const buffer = Buffer.concat([...stash.chunks()].map(frameOf));

    this.handle ??= await open(this.path, 'w');

    if (this.dropped) {
      await close(this);

      return;
    }

    await this.handle.write(buffer, 0, buffer.byteLength, 0);
    this.spooledByteLength = buffer.byteLength;
  }

  async [_I.WRITE](chunk) {
    const buffer = frameOf(chunk);

    await this.handle.write(
      buffer,
      0,
      buffer.byteLength,
      this.spooledByteLength,
    );

    this.spooledByteLength += buffer.byteLength;
  }

  async [_I.DROP]() {
    await close(this);
  }
}
