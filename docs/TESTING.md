# Testing strategy

This is the RUP test-plan artifact for Coedit Local. It inventories the tests that exist in the current repository, defines risk-based verification for the two runtime hosts, and gives contributors a concrete definition of done. It does not imply that an unlisted test, browser, or platform has been exercised.

Use this document with:

- [Vision and use cases](./RUP_VISION_AND_USE_CASES.md) for requirement and use-case IDs;
- [Traceability and code map](./TRACEABILITY.md) for implementation ownership;
- [Architecture](./ARCHITECTURE.md) and [Sequence diagrams](./SEQUENCE_DIAGRAMS.md) for boundaries and runtime paths;
- [Frontend design](./FRONTEND_DESIGN.md) and [Persistence design](./PERSISTENCE_DESIGN.md) for test seams;
- [Build, release, and portability](./BUILD_AND_PORTABILITY.md) for artifact/platform checks;
- [Security model](./SECURITY.md) and [Document format](./DOCUMENT_FORMAT.md) for security and recovery oracles; and
- [Known limitations](./KNOWN_LIMITATIONS.md) for current defect status.

## Objectives

Testing should provide evidence that:

1. Pure hierarchy operations preserve document invariants.
2. The memory and desktop adapters honor the same `DocumentGateway` behavior where their capabilities overlap.
3. Desktop mutations are atomic across materialized state, contribution history, hashes, and snapshots.
4. Rich-text lifecycle events cannot silently lose or resurrect content.
5. Untrusted files and HTML fail closed or are sanitized.
6. Restore and recovery add evidence rather than erasing it.
7. The standalone output is truly self-contained and works through `file://`.
8. Native packages use the Tauri composition root and persist across process restarts.
9. Cross-language TypeScript/Rust payloads remain compatible.
10. Platform support claims are backed by an explicit build and smoke result.

For a writing application, silent data loss or false recovery confidence is more serious than a cosmetic failure. Test priority follows that risk.

## Current automated-test inventory

### TypeScript and browser-domain tests

Vitest is configured in `vite.config.ts` with the `jsdom` environment, globals enabled, and these include patterns:

```text
src/**/*.test.ts
src/**/*.test.tsx
```

There are currently five TypeScript test cases.

| File | Suite / test | Layer | What it proves | Important omissions |
|---|---|---|---|---|
| `src/domain/tree.test.ts` | `builds the ordered hierarchy` | Pure domain | Parent/child materialization and simple order | Multiple roots, position ties, deleted nodes, orphans |
| `src/domain/tree.test.ts` | `rejects moving a node into its descendant` | Pure domain | One cycle-producing move is rejected | Self-parent, missing target, deeper/generated trees |
| `src/domain/tree.test.ts` | `soft-deletes a complete subtree` | Pure domain | Root and descendant deletion timestamps are applied | Sibling normalization, restore behavior, partial deleted trees |
| `src/domain/tree.test.ts` | `detects cyclic imported state` | Pure domain | `assertValidTree` catches a two-node cycle | Duplicate IDs, missing parent, self-cycle, large/deep graphs |
| `src/persistence/memoryGateway.test.ts` | `attributes, hashes, and restores changes without deleting history` | Adapter integration | Create, two operations, restore, revision increase, history preservation, nonempty hashes | Export, queries, close, errors, browser download, parity with Rust |

No `.test.tsx` file currently exists, so React component behavior, editor timing, focus/keyboard handling, and `App` orchestration are not automated.

### Rust persistence tests

Three unit/integration-style tests live in the `#[cfg(test)]` module at the end of `src-tauri/src/store.rs`.

| Test | Layer | What it proves | Important omissions |
|---|---|---|---|
| `rejects_tree_cycles` | Pure store validation | A two-node parent cycle is rejected | Other corrupt graph/value cases and open-path fixture validation |
| `removes_executable_html` | Sanitizer smoke | Ammonia removes a tested event handler and script element | Broader allow-list parity, URI schemes, malformed HTML, DOMPurify parity |
| `portable_document_round_trip_preserves_history` | Filesystem/SQLite integration | Create, add/update, restore, four history records, backup, JSON export, Markdown export, close/reopen | Content/Yjs updates, failure atomicity, query filters/limits, future versions, locks, migration, complete export round trip |

