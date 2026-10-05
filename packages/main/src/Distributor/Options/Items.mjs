import { Unit } from '@produck/argot';

import * as Assert from './Assert.mjs';

const items = [
  {
    // Read on every pull, by the degrade probe (degradeIfNeeded()).
    name: 'MaxChunkStashByteLength',
    defaultValue: Unit.Byte.GB,
    assert: Assert.NonNegativeInteger,
  },
  {
    // Read after every write to the transferrer ($I.WRITE).
    name: 'MaxTransferrerBacklogWarningByteLength',
    defaultValue: (options) => options.MaxChunkStashByteLength(options),
    assert: Assert.NonNegativeInteger,
  },
  {
    // Read by the same probe, once the stash is both over the limit and done.
    name: 'DegradeOnChunkStashFullAndDone',
    defaultValue: false,
    assert: Assert.Boolean,
  },
  {
    // Read once per fork, at construction; older copies keep their value.
    name: 'ForkedReadableStreamHighWaterMark',
    defaultValue: 1,
    assert: Assert.HighWaterMark,
  },
  {
    // Read once at the start of every reader initialize, by its retry loop.
    name: 'MaxChunkReaderInitializeRetryCount',
    defaultValue: Infinity,
    assert: Assert.NonNegativeIntegerOrInfinity,
  },
  {
    // Read once at the start of every reader initialize, with the count.
    name: 'ChunkReaderInitializeRetryInterval',
    defaultValue: Unit.Time.SEC,
    assert: Assert.NonNegativeInteger,
  },
  {
    // Read once at the start of every transferrer initialize.
    name: 'MaxTransferrerInitializeRetryCount',
    defaultValue: Infinity,
    assert: Assert.NonNegativeIntegerOrInfinity,
  },
  {
    // Read once at the start of every transferrer initialize, with the count.
    name: 'TransferrerInitializeRetryInterval',
    defaultValue: Unit.Time.SEC,
    assert: Assert.NonNegativeInteger,
  },
  {
    // Read once at the start of every dump, by its retry loop.
    name: 'MaxTransferrerDumpRetryCount',
    defaultValue: Infinity,
    assert: Assert.NonNegativeIntegerOrInfinity,
  },
  {
    // Read once at the start of every dump, with the retry count.
    name: 'TransferrerDumpRetryInterval',
    defaultValue: Unit.Time.SEC,
    assert: Assert.NonNegativeInteger,
  },
  {
    // Read once per drained chunk, by the head retry.
    name: 'MaxTransferrerDrainRetryCount',
    defaultValue: Infinity,
    assert: Assert.NonNegativeIntegerOrInfinity,
  },
  {
    // Read once per drained chunk, with the retry count.
    name: 'TransferrerDrainRetryInterval',
    defaultValue: Unit.Time.SEC,
    assert: Assert.NonNegativeInteger,
  },
];

export { items };
