import * as fs from 'node:fs';

import * as Distributor from '@produck/readable-stream-distributor';

import * as Frame from './Frame.mjs';
import * as Parser from './Parser.mjs';

const { SYMBOL, Transferrer } = Distributor;
const I_CLOSE = Symbol('.#close()');
const REMOVE_OPTIONS = { force: true, maxRetries: 5, retryDelay: 50 };

const frameOf = (chunk) => {
  const header = Buffer.alloc(Frame.HEADER_LENGTH);

  header.writeUInt32BE(chunk.byteLength);

  return Buffer.concat([header, chunk]);
};

export class FileTransferrer extends Transferrer {
  handle = null;
  writtenByteLength = 0;

  static [SYMBOL.TRANSFERRER._S.PARSE_ARGUMENTS](args) {
    return [Parser.absolutePathname(args[0], 'args[0] as pathname')];
  }

  constructor(pathname) {
    super();
    this.pathname = Parser.absolutePathname(pathname, 'args[0] as pathname');
  }

  async [SYMBOL.TRANSFERRER._I.DUMP](stash) {
    const buffer = Buffer.concat([...stash.chunks()].map(frameOf));

    if (this.handle === null) {
      this.handle = await fs.promises.open(this.pathname, 'w');
    }

    if (this.dropped) {
      return void (await this[I_CLOSE]());
    }

    await this.handle.write(buffer, 0, buffer.byteLength, 0);
    this.writtenByteLength = buffer.byteLength;
  }

  async [SYMBOL.TRANSFERRER._I.WRITE](chunk) {
    const buffer = frameOf(chunk);
    const length = buffer.byteLength;
    const position = this.writtenByteLength;

    await this.handle.write(buffer, 0, length, position);
    this.writtenByteLength += buffer.byteLength;
  }

  async [SYMBOL.TRANSFERRER._I.DROP]() {
    await this[I_CLOSE]();
  }

  async [I_CLOSE]() {
    const handle = this.handle;

    this.handle = null;

    if (handle !== null) {
      await handle.close();
    }

    await fs.promises.rm(this.pathname, REMOVE_OPTIONS);
  }
}
