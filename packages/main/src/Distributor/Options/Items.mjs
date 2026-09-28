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
    // Read after every write to the transferrer (observeBacklog()).
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
    // TODO: read once per dump attempt, when the retry is wired.
    name: 'MaxDumpRetryCount',
    defaultValue: Infinity,
    assert: Assert.NonNegativeIntegerOrInfinity,
  },
  {
    // TODO: read once per drain attempt, when the retry is wired.
    name: 'MaxDrainRetryCount',
    defaultValue: Infinity,
    assert: Assert.NonNegativeIntegerOrInfinity,
  },
  {
    // TODO: read once per dump retry wait, when the retry is wired.
    name: 'DumpRetryInterval',
    defaultValue: 1 * SECOND,
    assert: Assert.NonNegativeInteger,
  },
  {
    // TODO: read once per drain retry wait, when the retry is wired.
    name: 'DrainRetryInterval',
    defaultValue: 1 * SECOND,
    assert: Assert.NonNegativeInteger,
  },
];

export { items };
