import { deepFreeze } from '@produck/deep-freeze-enumerable';

export const CODES = deepFreeze({
  DEGRADED_READER: {
    CLOSE_FAILED: 'degraded-reader-close-failed',
    INITIALIZE_FAILED: 'degraded-reader-initialize-failed',
    READ_FAILED: 'degraded-reader-read-failed',
    SEEK_FAILED: 'degraded-reader-seek-failed',
  },
  SOURCE: {
    CANCEL_FAILED: 'source-cancel-failed',
    READ_FAILED: 'source-read-failed',
  },
  TRANSFERRER: {
    BACKLOG: 'transferrer-backlog',
    INITIALIZE_FAILED: 'transferrer-initialize-failed',
    DUMP_FAILED: 'transferrer-dump-failed',
    DROP_FAILED: 'transferrer-drop-failed',
    WRITE_FAILED: 'transferrer-write-failed',
  },
});

export const CODE_LIST = deepFreeze(
  Object.values(CODES).flatMap((group) => Object.values(group)),
);

class WarningCountRecord {
  record = Object.create(null);

  constructor() {
    for (const code of CODE_LIST) {
      this.record[code] = 0;
    }
  }

  count(code) {
    this.record[code] += 1;
  }

  get(code) {
    return this.record[code];
  }
}

export { WarningCountRecord as CountRecord };
