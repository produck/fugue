---
applyTo: '**'
---

# Repository override: 00-produck-base

`override/` holds this repository's deviations from the organization baseline.
File names and numbers match `.github/instructions/produck/`. List deltas only:
anything not listed here follows the baseline unchanged. This follows the
Precedence clause of 00 itself — more specific repository rules win.

## Why this folder

- The editor scans `.github/instructions/**/*.instructions.md` by default, so
  files here load together with the baseline. No setting is required.
- `agent-toolkit sync-instructions` manages `.github/instructions/produck/`
  only, so this folder is repository-owned and is not overwritten.
- `.github/copilot-instructions.md` points here too: it is always loaded, so a
  reader that starts there still gets routed.

## Organization contradictions and our resolution

- **`produck:baseline` invocation**: 10 requires
  `npm exec --package=@produck/agent-toolkit@latest -- ...`, while 00 forbids
  `@latest` for routine invocations. This repository keeps the value given by
  10 and waits for an upstream ruling.
- **Package-level `.gitignore`**: 10 allows one when a package has unique
  artifacts, 15 forbids it outright. This repository follows 15: no
  package-level ignore, every rule lives in the root `.gitignore`.

## Document width

- Markdown is measured in display columns (CJK counts as 2), not bytes.
- The checker is `logs/check-md-width.mjs`; `logs/` is a probe directory and is
  not tracked.