The round-trip test creates a unique folder under the operating-system temporary directory and deletes it at the end. It exercises `DocumentStore` directly, not the Tauri command boundary or WebView.

### Current total and absent levels

The repository contains eight automated test cases: five TypeScript and three Rust. It currently contains no automated:

- React component or accessibility tests;
- Tiptap/Yjs timing/lifecycle tests;
- browser end-to-end tests;
- generated standalone-artifact test;
- Tauri IPC contract or native end-to-end test;
- TypeScript/Rust serialization compatibility test;
- migration or old-format fixture test;
- deterministic cross-language hash test;
- fault-injection or interrupted-write test;
- macOS/Linux/Windows CI matrix; or
- performance, property-based, fuzz, or long-history test.

## Commands

Run commands from the repository root unless a command says otherwise. The repository pins pnpm through `packageManager` and Rust through `src-tauri/rust-toolchain.toml`.

### Install and TypeScript verification

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm build
corepack pnpm build:tauri
```

- `corepack pnpm test` runs `vitest run` once.
- `corepack pnpm test:watch` starts Vitest watch mode for local development.
- `corepack pnpm build` runs `tsc -b` and the standalone Vite build. It also exercises the build-time single-chunk, external-asset, CSP-hash, and inline-JavaScript validity checks in `vite.config.ts`.
- `corepack pnpm build:tauri` runs the same TypeScript project build and Vite in `tauri` mode.
- There is no current `lint` script.

### Rust verification

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

`cargo test` uses the pinned toolchain when rustup honors `src-tauri/rust-toolchain.toml`. A contributor may also run these commands from `src-tauri` without `--manifest-path`.

### Runtime smoke commands

```powershell
corepack pnpm tauri:dev
corepack pnpm tauri:build
```

Use `tauri:dev` for the native interactive suite and `tauri:build` for release-artifact evidence. A raw `cargo build --release` does not build/package the correct frontend and is not a release verification substitute.

### Recording results

For a pull request or release candidate, record:

- command and exact exit result;
- operating system, architecture, Node/pnpm/Rust versions;
- browser and version for standalone checks;
- Tauri package type tested;
- manual scenarios performed;
- temporary fixtures used, including source format version; and
- any skipped test with a reason and owner.

Do not describe source portability as platform testing.

## Risk-based strategy

### Test levels

| Level | Purpose | Preferred seam | Examples |
|---|---|---|---|
| Pure unit | Exhaust domain edge cases quickly | `src/domain/tree.ts`, hash/encoding helpers, Rust validation/helpers | Tree invariants, canonical order, base64 failures, Markdown traversal |
| Adapter contract | Prove gateway semantics independent of UI | Reusable suite against `MemoryDocumentGateway`; Rust/Tauri bridge equivalent | Revision rules, attribution, queries, restore, close, export |
| Component integration | Prove React behavior and asynchronous coordination | Components with injected callbacks/fake gateway in jsdom | Blur commits, outline keys, busy/read-only states, close flush |
| Editor integration | Prove Tiptap/Yjs lifecycle | `RichTextEditor` with controlled timers and Yjs state | Debounce, unmount flush, node switch, restore same ID, paste sanitation |
| Store integration | Prove SQLite/filesystem semantics | Temporary `.coedit` fixtures and `DocumentStore` | Transactions, snapshots, locks, backup, corrupt/future documents |
| IPC contract | Prove camel-case payload compatibility | Tauri command boundary or shared serialized fixtures | Every `DocumentOperation`, query/result/error shape |
| Artifact end-to-end | Prove what users actually launch | Generated standalone HTML and native Tauri package | `file://`, CSP, persistence after restart, correct composition root |
| Platform/accessibility | Qualify support claims | Real OS/browser/assistive environment | Windows/macOS/Linux, keyboard, screen reader, zoom, touch |

