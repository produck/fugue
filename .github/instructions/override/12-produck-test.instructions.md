---
applyTo: '**'
---

# Repository override: 12-produck-test

Deltas against `.github/instructions/produck/12-produck-test.instructions.md`.

## Suite names

- Do not open a separate `#` suite for events. An event case lives in the suite
  of the member that triggers it; when several members trigger the same event,
  define one case per trigger. For example:
  - `degrade`, `warn(transferrer-dump-failed)` and `warn(backlog)` belong to
    `.degraded()`;
  - `warn(source-cancel-failed)` belongs to `.destroy() > >promise`;
  - `terminate` belongs to `.terminate()`; `fork` belongs to `.fork()`.
- Suites are derived from public members and exports only. Abstract members
  (`_I` / `_S`) are not public surface and must not be suite names; they are
  covered by fixtures, that is in-repo subclass stubs reached through public
  paths. Internal protocol names (`$I` / `I`) must not be suite names either.
- Additions to the baseline marker table: constructors are written
  `constructor()`; return-value groups use `>stream` / `>promise` / `>detail`
  / `>instance`.

## What deserves a case

- A case must execute this repository's own source. Platform or third-party
  behaviour is a precondition, not a subject:
  - the abstractness given by es-abstract (abstract classes cannot be
    constructed directly);
  - `instanceof` against a platform base, such as `EventTarget`;
  - guarantees of third-party libraries, such as `deepFreeze`;
  - WHATWG normalisation semantics, such as `'3'` becoming `3`.
- An abstract member only needs to be reached through a fixture and a public
  path; it never gets a suite of its own.
- Read-cadence assertions ("the option is read on every pull") lock
  implementation structure rather than behaviour. Keep them only when they
  matter, and install the counting getter so the count is reset after `Tune`
  calls the getter once through its install-time assert.

## Shared fixtures

- `test/baseline.mjs` holds only the most generic construction steps and data:
  the source factory `makeSource`, the drain helper `drain`, `settle`, the
  medium stub, the degraded reader stub, the distributor leaf `TestDistributor`
  and `makeDistributor`.
- It has no `.test.` suffix and is not imported by `test/index.mjs`. The
  baseline requires `.test.mjs` for test files and a single entrypoint, so this
  is the only safe place for a helper.
- Test files reach it as `#test/baseline.mjs`, never by a relative path.
- Domain-specific expectation objects (error texts) and domain-specific
  fixtures stay in their own `.test.mjs`.
- A stub implements `_I` and `_S` only, because those are the contract's empty
  slots. `$I` (the protected driver) and `I` (private) are read-only for a
  test: never redefine one, never call one.

## Focused runs

- The baseline states that `--test-name-pattern` "does NOT match tests nested
  inside `describe()` blocks" and may silently run zero tests. That is not
  reproducible on Node 24.17:
  `node --test --test-name-pattern="reject a locked" test/index.mjs` yields
  `tests 1 / pass 1`. This repository uses that for focused runs instead of
  adding `{ only: true }` markers to ancestor `describe` blocks.
