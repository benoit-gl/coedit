# Testing strategy

This document describes the current verification seams, risk-based qualification contract, and definition of done. It deliberately avoids hard-coded total test counts because those numbers become stale whenever a focused suite is added.

Use it with [Known limitations](./KNOWN_LIMITATIONS.md) for risk priority, [Document format](./DOCUMENT_FORMAT.md) for recovery/compatibility oracles, and the [continuous-workspace decision records](./proposals/README.md) for acceptance criteria that are not yet fully implemented.

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

A raw `cargo build --release` is not a substitute for the Tauri package build because it does not prove the correct frontend composition or packaging path.

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

## Verification levels

Use the lowest seam that can actually prove the behavior, but do not use a lower seam as evidence for a host/browser property it cannot exercise.

| Level | Purpose | Examples |
|---|---|---|
| Pure domain/policy | Exhaust deterministic rules cheaply | tree invariants, visible projection, hash canonicalization, checkpoint classification/policy |
| Application/controller | Prove sequencing, guards and failure cancellation | serialized commands, draft transitions, historical request epochs, editor ownership |
| Adapter contract | Prove gateway semantics without UI | history paging, revision materialization, restore, exact group query |
| Component/editor integration | Prove React/Tiptap ownership and interaction | canvas transfer, metadata drains, History actions, real editor transaction capture |
| Store/IPC integration | Prove SQLite and cross-language behavior | transactions, snapshots, open/restore, IPC wire compatibility |
| Artifact/runtime | Prove what a user launches | generated `file://` HTML, packaged Tauri app, CSP, persistence after restart |
| Platform/accessibility | Qualify support claims | browser/OS matrix, keyboard, screen reader, touch, IME |

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

Rust does **not** yet provide native revision-materialization or exact contribution-group queries, so native query parity remains intentionally untested until WP-10 introduces those code paths.

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

## Invariants to preserve in verification

After every successful persisted document operation, relevant tests should assert:

1. node IDs remain unique and every non-null parent exists;
2. the active parent graph remains acyclic;
3. active sibling positions are normalized by the owning operation semantics;
4. revision advances exactly once;
5. contribution attribution, operation type, affected IDs, base revision and resulting revision match the request;
6. the resulting snapshot/hash corresponds to the accepted materialized state;
7. a failed operation does not partially advance materialized state, contribution count or snapshot count;
8. read-only/historical projections reject mutation;
9. restore appends compensating history rather than rewinding/deleting it;
10. grouping or UI projection never mutates physical ledger rows.

These are design oracles, not a statement that every current test asserts every item.

## Untrusted-input and recovery corpus

Maintain disposable, reviewable fixtures for the highest-risk boundaries. At minimum include:

- valid format-1 `.coedit`;
- wrong application ID or magic marker;
- inconsistent `user_version` / metadata format version;
- future version with compatible core tables;
- truncated/integrity-failing SQLite data;
- missing parents and cycles;
- malformed metadata/tag JSON or enum values;
- invalid/oversized Yjs/base64 data;
- malicious/malformed HTML and unsafe URL schemes;
- interrupted journal/recovery-warning scenarios;
- paths with spaces, Unicode, long names and existing destinations.

Never use a real user document for corruption/fault tests, and do not put private documents or credentials in fixtures.

## Release evidence record

For a release candidate or a PR making a support/recovery claim, record:

- exact command and exit result;
- OS and architecture;
- Node/pnpm/Rust versions as relevant;
- browser/version for standalone checks;
- Tauri package type/version for native checks;
- manual scenarios performed and fixtures used;
- any skipped check with reason/owner.

Do not describe source portability as platform testing and do not infer browser/native coverage from jsdom or store-only tests.

## Standalone qualification suite

Run against the generated `dist/index.html` opened through `file://`, not the Vite development server.

### ST-01 — artifact/offline boundary

1. Build with `corepack pnpm build`.
2. Open the generated HTML directly.
3. Confirm the app renders without module/CORS/CSP/runtime errors.
4. Confirm the standalone volatility warning is visible and native `.coedit` Open is absent.
5. Confirm no ordinary HTTP/HTTPS connection is attempted; Blob/download URLs are allowed only for export.

Expected: one self-contained runtime artifact using the memory composition and no application server.

### ST-02 — create, structure and metadata

1. Create a document and several roots/children.
2. Exercise sibling/child insertion, disclosure, reorder, indent/outdent and pointer reparenting.
3. Attempt an invalid/cyclic structural action and confirm it is rejected without corrupting the projection.
4. Edit titles/tags and verify normalized accepted values survive subsequent operations.