Keep pure operation tests broad and fast. Reserve full UI/native tests for behavior that cannot be trusted at a lower seam: timers, lifecycle order, serialization, filesystem semantics, CSP, and package composition.

### Risk matrix

| Risk ID | Failure mode | Severity | Current detection | Required next tests | Priority |
|---|---|---:|---|---|---:|
| RK-01 | Pending rich-text update is lost when Close wins the race | Critical | None | Fake-gateway component test with controlled timers; desktop close/reopen E2E | P0 |
| RK-02 | Restore leaves the selected Yjs document stale and a later edit overwrites restored text | Critical | None | Restore same node ID, assert editor content/state, then edit and reopen | P0 |
| RK-04 | State hash cannot be reproduced/replayed across layers | High | Only checks nonempty strings | Golden canonical-state fixtures in TS/Rust; replay and tamper tests | P0 |
| RK-07 | TS and Rust discriminated unions drift | High | Compilation within each language only | JSON fixture/contract tests for every operation and result type | P0 |
| RK-05 | Schema change strands or rewrites old documents | High | Version gate only | Version-1 fixtures, future-version read-only fixture, migration interruption suite | P0 before format 2 |
| RK-06 | Recovery JSON silently omits history | High | None | >100,000 contribution or streamed-boundary test; standalone schema assertion; import/round-trip when added | P1 |
| RK-03 | Foreign local profile cannot contribute under its identity | High | None | Open document with unmatched profile and exercise proposed register/select flow | P1 |
| RK-10 | Copy/write replacement failure leaves confusing artifacts or loses destination | High | Happy-path Rust test | Fault-injected create/export/backup replacement stages and recovery assertions | P1 |
| RK-09 | History search/count appears complete but covers 500 rows | Medium | None | 501+ contribution UI/query/pagination test | P1 |
| Security | HTML or crafted SQLite data crosses a trust boundary | High | One Ammonia smoke test | Malformed HTML corpus, URL schemes, DOMPurify/Ammonia expected-output cases, corrupt file fixtures | P1 |
| Portability | A release compiles but does not launch/persist on a claimed OS | High | Developer-specific manual runs | Per-OS package build, launch, create/reopen/export smoke | P1 |
| Accessibility | Keyboard/touch/assistive users cannot reach core actions | Medium-high | Source inspection only | Component accessibility checks and manual keyboard/screen-reader/touch suite | P2 |
| Performance | Snapshot-per-revision or full-array history becomes unusable | Medium | None | Large document/history benchmarks with explicit budgets | P2 |

P0 means required before trusting the affected data-integrity behavior. P1 means required before a broad desktop release or claiming recovery/platform completeness. P2 improves quality and scalability after correctness boundaries are defended.

## Use-case verification matrix

| Use case | Existing automated evidence | Required manual evidence now | Highest missing automation |
|---|---|---|---|
| UC-01 Create | Memory gateway create path; Rust round trip | Standalone create; desktop create and file existence | App/dialog cancel/error cases; temporary-create failure cleanup |
| UC-02 Open | Rust round trip reopens valid v1 | Desktop valid/invalid/open-cancel; read-only warning | Corrupt/future/journal fixtures and Tauri IPC path |
| UC-03 Organize hierarchy | Four TS tree cases; one Rust cycle case | Keyboard, reordering, drag/reparent, delete confirmation | Full operation parity/property suite and component keyboard tests |
| UC-04 Edit metadata | Indirect memory/Rust update summary | Blur title/summary; change each kind; reopen | `NodeEditor` component tests, limits/errors, TS/Rust parity |
| UC-05 Edit developed text | Rust sanitizer smoke only | Formatting, paste, idle save, rapid switch/close | Controlled-timer editor lifecycle suite |
| UC-06 Inspect history | Memory history length; Rust length | Search, node filter, hash display, empty results | Query filters/limits and 500+ UI behavior |
| UC-07 Restore | Memory and Rust happy paths | Restore and reopen; edit after restore | Same-node Yjs regression; missing/read-only snapshot cases |
| UC-08 Export | Rust happy-path file checks | Open Markdown/JSON; standalone downloads | Exact schemas, escaping, large history, failure atomicity |
| UC-09 Backup | Rust happy-path copy | Desktop backup, byte size, renamed backup reopen | Locked/failure replacement and open-backup UX |
| UC-10 Close | None | Desktop close/reopen; standalone clears | Pending editor flush and command failure tests |
| UC-11 Standalone | Build-time inline syntax checks, when build runs | Double-click generated HTML in target browsers | Automated `file://` E2E and CSP/external-request assertion |

