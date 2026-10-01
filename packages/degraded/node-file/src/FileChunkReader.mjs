import * as fs from 'node:fs';

import * as Distributor from '@produck/readable-stream-distributor';

import { FileTransferrer } from './FileTransferrer.mjs';
import * as Frame from './Frame.mjs';

const { DegradedChunkReader, SYMBOL } = Distributor;

export class FileChunkReader extends DegradedChunkReader {
  static get [SYMBOL.DEGRADED_CHUNK_READER._S.TRANSFERRER_CTOR]() {
    return FileTransferrer;
  }

  handle = null;
  cursor = 0;

  async [SYMBOL.DEGRADED_CHUNK_READER._I.INITIALIZE]() {
    const handle = await fs.promises.open(this.transferrer.pathname, 'r');

    // The driver stops retrying once the reader is closed, so an open lands on
    //   a closed reader only when the close arrived while this open was in
    //   flight. Nothing drives that shape past this point; the release stays,
    //   because the handle is this reader's to close.
    /* c8 ignore next 3 */
    if (this.closed) {
      return void handle.close();
    }

    this.handle = handle;
  }

  async [SYMBOL.DEGRADED_CHUNK_READER._I.SEEK]() {
    const byteLength = await Frame.readHeader(this.handle, this.cursor);

    // The position gate admits a read back only below the watermark, so the
    //   cursor never stands past the last record here; the answer stays for
    //   the contract's sake.
    /* c8 ignore next 3 */
    if (byteLength === null) {
      return false;
    }

    this.cursor += Frame.HEADER_LENGTH + byteLength;

    return true;
  }

  async [SYMBOL.DEGRADED_CHUNK_READER._I.READ]() {
    const byteLength = await Frame.readHeader(this.handle, this.cursor);
    const result = { done: false, value: undefined };

    if (byteLength === null) {
      result.done = true;
    } else {
      const position = this.cursor + Frame.HEADER_LENGTH;
      const value = Buffer.alloc(byteLength);

      result.value = value;
      await this.handle.read(value, 0, byteLength, position);
      this.cursor += Frame.HEADER_LENGTH + byteLength;
    }

    return result;
  }

  async [SYMBOL.DEGRADED_CHUNK_READER._I.CLOSE]() {
    if (this.handle !== null) {
      await this.handle.close();
    }

    this.handle = null;
  }
}