Expected: stable IDs, valid hierarchy and attributable contributions for accepted persisted changes.

### ST-03 — semantic rich-text checkpoints

1. Format/type enough content to cross the configured character threshold more than once in one uninterrupted episode.
2. Exercise insertion→deletion and deletion→insertion boundaries, selection/focus departure, paste/format/undo/redo and idle capture.
3. Confirm one semantic episode can contain multiple physical checkpoints sharing one `groupId` rather than producing arbitrary short-pause saves.
4. Switch editor owner or invoke a structural action while body work is pending; the action must wait for required checkpoint work or visibly cancel on failure.
5. Paste hostile HTML and confirm the rendered result remains within the browser sanitizer contract.

Expected: no accepted body content is lost/reordered; save/backpressure/retry state is visible rather than silently dropping work.

### ST-04 — grouped History and historical View

1. Open History and verify raw loaded contribution count is distinct from visible grouped-row count.
2. Expand a complete semantic group and verify exact checkpoint revisions remain accessible.
3. Create/use a fixture where a group spans an ordinary History page boundary; load the older page and verify the group coalesces instead of duplicating.
4. Verify an incomplete oldest group uses `at least N` until its exact group query completes.
5. Verify exact expansion ignores ordinary search/node filters and deduplicates newest-first rows.
6. View an older revision, then **Back to current**; neither action may add a contribution.
7. Confirm **Restore as new revision** separately and verify exactly one compensating revision is appended.

Expected: grouping changes presentation only; query-first inspection remains non-mutating.

### ST-05 — exports and volatility

1. Export Markdown and inspect hierarchy/plain text.
2. Export recovery JSON and confirm the standalone versioned envelope, state hash and complete current-runtime ledger are present.
3. Verify host-only view fields are not serialized as document state.
4. Reload/close the page and confirm working state is lost as warned.

Expected: exports complete; JSON remains inspection/recovery evidence with no current importer, and standalone storage remains intentionally volatile.

### ST-06 — claimed browser coverage

Repeat artifact/offline plus create/edit/history/export smoke in every desktop browser claimed by release notes. Chromium, Firefox and Safari/WebKit evidence are independent. iPadOS remains experimental until WP-8/WP-9 qualification is explicitly completed.

## Desktop qualification suite

Use a disposable test directory and a packaged artifact when making a release claim; `tauri:dev` is useful during development but is not package evidence.

### DT-01 — native composition and create/reopen

1. Confirm the desktop welcome path exposes native Open/Create behavior and no standalone volatility warning.
2. Create a `.coedit`, add structure/metadata/body checkpoints, then close and reopen.
3. Quit/relaunch the application and reopen again.
4. Compare representative current state, revision and History.

Expected: committed state survives both document close and process restart.

### DT-02 — transition durability

1. Type a unique marker and immediately transfer editor ownership, collapse/move/delete as applicable, or Close.
2. Reopen/check History and confirm the marker's required checkpoint precedes the controlled operation.
3. Inject or simulate persistence failure where practical and confirm the structural/lifecycle action is canceled with the editor state still recoverable for retry.

Expected: the current semantic checkpoint barrier, not the retired fixed debounce, controls ordering.

### DT-03 — restore/history persistence

1. Create several revisions on multiple nodes.
2. Restore an older revision.
3. Confirm current revision increases by one and prior contributions remain.
4. Close/reopen and verify restored state/history.
5. Edit again after restore, including a same-node-ID body case.

Expected: restore is compensating history and the editor does not resurrect stale pre-restore state.

Native **View** and exact page-spanning group expansion are not acceptance requirements until WP-10 implements those capabilities; the UI must instead remain explicit that they are host-deferred.

### DT-04 — export, backup and recovery

1. Export Markdown and desktop JSON; verify their documented fidelity/limits rather than assuming standalone parity.
2. Create a `.coedit-backup`, compare reported/file byte size, make a copy with `.coedit` suffix, and open the copy.
3. Preserve the original backup when testing recovery.
4. Where fault tooling exists, test destination replacement failure and confirm the prior destination remains recoverable.

Expected: backup is the primary lossless copy; Markdown is lossy and desktop JSON is not presented as a tested round-trip format.

### DT-05 — validation/read-only/recovery warning

Using disposable copies, exercise wrong application ID, inconsistent version metadata, corrupt structure, future-format read-only behavior and a controlled journal/recovery-warning scenario.

Expected: invalid data fails closed without rewriting the original; compatible future data is not silently made writable; a recovery warning is surfaced when applicable.

### DT-06 — concurrency and attribution characterization

