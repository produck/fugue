import * as Assert from './Assert.mjs';

const SECOND = 1000;

const items = [
  {
    // Read on every pull, by the degrade probe (degradeIfNeeded()).
    name: 'MaxStashByteLength',
    defaultValue: (1 << 10) ** 3,
    assert: Assert.NonNegativeInteger,
  },
  {
    // Read after every write to the transferrer ($I.WRITE).
    name: 'MaxBacklogWarningByteLength',
    defaultValue: (options) => options.MaxStashByteLength(options),
    assert: Assert.NonNegativeInteger,
  },
  {
    // Read by the same probe, once the stash is both over the limit and done.
    name: 'DegradeOnStashFullAndDone',
    defaultValue: false,
    assert: Assert.Boolean,
  },
  {
    // Read once per fork, at construction; older copies keep their value.
    name: 'ForkHighWaterMark',
    defaultValue: 1,
    assert: Assert.HighWaterMark,
  },
  {
    // Read once at the start of every reader initialize, by its retry loop.
    name: 'MaxInitializeRetryCount',
    defaultValue: Infinity,
    assert: Assert.NonNegativeIntegerOrInfinity,
  },
  {
    // Read once at the start of every reader initialize, with the count.
    name: 'InitializeRetryInterval',
    defaultValue: 1 * SECOND,
    assert: Assert.NonNegativeInteger,
  },
  {
    // Read once at the start of every dump, by its retry loop.
    name: 'MaxDumpRetryCount',
    defaultValue: Infinity,
    assert: Assert.NonNegativeIntegerOrInfinity,
  },
  {
    // Read once per drained chunk, by the head retry.
    name: 'MaxDrainRetryCount',
    defaultValue: Infinity,
    assert: Assert.NonNegativeIntegerOrInfinity,
  },
  {
    // Read once at the start of every dump, with the retry count.
    name: 'DumpRetryInterval',
    defaultValue: 1 * SECOND,
    assert: Assert.NonNegativeInteger,
  },
  {
    // Read once per drained chunk, with the retry count.
    name: 'DrainRetryInterval',
    defaultValue: 1 * SECOND,
    assert: Assert.NonNegativeInteger,
  },
];

export { items };
