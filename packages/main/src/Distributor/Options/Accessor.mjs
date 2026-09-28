import { items } from './Items.mjs';

export const OPTIONS = Symbol('.options');

const _Tune = {};
const _Get = {};

function normalizeGetter(value) {
  return typeof value === 'function' ? value : () => value;
}

for (const { name, assert } of items) {
  const TUNE_NAME = `tune${name}`;
  const GET_NAME = `get${name}`;

  _Tune[name] = {
    [TUNE_NAME](distributor, value) {
      const options = distributor[OPTIONS];
      const getter = normalizeGetter(value);

      assert(getter(options));
      options[name] = getter;
    },
  }[TUNE_NAME];

  _Get[name] = {
    [GET_NAME](distributor) {
      const options = distributor[OPTIONS];

      return options[name](options);
    },
  }[GET_NAME];
}

export const Tune = Object.freeze(_Tune);
export const Get = Object.freeze(_Get);

export function installToDistributor(distributor) {
  const options = {};

  for (const { name, defaultValue } of items) {
    options[name] = normalizeGetter(defaultValue);
  }

  distributor[OPTIONS] = options;
}

export function getOptionsSnapshot(distributor) {
  const snapshot = {};
  const options = distributor[OPTIONS];

  for (const [name, getter] of Object.entries(options)) {
    snapshot[name] = getter(options);
  }

  return snapshot;
}

export { installToDistributor as install, getOptionsSnapshot as snapshot };
