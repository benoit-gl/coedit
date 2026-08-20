# Testing strategy

This document describes the current verification seams and risk-based definition of done. It deliberately avoids hard-coded total test counts because those numbers become stale whenever a focused suite is added.

## Required commands

From the repository root:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm build
corepack pnpm build:tauri
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

For native runtime/package smoke checks:

```sh
corepack pnpm tauri:dev
corepack pnpm tauri:build
```

There is no repository CI workflow at present, so passing source tests on one workstation is not equivalent to platform qualification.

## Test priorities

For Coedit, prioritize failures in this order:

1. silent document loss or wrong attribution;
2. restore/history corruption or false recovery claims;
3. editor-transition/checkpoint loss or reordering;
4. hostile content execution or unsafe native access;
5. format/host incompatibility;
6. inaccessible/unusable interaction;
7. cosmetic defects.

## Current TypeScript coverage

Important suites include:

- `src/domain/tree.test.ts` — hierarchy invariants and mutations;
- `src/domain/visibleNodes.test.ts` — WP-6 deterministic visible projection;
- `src/application/serializedTaskQueue.test.ts` — command ordering/failure recovery;
- `src/application/draftTransition.test.ts` — freeze/drain/failure semantics;
- `src/application/workspaceProjection.test.ts` — live/historical projection invariants;
- `src/application/useDocumentController.test.tsx` — controlled transitions, historical queries/guards, editor ownership and restore generation;
- `src/application/historyProjection.test.ts` — WP-5 grouping, page-boundary merge, partial labeling, deduplication;
- `src/components/DocumentCanvas*.test.tsx` — canvas projection, interactions, sole-editor ownership, historical controls;
- `src/components/HistoryPanel.test.tsx` — revision action states plus WP-5 collapsed/expanded group behavior;
- `src/components/HistoricalWorkspaceBanner.test.tsx` — revision identity and Back priority;
- `src/components/NodeMetadataFields.test.tsx`, `TagEditor.test.tsx` — metadata/tag interaction and drains;
- `src/editor/bodyCheckpointPolicy.test.ts` — policy validation;
- `src/editor/bodyEditTransaction.test.ts` / `bodyEditorTransaction.test.ts` — semantic input classification and Tiptap/Yjs integration;
- `src/editor/BodyEditBatchCoordinator.test.ts` — groups, thresholds, idle, IME, FIFO, backpressure, retry and transition draining;
- `src/editor/sanitizeRichText.test.ts` — browser sanitization contract;
- `src/persistence/memoryGateway.test.ts` — contribution/revision/restore/history/recovery semantics;
- `src/persistence/memoryGateway.groupHistory.test.ts` — exact cursor-paged `groupId` query, filter independence and page continuation;
- `src/persistence/tauriGateway.test.ts` — explicit host-deferred query capabilities;
- `src/App.test.tsx` — reachable live/historical application seam.

The exact set of tests is the repository itself; do not maintain a duplicate numeric total here.

## WP-5 acceptance evidence

WP-5 should be considered implemented only while these properties remain covered:

- only contiguous body checkpoints sharing a non-null group ID collapse;
- non-body operations break groups even when they reuse the same ID;
- appending an older raw page can merge a group across that page boundary;
- the oldest loaded group is labeled partial when older raw rows remain;
- raw loaded contribution count differs from visible grouped-row count;
- exact expansion deduplicates contributions and preserves newest-first order;
- standalone exact group queries can page until the full group is fetched;
- exact expansion ignores ordinary History search/node filters;
- a collapsed row uses the newest/final checkpoint as the canonical View target;
- expanded checkpoints retain exact revision actions;
- Tauri does not pretend exact expansion or revision View exists before WP-10.

## Rust coverage

`src-tauri/src/store.rs` contains focused tests for tree validation, HTML sanitization, and portable document round trips. These exercise `DocumentStore` directly, not the full Tauri IPC/WebView boundary.

Rust does **not** yet provide native revision-materialization or exact contribution-group queries, so WP-5 native parity is intentionally untested until WP-10 introduces those code paths.

## Missing verification levels

Important gaps remain:

- browser E2E with the real Tiptap editor;
- accessibility-engine/screen-reader qualification;
- Tauri IPC contract tests and native UI E2E;
- migration/old-format fixtures;
- Rust conformance to TypeScript hash/sanitizer fixtures;
- fault-injection/interrupted-write recovery;
- large-history native SQL cases beyond 100,000 rows;
- performance/long-document/long-edit-group qualification;
- macOS/Linux/Windows CI and package matrix;
- host-exit/suspension durability tests.

## Manual smoke suite

At minimum for a meaningful release candidate:

1. create a document and several nested nodes;
2. edit title/tags/body, including enough body work to create multiple checkpoints in one semantic group;
3. open History and verify grouped rows, raw/visible counts and exact standalone expansion;
4. load older raw History and verify a page-spanning group merges rather than duplicates;
5. View an older standalone revision, Back without a new contribution, then Restore and confirm one compensating revision;
6. collapse/delete/move nodes while body work is pending and verify the transition either drains or visibly cancels;
7. export recovery JSON/Markdown;
8. for desktop, create/close/reopen/restore/export/backup a `.coedit` file;
9. verify no production artifact attempts an outbound network connection;
10. record OS/browser/Tauri versions and any skipped checks.

## Documentation rule

Do not upgrade an item from Partial/Proposed to Implemented solely because a type or test exists. Reachability through the appropriate composition root and relevant acceptance evidence are both required.