1. Exercise the current contributor-profile mismatch behavior and verify the known attribution risk remains documented until the workflow is fixed.
2. If the platform permits, open the same disposable file in competing processes and exercise the SQLite busy/error path.

Expected: no silent partial revision/corruption. Multi-process editing is not a supported collaboration model.

## Security and recovery qualification

For rich HTML, cover executable elements/attributes, malformed nesting, unsafe URL schemes and near/over-limit payloads against both the browser and Rust boundaries where applicable.

For invalid `.coedit` fixtures, assert that opening returns an actionable failure, performs no opportunistic migration/mutation, does not install a partial view, and leaves the application able to open a later valid document.

For recovery rehearsal, create a nontrivial document, record representative revision/history/state evidence, produce backup/JSON/Markdown, recover from the backup copy, and verify that documentation does not overstate JSON/Markdown fidelity.

## Platform qualification matrix

Do not mark a platform supported until dated evidence exists for the applicable artifact/runtime checks.

| Target | Minimum evidence |
|---|---|
| Windows standalone | generated `file://` artifact plus ST-01 through ST-05 in claimed browsers |
| macOS standalone | artifact smoke in Safari plus another claimed browser |
| Linux standalone | artifact smoke in claimed browser(s) |
| Windows Tauri | packaged build, create/reopen, transition durability, restore, export/backup |
| macOS Tauri | packaged build on macOS plus the same native core workflow |
| Linux Tauri | packaged build on target distro family plus the same native core workflow |
| iPadOS browser | explicit WP-8/WP-9 touch/layout/storage/export qualification |
| iPadOS native | initialized/signed native project plus file/lifecycle/persistence qualification; currently not implemented |

## Priority automation backlog

### P0 — data-integrity gates

- real-editor proof of transition drain/cancel/retry around ownership transfer, structure, restore/export/Close;
- same-node restore followed by edit/reopen, including native parity;
- Rust consumption of canonical hash/sanitizer or deliberately versioned equivalent fixtures;
- operation rollback/invariant coverage across memory and SQLite;
- retained format-1 fixtures and migration gate before any incompatible format change;
- generated standalone `file://` artifact smoke.

### P1 — release confidence

- Tauri IPC contract tests and native query tests as WP-10 lands;
- corrupt/future/journal/locked-file fixtures;
- backup/export replacement-failure cases;
- indexed 100,001+ contribution History cases;
- contributor-profile reconciliation tests after product behavior is specified;
- Windows/macOS/Linux package matrix.

### P2 — quality and scale

- accessibility automation plus keyboard/screen-reader audits;
- touch/tablet qualification;
- property/fuzz coverage for tree/store inputs;
- large tree/Yjs/history/snapshot/startup benchmarks;
- long semantic-group and checkpoint-growth measurements.

## Definition of done

### Every change

- requested and intentionally out-of-scope behavior are explicit;
- relevant existing tests pass and changed logic has focused regression coverage;
- meaningful failure/cancellation paths are tested, not only happy paths;
- documentation/traceability/known limitations remain consistent with reachable behavior;
- no unrelated generated/user files are modified.

### UI/editor change

- shared UI remains host-neutral;
- keyboard/focus/read-only/error behavior is considered;
- timer/lifecycle behavior uses deterministic tests where possible;
- pending text is safe across every controlled transition affected by the change;
- generated standalone artifact still builds; native smoke is added when persistence/dialog behavior is touched.

### Domain/persistence/format change

- TypeScript/Rust semantics change together where the boundary is shared;
- revision/attribution/tree/snapshot invariants are asserted;
- capability differences are explicit rather than hidden behind throwing stubs;
- persisted schema/hash/wire/recovery changes include compatibility/version/migration analysis and fixtures;
- create/open/reopen/restore/export/backup/rollback consequences are reviewed.

### Security/capability change

- trust-boundary abuse cases are added;
- CSP/native permissions remain minimal unless deliberately expanded;
- any network behavior is explicit/opt-in and updates the security model.

### Release candidate

- frozen install, TypeScript tests/builds, Rust format/lint/tests and native package build pass as applicable;
- standalone qualification passes in every claimed browser;
- desktop core qualification passes on every claimed OS/package;
- backup/recovery is rehearsed with a disposable nontrivial document;
- P0/P1 integrity limitations are either addressed or release claims remain correspondingly limited;
- results, versions, skipped checks and known limitations are recorded.

## Documentation rule

Do not upgrade an item from Partial/Proposed to Implemented solely because a type or test exists. Reachability through the appropriate composition root and relevant acceptance evidence are both required. Remove or weaken an acceptance criterion only when the underlying product/design decision itself changes; do not delete it merely because implementation details moved into source.