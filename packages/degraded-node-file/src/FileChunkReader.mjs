import { open } from 'node:fs/promises';

import {
  DegradedChunkReader,
  SYMBOL,
} from '@produck/readable-stream-distributor';

import { FileTransferrer } from './FileTransferrer.mjs';

const { _I, _S } = SYMBOL.DEGRADED_CHUNK_READER;

const FRAME_HEADER = 4;

const readFrameHeader = async (handle, position) => {
  const header = Buffer.alloc(FRAME_HEADER);
  const { bytesRead } = await handle.read(header, 0, FRAME_HEADER, position);

  return bytesRead < FRAME_HEADER ? null : header.readUInt32BE(0);
};

export class FileChunkReader extends DegradedChunkReader {
  static [_S.TRANSFERRER_CTOR] = FileTransferrer;

  handle = null;
  cursor = 0;

  async [_I.INITIALIZE]() {
    const handle = await open(this.transferrer.path, 'r');

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

  async [_I.SEEK]() {
    const byteLength = await readFrameHeader(this.handle, this.cursor);

    // The position gate admits a read back only below the watermark, so the
    //   cursor never stands past the last record here; the answer stays for
    //   the contract's sake.
    /* c8 ignore next 3 */
    if (byteLength === null) {
      return false;
    }

    this.cursor += FRAME_HEADER + byteLength;

    return true;
  }

  async [_I.READ]() {
    const byteLength = await readFrameHeader(this.handle, this.cursor);

    if (byteLength === null) {
      return { done: true, value: undefined };
    }

    const value = Buffer.alloc(byteLength);

    await this.handle.read(value, 0, byteLength, this.cursor + FRAME_HEADER);
    this.cursor += FRAME_HEADER + byteLength;

    return { done: false, value };
  }

  async [_I.CLOSE]() {
    await this.handle?.close();
    this.handle = null;
  }
}
