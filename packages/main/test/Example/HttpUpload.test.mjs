import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { it } from 'node:test';

import * as Fugue from '@produck/fugue';

const { DEGRADED_CHUNK_READER_CTOR } = Fugue.SYMBOL.DISTRIBUTOR._S;
const { _I: READER, _S: READER_S } = Fugue.SYMBOL.DEGRADED_CHUNK_READER;
const { _I: TRANSFERRER } = Fugue.SYMBOL.TRANSFERRER;

const FRAME_HEADER = 4;
const STASH_LIMIT = 64 * 1024;
const PAYLOAD_BYTE_LENGTH = 128 * 1024;

const makePayload = () => {
  const payload = Buffer.alloc(PAYLOAD_BYTE_LENGTH);

  for (let index = 0; index < payload.byteLength; index++) {
    payload[index] = (index * 31) & 0xff;
  }

  return payload;
};

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const frameOf = (chunk) => {
  const header = Buffer.alloc(FRAME_HEADER);

  header.writeUInt32BE(chunk.byteLength);

  return [header, chunk];
};

const readFrameHeader = async (handle, position) => {
  const header = Buffer.alloc(FRAME_HEADER);
  const { bytesRead } = await handle.read(header, 0, FRAME_HEADER, position);

  return bytesRead < FRAME_HEADER ? null : header.readUInt32BE(0);
};

class DigestSink extends Writable {
  constructor(hash) {
    super();
    this.hash = hash;
  }

  _write(chunk, encoding, callback) {
    this.hash.update(chunk);
    callback();
  }
}

class FileTransferrer extends Fugue.Transferrer {
  handle = null;
  spooledByteLength = 0;

  constructor(path) {
    super();
    this.path = path;
  }

  async [TRANSFERRER.DUMP](stash) {
    this.handle ??= await open(this.path, 'w+');

    const buffer = Buffer.concat([...stash.chunks()].flatMap(frameOf));

    await this.handle.write(buffer, 0, buffer.byteLength, 0);
    this.spooledByteLength = buffer.byteLength;
  }

  async [TRANSFERRER.WRITE](chunk) {
    const buffer = Buffer.concat(frameOf(chunk));

    await this.handle.write(
      buffer,
      0,
      buffer.byteLength,
      this.spooledByteLength,
    );

    this.spooledByteLength += buffer.byteLength;
  }

  async [TRANSFERRER.DROP]() {
    await this.handle?.close();
    this.handle = null;
  }
}

class FileReader extends Fugue.DegradedChunkReader {
  static [READER_S.TRANSFERRER_CTOR] = FileTransferrer;

  handle = null;
  cursor = 0;

  async [READER.INITIALIZE]() {
    this.handle = await open(this.transferrer.path, 'r');
  }

  async [READER.SEEK]() {
    const byteLength = await readFrameHeader(this.handle, this.cursor);

    if (byteLength === null) {
      return false;
    }

    this.cursor += FRAME_HEADER + byteLength;

    return true;
  }

  async [READER.READ]() {
    const byteLength = await readFrameHeader(this.handle, this.cursor);

    if (byteLength === null) {
      return { done: true, value: undefined };
    }

    const value = Buffer.alloc(byteLength);

    await this.handle.read(value, 0, byteLength, this.cursor + FRAME_HEADER);
    this.cursor += FRAME_HEADER + byteLength;

    return { done: false, value };
  }

  async [READER.CLOSE]() {
    await this.handle?.close();
    this.handle = null;
  }
}

class SpoolDistributor extends Fugue.Distributor {
  static [DEGRADED_CHUNK_READER_CTOR] = FileReader;
}

const spoolUpload = async (request, response, state) => {
  const distributor = new SpoolDistributor(Readable.toWeb(request));
  const hash = createHash('sha256');

  distributor.setTransferrerArgs(state.spool);
  Fugue.Options.Tune.MaxChunkStashByteLength(distributor, STASH_LIMIT);

  state.distributor = distributor;

  const landing = pipeline(
    Readable.fromWeb(distributor.fork()),
    createWriteStream(state.target),
  );
  const digesting = pipeline(
    Readable.fromWeb(distributor.fork()),
    new DigestSink(hash),
  );

  await Promise.all([landing, digesting]);

  const { size: byteLength } = await stat(state.target);
  const sha256 = hash.digest('hex');

  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ byteLength, sha256 }));
};

const startServer = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fugue-'));
  const state = {
    distributor: null,
    failure: null,
    spool: join(dir, 'upload.spool'),
    target: join(dir, 'upload.bin'),
  };

  const server = createServer((request, response) => {
    spoolUpload(request, response, state).catch((cause) => {
      state.failure = cause;
      response.destroy();
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address();

  return {
    dir,
    state,
    url: `http://127.0.0.1:${port}/upload`,
    close: async () => {
      await state.distributor?.destroy();
      server.closeAllConnections();

      await new Promise((resolve) => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    },
  };
};

const upload = async (app, payload) => {
  const response = await fetch(app.url, { method: 'POST', body: payload });

  return response.json();
};

it('should land the upload on disk while the digest is computed', async (t) => {
  const app = await startServer();

  t.after(() => app.close());

  const payload = makePayload();
  const body = await upload(app, payload);
  const landed = await readFile(app.state.target);
  const { size } = await stat(app.state.spool);

  assert.ifError(app.state.failure);
  assert.equal(app.state.distributor.degraded, true);
  assert.equal(body.byteLength, payload.byteLength);
  assert.equal(body.sha256, sha256(payload));
  assert.equal(body.sha256, sha256(landed));
  assert.ok(size > payload.byteLength);
  assert.equal((size - payload.byteLength) % FRAME_HEADER, 0);
});

it('should serve a copy forked after the upload, from the spool', async (t) => {
  const app = await startServer();

  t.after(() => app.close());

  const payload = makePayload();

  await upload(app, payload);

  const hash = createHash('sha256');

  await pipeline(
    Readable.fromWeb(app.state.distributor.fork()),
    new DigestSink(hash),
  );

  assert.ifError(app.state.failure);
  assert.equal(app.state.distributor.degraded, true);
  assert.equal(hash.digest('hex'), sha256(payload));
});
