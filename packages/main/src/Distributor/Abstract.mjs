import * as Ow from '@produck/ow';
import { ThrowTypeError } from '@produck/type-error';
import { Common, SYMBOL } from '@produck/argot';
import Abstract, { Member as M } from '@produck/es-abstract';

import * as BufferChunkReader from './BufferChunkReader/index.mjs';
import * as ForkedReadableStream from './ForkedReadableStream/index.mjs';
import * as ChunkStash from './ChunkStash/index.mjs';
import * as SourceReader from './SourceReader/index.mjs';

import SourceConsumptionAgent from './SourceConsumptionAgent.mjs';
import ForkedReadableStreamRegistry from './ForkedReadableStreamRegistry.mjs';
import * as Warning from './Warning.mjs';
import * as Checker from './Checker.mjs';
import * as Event from './Event.mjs';
import * as Options from './Options/index.mjs';
import { I, $I, _S, A } from './_Symbol.mjs';
import { _A, PART, TRANSFERRER } from './_External.mjs';

const TERMINATION_MESSAGE = 'The distributor has been terminated';

async function initializeReader(reader, progress) {
  const initializing = reader[_A.DEGRADED.$I.REQUEST_INITIALIZE](progress);

  await Common.ignoreRejection(initializing);
}

class ReadableStreamDistributor extends EventTarget {
  [A.$I.STASH] = new ChunkStash.Concrete();
  [A.$I.REGISTRY] = new ForkedReadableStreamRegistry();
  [$I.TERMINATION] = null;
  [I.WARNING_COUNT_RECORD] = new Warning.CountRecord();
  [I.TRANSFERRER_ARGS] = [];
  [$I.TRANSFERRER] = null;
  [$I.DESTROYED] = null;
  [A.I.CTOR.READER.CURRENT] = BufferChunkReader.Concrete;

  constructor(source) {
    super();

    if (!Checker.isReadableStream(source)) {
      ThrowTypeError('source', 'a WHATWG ReadableStream of this realm');
    }

    Options.install(this);

    this[SYMBOL.CONSTRUCTOR] = new.target;
    this[A.I.SOURCE] = new SourceReader.Concrete(this, source);
    this[A.$I.AGENT] = new SourceConsumptionAgent(this);
  }

  get options() {
    return Options.getOptionsSnapshot(this);
  }

  get degraded() {
    return this[$I.TRANSFERRER] !== null;
  }

  get terminated() {
    return this[$I.TERMINATION] !== null;
  }

  [$I.WARN](code, payload) {
    this[I.WARNING_COUNT_RECORD].count(code);
    this.dispatchEvent(new Event.Warn(code, payload));
  }

  fork() {
    if (this.terminated) {
      Ow.Error.Common('Distributor has been terminated');
    }

    const ChunkReaderImpl = this[A.I.CTOR.READER.CURRENT];
    const reader = new ChunkReaderImpl(this);

    if (ChunkReaderImpl === this[A.I.CTOR.READER.DEGRADED]) {
      initializeReader(reader, 0);
    }

    const forked = new ForkedReadableStream.Concrete(this, reader);

    this.dispatchEvent(new Event.Fork(forked));

    return forked;
  }

  getWarningCount(code) {
    if (!Warning.CODE_LIST.includes(code)) {
      ThrowTypeError('code', 'warning code');
    }

    return this[I.WARNING_COUNT_RECORD].get(code);
  }

  [$I.DEGRADE]() {
    const {
      [A.I.CTOR.READER.DEGRADED]: DegradedChunkReaderImpl,
      [A.I.CTOR.TRANSFERRER]: TransferrerImpl,
    } = this;

    const stash = this[A.$I.STASH];
    const { byteLength } = stash;
    const transferrer = new TransferrerImpl(...this[I.TRANSFERRER_ARGS]);

    transferrer[PART.$I.SET_DISTRIBUTOR](this);

    if (stash.done) {
      transferrer[TRANSFERRER.$I.SET_DONE]();
    }

    transferrer[TRANSFERRER.$I.PREPARE](stash);
    this[$I.TRANSFERRER] = transferrer;
    this[A.I.CTOR.READER.CURRENT] = DegradedChunkReaderImpl;

    for (const [forked] of this[A.$I.REGISTRY]) {
      const reader = new DegradedChunkReaderImpl(this);
      const bufferChunkReader = forked[_A.FORKED.A.$I.READER];
      const progress = bufferChunkReader[_A.READER.A.$I.CONSUMED_COUNT];

      initializeReader(reader, progress);
      bufferChunkReader[_A.BUFFER.$I.HANDOVER](reader);
      forked[_A.FORKED.$I.SET_DEGRADED_CHUNK_READER](reader);
    }

    this.dispatchEvent(new Event.Degrade(byteLength));
  }

  setTransferrerArgs(...args) {
    if (this.degraded) {
      Ow.Error.Common('Transferrer args have been consumed');
    }

    const { [A.I.CTOR.TRANSFERRER]: TransferrerImpl } = this;
    const parsed = TransferrerImpl[TRANSFERRER._S.PARSE_ARGUMENTS](args);

    this[I.TRANSFERRER_ARGS] = parsed;
  }

  get [A.I.CTOR.READER.DEGRADED]() {
    return this[SYMBOL.CONSTRUCTOR][_S.DEGRADED_CHUNK_READER_CTOR];
  }

  get [A.I.CTOR.TRANSFERRER]() {
    return this[A.I.CTOR.READER.DEGRADED][_A.DEGRADED._S.TRANSFERRER_CTOR];
  }

  terminate() {
    if (this.terminated) {
      return;
    }

    this[$I.TERMINATION] = new DOMException(TERMINATION_MESSAGE, 'AbortError');
    this.dispatchEvent(new Event.Terminate());
  }

  destroy() {
    if (this[$I.DESTROYED] === null) {
      this[$I.DESTROYED] = this[$I.DESTROY]();
    }

    return this[$I.DESTROYED];
  }

  async [$I.DESTROY]() {
    this.terminate();

    const registry = this[A.$I.REGISTRY];
    const termination = this[$I.TERMINATION];

    for (const [forked, controller] of registry) {
      forked[_A.FORKED.A.$I.READER][_A.READER.$I.CLOSE]();
      controller.error(termination);
      registry.prune(forked);
    }

    await this[A.I.SOURCE].cancel(termination);
    await this[A.$I.AGENT].pullingSettled;

    const transferrer = this[$I.TRANSFERRER];
    const stash = this[A.$I.STASH];

    if (transferrer === null) {
      stash[_A.STASH.$I.SET_DONE]();
      stash[_A.STASH.$I.DROP]();
    } else {
      transferrer[TRANSFERRER.$I.SET_DONE]();
      transferrer[TRANSFERRER.$I.DROP]();
    }
  }
}

export default Abstract(
  ReadableStreamDistributor,
  Abstract.Static({
    [_S.DEGRADED_CHUNK_READER_CTOR]: M.Function,
  }),
);