## Test data and invariants

### Minimal canonical fixture

A shared fixture should include:

- one document at a known revision;
- two contributors of different kinds;
- one writing session;
- two roots with deliberately unsorted IDs;
- nested nodes with position ties;
- one soft-deleted subtree;
- sanitized rich HTML;
- nonempty Yjs state and incremental update;
- nested metadata objects with deliberately reordered keys; and
- contributions covering every operation variant.

Serialize the same fixture through TypeScript and Rust. It should become the oracle for camel-case field names, enum tags, canonical hashing, affected-node IDs, snapshot state, and JSON export versioning.

### Domain invariants to assert after every operation

1. Node IDs are unique.
2. Every non-null parent exists.
3. No node is its own ancestor.
4. Active sibling positions are contiguous from zero after normalization.
5. A soft-deleted subtree contains no active descendant.
6. Restore-node behavior reactivates the intended node and required ancestor chain according to the specified rule.
7. The document revision advances exactly once per successful persisted operation.
8. A failed operation changes neither materialized state nor revision/history/snapshot count.
9. Contribution `baseRevision`, `revision`, contributor, operation type, affected IDs, and message correspond to the request.
10. Snapshot state and stored resulting hash describe the same revision.
11. Read-only stores reject all mutation and restore attempts.

### Untrusted-input corpus

Maintain small, reviewable fixtures for:

- valid format-1 `.coedit`;
- wrong SQLite application ID;
- wrong magic metadata;
- inconsistent `user_version` and metadata format version;
- future version with compatible core tables;
- failed `PRAGMA integrity_check` or truncated database;
- missing parent, cycle, unknown node/contributor kind;
- invalid metadata JSON;
- invalid or over-limit Yjs base64;
- malicious/malformed HTML and dangerous URL schemes;
- an interrupted delete-journal scenario; and
- paths with spaces, Unicode, long names, and existing destinations.

Fixtures must contain no private user documents or credentials.

## Manual standalone suite

### Preparation

1. Run `corepack pnpm build`.
2. Confirm the build reports only the generated standalone `dist/index.html` as its runtime artifact. Source maps or external assets should not be required.
3. Double-click `dist/index.html`; do not substitute the Vite development server for this suite.
4. Record browser/version and operating system.
5. Keep the browser console and network view open where available.

### ST-01 - Bootstrap and offline boundary

1. Confirm the page renders rather than showing source code or a module/CORS error.
2. Confirm the welcome card says standalone documents are kept in memory and disappear when the page closes.
3. Confirm **Open .coedit file** is absent.
4. Confirm the browser console has no syntax, CSP, module-source, or uncaught runtime error.
5. Confirm no HTTP/HTTPS request is attempted. Blob/download URLs are expected only during export.

Expected: the generated file runs through `file://` with the memory gateway and no service.

### ST-02 - Create and contributor preference

1. Enter a contributor name and document title.
2. Create the document.
3. Confirm the empty editor offers to create the first idea.
4. Close the document and confirm the welcome screen returns.
5. Confirm the contributor name remains when the browser permits local storage.

Expected: document revision `0` is represented in history after creation; profile persistence is best effort under `file://`.

### ST-03 - Hierarchy behavior

