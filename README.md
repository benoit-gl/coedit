# Coedit

Coedit is a browser-first collaborative document engine. The repository contains the completed Step 1 browser scaffold and Step 2 pure Block domain. Step 3 carrier qualification is the next implementation step. Gate B then selects the carrier, Step 4 implements the selected collaborative core, Step 5 establishes permanent exact History and Version materialization, and Step 6 implements the durable Range service.

The authoritative documentation index is [`docs/README.md`](docs/README.md). The ordered implementation plan is [`SCAFFOLDING_PLAN.md`](SCAFFOLDING_PLAN.md).

## Requirements

Use Node.js `>=22.13.0 <25`. Node.js includes npm, which is the repository bootstrap interface. No global pnpm installation is required.

The repository pins pnpm `11.24.0` in `package.json`. `npm run bootstrap` obtains that exact pnpm version through `npm exec` and uses it with the committed `pnpm-lock.yaml`. Do not use `npm install` for project dependencies.

Windows and Linux are required native development platforms. macOS is an intended supported platform. The commands below use package scripts and do not require an OS-specific shell.

## Commands

- `npm run bootstrap` installs project dependencies through the pinned pnpm version.
- `npm run dev` starts the Vite development server.
- `npm run build` type-checks and builds the production browser application.
- `npm run preview` serves the production build locally over HTTP.
- `npm run test` runs the test suite once.
- `npm run test:watch` starts the explicit test watcher.
- `npm run typecheck` runs TypeScript checks.
- `npm run lint` runs ESLint and accepts zero warnings.
- `npm run lint:deps` runs dependency-cruiser architecture checks.
- `npm run format` applies Prettier.
- `npm run format:check` checks formatting without writing.
- `npm run docs:check` validates TSDoc and TypeDoc input without writing generated documentation.
- `npm run check` runs the complete non-interactive verification set.

For a clean checkout, use:

```text
npm run bootstrap
npm run check
npm run build
```

After `npm run build`, use `npm run preview` to inspect `dist` in a browser. Do not open `dist/index.html` through `file://`; browsers block the ES modules in that mode. The build uses relative asset URLs so a static HTTP host can mount `dist` below an arbitrary URL prefix.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contributor contract, definition of done, test requirements, and pull-request hygiene.

## Preserved experiment

The earlier Tauri experiment remains on `tauri-experimental-orphan` as read-only evidence. Do not merge, rebase, reset, or commit to that branch. Consult [`docs/PRESERVED_BRANCH_RECONCILIATION.md`](docs/PRESERVED_BRANCH_RECONCILIATION.md) before you reuse behavior or tests from it.
