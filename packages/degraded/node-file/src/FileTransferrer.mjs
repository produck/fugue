import * as fs from 'node:fs';

import * as Fugue from '@produck/fugue';

import * as Frame from './Frame.mjs';
import * as Parser from './Parser.mjs';

const I_CLOSE = Symbol('.#close()');
const REMOVE_OPTIONS = { force: true, maxRetries: 5, retryDelay: 50 };

const frameOf = (chunk) => {
  const header = Buffer.alloc(Frame.HEADER_LENGTH);

  header.writeUInt32BE(chunk.byteLength);

  return Buffer.concat([header, chunk]);
};

export class FileTransferrer extends Fugue.Transferrer {
  handle = null;
  writtenByteLength = 0;

  static [Fugue.SYMBOL.TRANSFERRER._S.PARSE_ARGUMENTS](args) {
    return [Parser.absolutePathname(args[0], 'args[0] as pathname')];
  }

  constructor(pathname) {
    super();
    this.pathname = Parser.absolutePathname(pathname, 'args[0] as pathname');
  }

  async [Fugue.SYMBOL.TRANSFERRER._I.INITIALIZE]() {
    this.handle = await fs.promises.open(this.pathname, 'w');

    // The driver abandons an attempt that raced the release, so an open lands
    //   on a released transferrer only when the release arrived while this
    //   open was in flight. Nothing drives that shape past this point; the
    //   release stays, because the file is this medium's to remove.
    /* c8 ignore next 3 */
    if (this.dropped) {
      return void (await this[I_CLOSE]());
    }
  }

  async [Fugue.SYMBOL.TRANSFERRER._I.DUMP](stash) {
    const buffer = Buffer.concat([...stash.chunks()].map(frameOf));

    await this.handle.write(buffer, 0, buffer.byteLength, 0);
    this.writtenByteLength = buffer.byteLength;
  }

  async [Fugue.SYMBOL.TRANSFERRER._I.WRITE](chunk) {
    const buffer = frameOf(chunk);
    const length = buffer.byteLength;
    const position = this.writtenByteLength;

    await this.handle.write(buffer, 0, length, position);
    this.writtenByteLength += buffer.byteLength;
  }

  async [Fugue.SYMBOL.TRANSFERRER._I.DROP]() {
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