1. Create two root ideas and at least two children.
2. Use up/down row actions to reorder siblings.
3. Drag one root onto another and confirm it becomes the last child.
4. Focus the outline and exercise Arrow Up, Down, Left, and Right.
5. Attempt a move that would create a descendant cycle if the UI permits it; confirm it is rejected without corrupting the visible tree.
6. Delete a parent, cancel once, then confirm. Verify the subtree disappears from the active outline.

Expected: stable titles/selection, acyclic hierarchy, normalized order, and a contribution for every accepted structural change.

### ST-04 - Metadata and rich text

1. Change a node title and leave the field.
2. Change summary and kind through all five options.
3. Enter formatted paragraphs using bold, italic, heading, both list types, quote, undo, and redo.
4. Paste HTML containing a script or inline event handler and inspect the result/console.
5. Stop typing for more than 1.2 seconds.
6. Open history and confirm a writing contribution appears and the status returns from saving to saved.
7. Switch nodes immediately after typing and verify the committed content when returning.

Expected: only allowed content remains; metadata and text changes appear in history. Record rapid-switch anomalies as data-integrity defects.

### ST-05 - History and restore

1. Make distinguishable changes to two nodes.
2. Search by message/operation and contributor.
3. Enable **Selected idea only** and verify unrelated contributions disappear.
4. Restore an older revision after confirming the dialog.
5. Verify a new, higher revision records `restoreRevision` and prior entries remain.
6. Restore a revision in which the currently selected node has different text; verify the editor immediately shows the restored text, then edit it again.

Expected: history is append-only through the UI. The last step specifically probes RK-02 and may expose the documented defect until fixed.

### ST-06 - Exports and volatility

1. Export Markdown and inspect its hierarchy/headings/plain text.
2. Export JSON and inspect its top-level shape.
3. Confirm current standalone JSON contains the document view but not contribution history; treat this as a known limitation, not a passed complete-recovery claim.
4. Reload or close/reopen the HTML.

Expected: downloads complete; working document state is gone after reload and the volatility warning was accurate.

### ST-07 - Browser coverage

At minimum, repeat ST-01 and a create/edit/export smoke in each browser the release notes claim. Desktop Chromium, Firefox, and Safari/WebKit should be recorded separately; one passing browser is not evidence for the others. iPadOS is experimental unless the complete [portability](./BUILD_AND_PORTABILITY.md) qualification suite passes.

## Manual desktop suite

Use a disposable test directory outside source control. Do not use a real user document for corruption or format-version tests.

### DT-01 - Native bootstrap and composition

1. Run `corepack pnpm tauri:dev` or launch the packaged artifact under test.
2. Confirm the desktop welcome screen has **Open .coedit file** and does not show the standalone volatility notice.
3. Confirm the process does not open an application-server console/window.
4. Confirm ordinary outbound network traffic is absent.

Expected: the Tauri composition root is active and file dialogs are native.

### DT-02 - Create, commit, close, and reopen

1. Create `round-trip.coedit` in the disposable directory.
2. Add roots/children; reorder/reparent them; edit every metadata field and rich text.
3. Wait for the saved status after the last text change.
4. Record the latest history revision and visible hash prefix.
5. Close, reopen the file, and verify hierarchy, content, metadata, history, and revision.
6. Quit and relaunch the whole application, then reopen and verify again.

Expected: all committed state survives both document close and process restart.

### DT-03 - Close-before-debounce regression

1. Open a node with recognizable content.
2. Type a unique marker and click **Close** in substantially less than 1.2 seconds.
3. Reopen immediately and search for the marker.
4. Repeat while switching nodes immediately before close.

Expected target behavior: the marker is persisted or the UI explicitly prevents/warns about close. Current code has a known race, so a missing marker is a confirmed RK-01 reproduction, not acceptable release behavior.

### DT-04 - History and restore persistence

1. Create at least four distinct revisions on two nodes.
2. Restore an older revision.
3. Confirm revision increases by one and all original contributions remain.
4. Close/reopen and verify restored state/history.
5. Restore different content for the selected node ID, edit it, close/reopen, and verify the intended restored-plus-new content.

Expected target behavior: snapshot state and editor state agree through reopen. The last path probes RK-02.

