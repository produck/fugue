import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Event } from '@produck/fugue';

describe('Event', () => {
  describe('::Degrade', () => {
    it('should be a CustomEvent of type degrade', () => {
      const event = new Event.Degrade(1024);

      assert.ok(event instanceof CustomEvent);
      assert.equal(event.type, 'degrade');
    });

    describe('>detail', () => {
      it('should carry the stash byte length at the switch', () => {
        const event = new Event.Degrade(1024);

        assert.deepEqual(event.detail, { byteLength: 1024 });
      });
    });
  });

  describe('::Fork', () => {
    it('should be a CustomEvent of type fork', () => {
      const event = new Event.Fork({});

      assert.ok(event instanceof CustomEvent);
      assert.equal(event.type, 'fork');
    });

    describe('>detail', () => {
      it('should carry the forked stream', () => {
        const forked = {};
        const event = new Event.Fork(forked);

        assert.equal(event.detail.forked, forked);
      });
    });
  });

  describe('::Terminate', () => {
    it('should be a CustomEvent of type terminate', () => {
      const event = new Event.Terminate();

      assert.ok(event instanceof CustomEvent);
      assert.equal(event.type, 'terminate');
    });
  });

  describe('::Warn', () => {
    it('should be a CustomEvent of type warn', () => {
      const event = new Event.Warn('transferrer-backlog', 4096);

      assert.ok(event instanceof CustomEvent);
      assert.equal(event.type, 'warn');
    });

    describe('>detail', () => {
      it('should carry the code and its payload', () => {
        const payload = { pendingByteLength: 4096 };
        const event = new Event.Warn('transferrer-backlog', payload);

        assert.deepEqual(event.detail, {
          code: 'transferrer-backlog',
          payload,
        });
      });
    });
  });
});
