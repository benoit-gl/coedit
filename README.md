# Coedit

Coedit is currently at the documented clean-slate, pre-scaffold stage of a
browser-first collaborative document engine.

The authoritative documentation index is [`docs/README.md`](docs/README.md).
The ordered implementation plan is [`SCAFFOLDING_PLAN.md`](SCAFFOLDING_PLAN.md).

## Development status

Application source and package metadata have not yet been scaffolded. The
commands below are requirements for Step 1, not commands that are currently
available in this checkout.

The project must build and run from the command line on native Windows and Linux.
macOS is an intended supported developer platform. Future CI will run on Linux,
using the same package commands developers use locally; there is no CI workflow
at present.

After Step 1, the canonical clean-checkout verification sequence will be:

```text
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

`pnpm check` will cover formatting, type checking, semantic linting,
architectural dependency rules, source-documentation validation, and tests. See
[`docs/CODING_STYLE.md`](docs/CODING_STYLE.md) for the complete command,
linting, formatting, documentation, and portability contract.

## Preserved experiment

The earlier Tauri experiment remains on `tauri-experimental-orphan` as read-only
evidence. Do not merge, rebase, reset, or commit to that branch. Consult
[`docs/PRESERVED_BRANCH_RECONCILIATION.md`](docs/PRESERVED_BRANCH_RECONCILIATION.md)
before reusing behavior or tests from it.

