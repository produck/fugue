import { deepFreeze } from '@produck/deep-freeze-enumerable';

import * as _Distributor from './Distributor/index.mjs';

const { DegradedChunkReader: _DegradedChunkReader } = _Distributor;
const { Transferrer: _Transferrer } = _DegradedChunkReader;
const { Tune, Get, Asset } = _Distributor.Options;

export const Distributor = _Distributor.Abstract;
export const DegradedChunkReader = _DegradedChunkReader.Abstract;
export const Transferrer = _Transferrer.Abstract;
export const Event = _Distributor.Event;
export const Options = { Tune, Get, Asset };

import * as DISTRIBUTOR from './Distributor/_Symbol.mjs';
import * as DEGRADED_CHUNK_READER from './Distributor/DegradedChunkReader/_Symbol.mjs';
import * as TRANSFERRER from './Distributor/DegradedChunkReader/Transferrer/_Symbol.mjs';

export const SYMBOL = deepFreeze({
  TRANSFERRER: {
    _I: TRANSFERRER._I,
    _S: TRANSFERRER._S,
  },
  DEGRADED_CHUNK_READER: {
    _I: DEGRADED_CHUNK_READER._I,
    _S: DEGRADED_CHUNK_READER._S,
  },
  DISTRIBUTOR: {
    _S: DISTRIBUTOR._S,
  },
});