### DT-05 - Export and backup

1. Export Markdown and confirm active hierarchy order, headings, summaries, and text.
2. Export JSON and confirm `exportVersion`, `exportedAt`, `state`, and `contributions` are present.
3. Create a `.coedit-backup` and compare its reported byte count with the filesystem size.
4. Preserve the original, rename a copy of the backup to `.coedit`, and open that copy.
5. Verify document state and history.

Expected: outputs are created atomically and the renamed backup opens. Record that the normal dialog does not display `.coedit-backup` directly.

### DT-06 - Contributor identity portability

1. Create a document with profile A.
2. Change/remove the local-storage profile so the app starts with profile B.
3. Open the document and make a change.
4. Inspect attribution.

Expected current behavior: `App` falls back to the first contributor in the document because B is not registered. This suite characterizes RK-03; future acceptance should require an explicit identity choice/registration rather than silent fallback.

### DT-07 - Read-only and validation

Using disposable copies and a trusted SQLite inspection tool:

1. Try a non-Coedit SQLite file.
2. Try a copy with wrong application ID.
3. Try inconsistent `user_version` and `metadata.format_version`.
4. Try a copy with a missing parent or cycle.
5. Set a copy to a future format version while keeping compatible core tables.

Expected: invalid identities/structures fail closed. A compatible future-format copy displays the read-only warning; edit and restore controls must not mutate it.

### DT-08 - Recovery journal warning

Create an interrupted-transaction fixture through a controlled test helper or database tool; do not manufacture it against a real document. Preserve the main file and journal together, then open the copy.

Expected: SQLite recovery succeeds or fails explicitly. If a journal was present at open, the UI shows the recovery warning and committed history remains coherent.

### DT-09 - Locking and competing processes

1. Open the same disposable `.coedit` file in two application instances if the platform permits.
2. Attempt overlapping writes.
3. Observe the 5-second busy timeout/error handling.
4. Close both and verify SQLite integrity/history.

Expected: no silent corruption or partial revision. The current product does not advertise multi-process editing, so a clear failure is acceptable; divergent successful writes are not.

## Security and recovery suites

### HTML sanitization matrix

Test both paste-time DOMPurify and desktop persistence-time Ammonia with:

- `<script>`, `<style>`, `<iframe>`, `<object>`, and `<embed>`;
- `onerror`, `onclick`, and other event attributes;
- malformed/nested tags;
- links with `javascript:`, unexpected data URLs, and ordinary safe URLs;
- oversized HTML near and beyond the 16 MiB desktop limit; and
- HTML that each sanitizer normalizes differently.

Assertions should focus on safe semantics and an agreed allow-list, not fragile byte-for-byte serialization unless canonical output is intentionally specified.

### File validation matrix

For every invalid fixture, assert:

- opening returns an actionable error;
- no mutation/migration occurs unless explicitly under a migration test;
- the original fixture bytes remain unchanged;
- no document view is installed; and
- the application can subsequently open a valid document.

### Backup/export recovery rehearsal

At release-candidate level:

1. Create a nontrivial document and record its revision/hash/history count.
2. Produce `.coedit-backup`, JSON, Markdown.
3. Recover from the backup copy and compare state/history.
4. Inspect JSON completeness and documented limits.
5. Confirm Markdown is usable interchange but not presented as full recovery.
6. Simulate a failed destination replacement and verify the previous destination remains recoverable.

## Platform qualification matrix

Do not check a platform as supported until the applicable rows have dated evidence.

