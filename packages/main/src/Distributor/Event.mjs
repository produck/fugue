export class DistributorEvent extends CustomEvent {
  constructor(type, detail) {
    super(type, { detail });
  }
}

export class DegradeEvent extends DistributorEvent {
  constructor(byteLength) {
    super('degrade', { byteLength });
  }
}

export class ForkEvent extends DistributorEvent {
  constructor(forked) {
    super('fork', { forked });
  }
}

export class TerminateEvent extends DistributorEvent {
  constructor() {
    super('terminate');
  }
}

export class WarnEvent extends DistributorEvent {
  constructor(code, payload) {
    super('warn', { code, payload });
  }
}

export class MetricEvent extends DistributorEvent {
  constructor(code, delta) {
    super('metric', { code, delta });
  }
}

export {
  DegradeEvent as Degrade,
  ForkEvent as Fork,
  TerminateEvent as Terminate,
  WarnEvent as Warn,
  MetricEvent as Metric,
};
