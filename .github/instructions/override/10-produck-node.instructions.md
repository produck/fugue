---
applyTo: '**'
---

# Repository override: 10-produck-node

Deltas against `.github/instructions/produck/10-produck-node.instructions.md`.

## Document directory

- The baseline requires a root `docs/` directory. This repository has none:
  root-level `*.md` files carry that role.
  - `DEV.md`: current conclusions per topic (decisions, trade-offs, measured
    evidence).
  - `DESIGN.md`: design document (semantics, architecture, lifecycle,
    observability).
  - `EXCEPTIONS.md`: the normative behaviour after an exception (failure
    domains, reporting surface, recovery ownership).
  - `SWITCHING.md`, `BROWSER.md`: migration notes, open items and browser
    environment.
- Documents are written in Chinese prose with English terms, headings `#`
  followed by a blockquote lead.

## Package tests

- The package `test` script is `node test/index.mjs`, without `--test`.
- Test-side deltas live in the 12 override in this folder.

## Test imports

- Source is reached by the package name itself
  (`@produck/readable-stream-distributor`), not by a path or an alias. Node
  resolves it inside the package through `exports`, so a test walks the same
  surface a consumer walks and fails as soon as `exports` stops answering.
- `packages/main/package.json` declares an `imports` map with `#test/*` only,
  for the test tree; no test file counts `../` segments to reach a fixture.
- Both serve the test side only: `src/` keeps relative imports, so the
  published package and its internal wiring are untouched.
- Suite subjects follow that surface; reading a field it does not expose is
  allowed too, so a test may import an internal symbol module
  (`src/Distributor/_Symbol.mjs` or `src/.../ForkedReadableStream/_Symbol.mjs`)
  and take a handle from it. The call chain itself still starts on the public
  surface: a test drives the distributor through `fork()`, `destroy()`,
  `Options.Tune` and the stream, never by calling an internal member it
  reached through a symbol.