| Target | Build evidence | Minimum runtime evidence | Current status |
|---|---|---|---|
| Windows standalone | `corepack pnpm build` | ST-01 through ST-06 in claimed browsers | Manually demonstrated during development; not automated |
| macOS standalone | Same portable output or native build host | ST-01 plus create/edit/export in Safari and one alternate browser | Unverified |
| Linux standalone | Same portable output | ST-01 plus create/edit/export in claimed browser(s) | Unverified |
| Windows Tauri | `corepack pnpm tauri:build` on Windows | DT-01, DT-02, DT-04, DT-05 plus launch packaged artifact | No CI evidence |
| macOS Tauri | `tauri:build` on macOS with signing policy | Same desktop core plus package reopen | Unverified |
| Linux Tauri | `tauri:build` on target distro family | Same desktop core plus package dependency/reopen check | Unverified |
| iPadOS browser | A delivery method for the generated HTML | Touch layout, editing, export/download, storage, reload behavior | Experimental/unsupported |
| iPadOS native | Initialized/signed Tauri iOS project | File lifecycle, sandbox paths, touch UI, background/resume, persistence | Not implemented |

## Test placement and design guidance

### TypeScript pure-domain tests

Place tests beside the implementation as `src/domain/<name>.test.ts` when they require no React or native host. Prefer table-driven cases and explicit immutable fixtures. Good candidates:

- every `DocumentOperation` success/failure path;
- sibling normalization across moves/deletes/restores;
- duplicate/missing/self/cycle tree validation;
- canonical document JSON with reordered keys/arrays;
- ID fallback shape and base64 round trips; and
- standalone Markdown traversal and escaping semantics.

### Gateway contract tests

Extract a reusable behavioral suite that can be instantiated with a gateway fixture. Require common semantics for create, apply, revision, attribution, queries, restore, and close. Capability differences must be explicit:

- memory create accepts `null` path; desktop requires a path;
- memory cannot open SQLite;
- standalone exports download through the browser; desktop exports to selected paths;
- SQLite backup is a desktop user workflow.

Do not force false parity where host capabilities genuinely differ. Do require parity for the shared document-operation model.

### React component tests

Colocate as `src/components/<Component>.test.tsx` or `src/editor/RichTextEditor.test.tsx`. The current dev dependencies do not include React Testing Library or a browser E2E runner; adding one is a deliberate dependency change and must update lockfile/notices as applicable.

Use injected fake gateways/dialogs rather than mocking Tauri imports in shared UI tests. Control timers for rich-text debounce. Cover:

- metadata blur versus unchanged values;
- outline keyboard navigation and disabled states;
- confirmation accepted/canceled;
- busy/error/read-only banners;
- history filters and restore-disabled latest revision;
- async refresh ordering; and
- flush before node switch/close/restore.

### Rust store tests

Small helper tests may remain in `src-tauri/src/store.rs`. Larger black-box format/fixture tests should move to a dedicated Rust integration-test module once the relevant APIs are accessible. Always use unique temporary paths and clean up without touching user files.

Cover both success and rollback. For each operation, query:

- materialized metadata/node rows;
- contribution count and payload;
- snapshot count/state/hash;
- revision and updated timestamp; and
- persisted state after connection drop/reopen.

### IPC and cross-language tests

The payload mirror in `src/domain/types.ts` and `src-tauri/src/models.rs` is a high-value contract seam. Add shared JSON fixtures for:

- all contributor/node enums;
- every `DocumentOperation` variant;
- optional/missing fields and camel-case names;
- `DocumentView`, `ContributionQuery`, and `ExportResult`;
- error responses; and
- large integer/revision boundaries relevant to JavaScript number safety.

Longer term, generate one side from a schema or generate compatibility fixtures during CI.

### Build-plugin and artifact tests

The standalone inliner currently checks its own output during build. Add an artifact-level test that opens the emitted file through `file://` and asserts:

- the React root renders;
- there is no external script/style reference;
- CSP permits exactly the generated module and denies fetch/network;
- source strings containing `</head>`, `</script>`, or replacement tokens do not corrupt inlining;
- browser console has no syntax/CORS errors; and
- create/edit/export works.

Keep Tauri and standalone builds separate in tests so the wrong composition root cannot pass unnoticed.

## Priority automation backlog

### P0 - Data-integrity gates

1. Rich-editor flush barrier on Close and node switch, including rejection/error handling.
2. Same-node-ID revision restore followed by editing and reopen.
3. Shared TS/Rust serialization and canonical-hash golden fixtures.
4. Full operation invariant/rollback suite for memory and SQLite implementations.
5. Version-1 format fixture retained before any schema change; migration gate required for format `2`.
6. Generated standalone `file://` syntax/CSP/render smoke.

