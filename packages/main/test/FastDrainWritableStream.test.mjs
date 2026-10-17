import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as Fugue from '@produck/fugue';

import { makeDistributor, TestDistributor } from '#test/baseline.mjs';

describe('FastDrainWritableStream', () => {
  it('should be a WritableStream', () => {
    assert.ok(new Fugue.FastDrainWritableStream() instanceof WritableStream);
  });

  it('should hand out a fresh stream per construction', () => {
    const first = new Fugue.FastDrainWritableStream();
    const second = new Fugue.FastDrainWritableStream();

    assert.notEqual(first, second);
  });

  it('should accept a chunk of any shape', async () => {
    const writer = new Fugue.FastDrainWritableStream().getWriter();

    await writer.write('a string');
    await writer.write({ any: 'object' });
    await writer.close();
  });

  it('should exhaust the source it is piped from', async () => {
    let pulled = 0;
    const source = new ReadableStream({
      pull(controller) {
        if (pulled < 3) {
          controller.enqueue(Buffer.from(String(pulled++)));
        } else {
          controller.close();
        }
      },
    });
    const distributor = new TestDistributor(source);

    await distributor.fork().pipeTo(new Fugue.FastDrainWritableStream());

    assert.equal(pulled, 3);
  });

  it('should settle when the distributor is destroyed mid-pipe', async () => {
    const distributor = makeDistributor(['a', 'b', 'c']);
    const pumping = distributor
      .fork()
      .pipeTo(new Fugue.FastDrainWritableStream());

    await distributor.destroy();

    await assert.rejects(pumping);
  });
});