### P1 - Release confidence

1. React integration tests for create/edit/tree/history/restore/error/read-only states.
2. Tauri command contract tests.
3. Invalid/corrupt/future/journal/locked-file fixtures.
4. Backup/export replacement-failure and completeness tests.
5. 501+ and 100,001+ contribution boundary tests or redesigned streaming/pagination behavior.
6. Contributor-profile mismatch workflow tests after product behavior is specified.
7. Windows/macOS/Linux build and packaged-runtime matrix.
8. DOMPurify/Ammonia adversarial corpus and protocol checks.

### P2 - Quality and scale

1. Accessibility automation plus keyboard/screen-reader manual audits.
2. Touch/tablet interaction tests and an alternative to HTML drag/drop.
3. Property-based tree-operation sequences.
4. Parser/store fuzzing with bounded resources.
5. Large tree, Yjs state, history, snapshot, export, and startup benchmarks.
6. Visual-regression coverage for welcome/workspace/history/read-only/error states.

## Definition of done

A change is done only when all applicable items below are true.

### Every change

- The requested behavior and out-of-scope behavior are explicit.
- Existing relevant TypeScript and Rust tests pass.
- New or changed logic has a test at the lowest reliable seam.
- Failure and cancellation paths are tested, not only the happy path.
- No unrelated user files, generated documents, or lockfiles are modified accidentally.
- Documentation and [traceability](./TRACEABILITY.md) reflect externally visible changes.

### UI or editor change

- Shared UI remains runnable with `MemoryDocumentGateway`; no Tauri import leaks into `App` or shared components.
- Keyboard, focus, read-only, busy, error, and narrow-width behavior are considered.
- Timer/lifecycle behavior uses deterministic tests.
- Pending text is safe across node switch, restore, close, and gateway errors.
- `corepack pnpm build` succeeds and the generated HTML passes the standalone manual smoke.
- Desktop behavior is smoke-tested if the change affects persistence or native dialogs.

### Domain operation change

- TypeScript union/pure semantics and Rust enum/SQL semantics change together.
- Affected-node IDs, contribution payload, messages, revision rules, and tree invariants are asserted.
- Both memory and desktop paths have equivalent behavior or the capability difference is documented.
- Invalid identifiers/parents/indices and read-only behavior are covered.
- Restore/export/replay implications are reviewed.

### Persistence or format change

- The schema/version decision is explicit; a schema change is not merged without a migration policy and fixtures.
- Create, open, mutate, close/reopen, restore, export, backup, and rollback behavior remain coherent.
- Existing format fixtures remain readable according to policy.
- Newer-format behavior is verified read-only/fail-closed as appropriate.
- Atomicity is tested at meaningful failure points.
- [Document format](./DOCUMENT_FORMAT.md), [Persistence design](./PERSISTENCE_DESIGN.md), and recovery instructions are updated.

### Security/capability change

- Trust-boundary and abuse cases are added to tests.
- CSP and Tauri capabilities remain minimal and are reviewed explicitly.
- Any new network behavior is opt-in and meets [Security model](./SECURITY.md).
- Dependency and third-party notice implications are reviewed.

### Release candidate

- Frozen dependency installation, TypeScript tests/builds, Rust format/lint/tests, and native package build pass.
- The standalone suite passes in every claimed browser.
- The desktop core suite passes on every claimed operating system/package.
- Backup and recovery are rehearsed with a disposable nontrivial document.
- Known data-loss/integrity P0 risks are fixed or the release is not presented as reliable persistent editing software.
- Results, versions, skips, and known limitations are recorded with the release evidence.

## Maintaining this test plan

When adding a use case, requirement, host adapter, Tauri command, schema field, export format, or supported platform, update the inventory/matrix and add verification before changing the support claim. Remove a gap only after the test exists and has been run in the environment it claims to cover.
