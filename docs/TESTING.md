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

There are currently forty-two TypeScript test cases. This is a source inventory, not a claim that they were executed for every documentation edit.

| File | Suite / test | Layer | What it proves | Important omissions |
|---|---|---|---|---|
| `src/domain/tree.test.ts` | `builds the ordered hierarchy` | Pure domain | Parent/child materialization and simple order | Multiple roots, position ties, deleted nodes, orphans |
| `src/domain/tree.test.ts` | `rejects moving a node into its descendant` | Pure domain | One cycle-producing move is rejected | Self-parent, missing target, deeper/generated trees |
| `src/domain/tree.test.ts` | `soft-deletes a complete subtree` | Pure domain | Root and descendant deletion timestamps are applied | Sibling normalization, restore behavior, partial deleted trees |
| `src/domain/tree.test.ts` | `updates the node body and its complete Yjs state` | Pure domain | `updateBody` replaces body HTML/state without altering node metadata | Incremental-update interpretation and adapter parity |
| `src/domain/tree.test.ts` | `detects cyclic imported state` | Pure domain | `assertValidTree` catches a two-node cycle | Duplicate IDs, missing parent, self-cycle, large/deep graphs |
| `src/application/serializedTaskQueue.test.ts` (2) | ordering; recovery after failure | Application control | A later task starts only after the prior task settles, and rejection does not poison the queue | React/controller integration, cancellation, teardown |
| `src/application/draftTransition.test.ts` (3) | freeze/drain order; failed flush/retry; safe replacement cleanup | Application control | Freeze occurs synchronously, every participant drains before transition work, failure blocks, and stale unregister cannot remove a replacement | Full component/editor timing, host-exit hooks |
| `src/application/useDocumentController.test.tsx` (3) | selection/Close transition; failed flush; restore generation | React controller | Drafts freeze before await, controlled actions drain in order, failure preserves selection, and restore advances authoritative editor generation | Full `App`/Tiptap DOM, export/backup, native E2E |
| `src/application/localContributor.test.ts` (9) | stored-profile validation and fallback cases | Application boundary | Valid contributor preferences load; malformed JSON, invalid shapes/kinds/dates, and unavailable storage fall back safely | Browser-specific storage policy and contributor registration |
| `src/components/NodeEditor.test.tsx` (2) | normalized title acknowledgement; single-body UI | React component | A whitespace title adopts persisted normalization, and the editor exposes no secondary summary textarea | Focus behavior and full Tiptap composition |
| `src/components/TagEditor.test.tsx` (2) | tag create/reuse/remove; pending-input drain | React component | Freeform and suggested tags become chips, removal works, and controlled transitions flush unfinished tag text | Full screen-reader/IME/touch/browser interoperability |
| `src/domain/tags.test.ts` (5) | normalization; deduplication; limits; active vocabulary | Pure domain | Unicode/whitespace rules, first-spelling case-insensitive set behavior, validation, active-node growing/shrinking suggestions, and no document-wide 20-tag ceiling | Rust normalization parity and property/fuzz coverage |
| `src/domain/hash.test.ts` (4) | canonical fixture; host-field exclusion/order immutability; Unicode/integer-like ordering; invalid JSON rejection | Protocol/domain | `coedit-document-state-v1` canonical JSON/SHA-256, explicit `DocumentView` projection, engine-independent key order, and representative undefined/non-finite/non-plain/cyclic/sparse rejection | Rust equality, replay/open verification; symbol/accessor/extra-array-property branches |
| `src/editor/sanitizeRichText.test.ts` (2) | versioned cases; idempotence | Browser security contract | `coedit-rich-text-v1` expected output and repeat sanitization | Rust Ammonia parity, full editor paste integration |
| `src/persistence/memoryGateway.test.ts` (3) | attribution/restore; filtered cursor paging; recovery export | Adapter integration | Revision/history preservation, filter-before-page semantics, exclusive cursors, full runtime ledger envelope | Snapshot export/import, Rust parity |
| `src/persistence/memoryGateway.test.ts` boundary case (1) | detachment, metadata validation, direct-operation sanitization | Adapter/domain boundary | Inputs are detached, non-JSON metadata is rejected, and direct `createNode`/`updateBody` callers still receive sanitized rich text | Rust parity, exhaustive hostile values/limits |
| `src/persistence/memoryGateway.test.ts` filename case (1) | portable filenames | Shared output helper | diacritics, retained non-Latin letters, unsafe/reserved/empty names, and code-point length normalization | browser/native end-to-end filename behavior |

One `.test.tsx` suite exercises the hook through a minimal harness, and focused component suites cover one NodeEditor path plus core tag interaction. Full `App`, complete NodeEditor/Tiptap/Yjs timing, focus/keyboard behavior, and end-to-end UI are not automated.

### Rust persistence tests

Three unit/integration-style tests live in the `#[cfg(test)]` module at the end of `src-tauri/src/store.rs`.

| Test | Layer | What it proves | Important omissions |
|---|---|---|---|
| `rejects_tree_cycles` | Pure store validation | A two-node parent cycle is rejected | Other corrupt graph/value cases and open-path fixture validation |
| `removes_executable_html` | Sanitizer smoke | Ammonia removes a tested event handler and script element | Broader allow-list parity, URI schemes, malformed HTML, DOMPurify parity |
| `portable_document_round_trip_preserves_history` | Filesystem/SQLite integration | Create, add/update body, restore, four history records, backup, JSON export, Markdown export, close/reopen | Nonempty Yjs updates, failure atomicity, query filters/limits, future versions, locks, migration, complete export round trip |

The round-trip test creates a unique folder under the operating-system temporary directory and deletes it at the end. It exercises `DocumentStore` directly, not the Tauri command boundary or WebView.

### Current total and absent levels

The repository contains forty-five automated test cases: forty-two TypeScript and three Rust. It currently contains no automated:

- full-App React/accessibility tests;
- Tiptap/Yjs timing/lifecycle tests;
- browser end-to-end tests;
- generated standalone-artifact test;
- Tauri IPC contract or native end-to-end test;
- TypeScript/Rust serialization compatibility test;
- migration or old-format fixture test;
- Rust conformance test for the versioned TypeScript hash/sanitizer fixtures;
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
| Editor integration | Prove Tiptap/Yjs lifecycle | `RichTextEditor` with controlled timers and Yjs state | Debounce, explicit drain/retry, cleanup without late save, node switch, restore same ID, paste sanitation |
| Store integration | Prove SQLite/filesystem semantics | Temporary `.coedit` fixtures and `DocumentStore` | Transactions, snapshots, locks, backup, corrupt/future documents |
| IPC contract | Prove camel-case payload compatibility | Tauri command boundary or shared serialized fixtures | Every `DocumentOperation`, query/result/error shape |
| Artifact end-to-end | Prove what users actually launch | Generated standalone HTML and native Tauri package | `file://`, CSP, persistence after restart, correct composition root |
| Platform/accessibility | Qualify support claims | Real OS/browser/assistive environment | Windows/macOS/Linux, keyboard, screen reader, zoom, touch |

Keep pure operation tests broad and fast. Reserve full UI/native tests for behavior that cannot be trusted at a lower seam: timers, lifecycle order, serialization, filesystem semantics, CSP, and package composition.

### Risk matrix

| Risk ID | Failure mode | Severity | Current detection | Required next tests | Priority |
|---|---|---:|---|---|---:|
| RK-01 | The implemented draft-transition barrier regresses or is bypassed by uncontrolled page/process exit | High | Draft coordinator and controller Close/selection/failure tests | Full editor controlled-timer test; close/retry and host-exit E2E | P0 |
| Restore | Authoritative editor generation/remount wiring regresses or native restored state diverges | High | Controller restore-generation test plus `App` composite key | Full same-node Tiptap edit/reopen and native parity test | P0 |
| RK-04 | State hash cannot be reproduced/replayed across layers | High | TS canonical fixture and host-field test; Rust only checks stored values | Make Rust consume the same fixture; add replay and tamper tests | P0 |
| RK-07 | TS and Rust discriminated unions drift | High | Compilation within each language only | JSON fixture/contract tests for every operation and result type | P0 |
| RK-05 | Schema change strands or rewrites old documents | High | Version gate only | Version-1 fixtures, future-version read-only fixture, migration interruption suite | P0 before format 2 |
| RK-06 | Recovery JSON is capped on desktop and cannot be imported in either host | High | Standalone envelope/full-runtime-ledger test | >100,000 desktop boundary test; validation/import round trip when added | P1 |
| RK-03 | Foreign local profile cannot contribute under its identity | High | None | Open document with unmatched profile and exercise proposed register/select flow | P1 |
| RK-10 | Copy/write replacement failure leaves confusing artifacts or loses destination | High | Happy-path Rust test | Fault-injected create/export/backup replacement stages and recovery assertions | P1 |
| RK-09 | History pagination/search regresses, or desktop hides matches beyond its 100,000-row pre-window | Medium | Memory cursor/filter test | Controller Load-older/query tests; 100,001+ Rust SQL redesign case | P1 |
| Security | HTML or crafted SQLite data crosses a trust boundary | High | Versioned DOMPurify fixture plus one Ammonia smoke test | Make Rust consume shared cases; malformed/corrupt file fixtures | P1 |
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
| UC-04 Edit metadata | Tag domain/component tests and title acknowledgement | Blur title; add/reuse/remove tags; reopen | Full NodeEditor/tag integration, native limits/errors, TS/Rust parity |
| UC-05 Edit node body | Browser sanitizer fixtures; memory `updateBody`; Rust sanitizer/round-trip smoke; queue ordering | Formatting, paste, idle save, rapid switch/close | Controlled-timer editor/controller flush lifecycle suite |
| UC-06 Inspect history | Memory filter-before-page/cursor test; Rust length | Search, node filter, Load older, hash display, empty/error results | Controller paging/race test and 100,001+ desktop behavior |
| UC-07 Restore | Memory and Rust happy paths | Restore and reopen; edit after restore | Same-node Yjs regression; missing/read-only snapshot cases |
| UC-08 Export | Standalone recovery-envelope/filename tests; Rust happy-path file checks | Open Markdown/JSON; standalone downloads | Import/round trip, desktop cap, escaping, failure atomicity |
| UC-09 Backup | Rust happy-path copy | Desktop backup, byte size, renamed backup reopen | Locked/failure replacement and open-backup UX |
| UC-10 Close | Queue ordering/rejection recovery only | Close before debounce; failure/retry; standalone clears | Controller/editor flush-barrier component test and native reopen E2E |
| UC-11 Standalone | Build-time inline syntax checks, when build runs | Double-click generated HTML in target browsers | Automated `file://` E2E and CSP/external-request assertion |

## Test data and invariants

### Versioned protocol fixtures

`fixtures/protocol/document-hash-v1.json` currently includes:

- one document at a known revision;
- two contributors of different kinds;
- two writing sessions with different lifecycle fields;
- a parent/child pair supplied in deliberately unsorted ID order;
- host-only `DocumentView` fields that must be excluded;
- representative rich HTML and Base64 Yjs state;
- nested metadata objects with deliberately reordered keys; and
- a fixed canonical JSON string and SHA-256 digest.

`fixtures/protocol/rich-text-v1.json` contains supported-structure, executable-content, unsafe-URL, and unsupported-container cases for `coedit-rich-text-v1`.

TypeScript consumes both fixtures. Rust does not yet consume either one. The second pass should make the document-hash fixture a cross-language byte/digest oracle and should decide whether Ammonia must match the rich-text fixture byte-for-byte or satisfy a separately versioned safe-equivalence contract. Contributions covering every operation variant and full IPC shapes still need an additional shared fixture.

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
- missing parent, cycle, invalid tag array, unknown contributor kind;
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
2. Change the title; create two tags, reuse one on another node, remove its last active use, and confirm the suggestion list grows and shrinks.
3. Enter formatted paragraphs using bold, italic, heading, both list types, quote, undo, and redo.
4. Paste HTML containing a script or inline event handler and inspect the result/console.
5. Stop typing for more than 1.2 seconds.
6. Open history and confirm a writing contribution appears and the status returns from saving to saved.
7. Switch nodes immediately after typing and verify the controller drains the pending batch before selection changes.
8. Type another unique marker and click **Close** in less than 1.2 seconds; the marker cannot be reopened in volatile standalone mode, so instead confirm the save status completes before the welcome state appears and no late `No document is open` error reaches the console/banner.

Expected: only allowed content remains; metadata and text changes appear in history; controlled selection/Close freezes and drains title, metadata, and rich text. This does not test tab close/reload, which discards the entire standalone document by design.

### ST-05 - History and restore

1. Make distinguishable changes to two nodes.
2. Search by message/operation and contributor.
3. Enable **Selected idea only** and verify unrelated contributions disappear.
4. Where a prepared long-history fixture is available, verify the first page shows a `+` count and **Load older contributions**, then load successive pages without duplicates.
5. Restore an older revision after confirming the dialog.
6. Verify a new, higher revision records `restoreRevision` and prior entries remain.
7. Restore a revision in which the currently selected node has different text; verify the editor immediately shows the restored text, then edit it again.

Expected: history is append-only through the UI. The last step verifies the authoritative editor-generation remount; any stale pre-restore content is a regression.

### ST-06 - Exports and volatility

1. Export Markdown and inspect its hierarchy/headings/plain text.
2. Export JSON and confirm `format` is `coedit-recovery`, `exportVersion` is `2`, and `exportedAt`, `hashAlgorithm`, `stateHash`, `state`, `history`, and `contributions` exist.
3. Confirm contributions are newest first and include revision 0 plus every contribution visible/loaded or not yet loaded in History. Confirm `state` omits `path`, `readOnly`, and `recoveryWarning`.
4. Confirm accents are normalized, safe non-Latin letters are retained, unsafe/reserved/empty titles produce a safe normalized/fallback filename, and long names do not split Unicode code points.
5. Reload or close/reopen the HTML.

Expected: downloads complete; the JSON envelope is complete for the current in-memory session but has no importer; working document state is gone after reload and the volatility warning was accurate.

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

Expected target behavior: the controller flushes and queues the marker contribution before native close. A missing marker is a regression in the new barrier. This desktop outcome is not claimed verified until the second-pass Tauri suite is run.

### DT-04 - History and restore persistence

1. Create at least four distinct revisions on two nodes.
2. Restore an older revision.
3. Confirm revision increases by one and all original contributions remain.
4. Close/reopen and verify restored state/history.
5. Restore different content for the selected node ID, edit it, close/reopen, and verify the intended restored-plus-new content.

Expected target behavior: snapshot state and editor state agree through reopen. The last path supplies full editor/native evidence beyond the controller generation test.

### DT-05 - Export and backup

1. Export Markdown and confirm active hierarchy order, headings, summaries, and text.
2. Export JSON and confirm the desktop legacy fields `exportVersion: 1`, `exportedAt`, `state`, and `contributions` are present; do not expect the standalone version-2 format/hash/history fields in pass 1.
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
- memory exposes `VolatileDocumentStorage`, not `NativeDocumentStorage`, and therefore cannot open or back up SQLite;
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
- history query debounce, exclusive cursor, Load older, errors, and restore-disabled current revision;
- stale request/workspace ordering; and
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

1. Full editor/component proof extending the controller tests for the draft-transition barrier on Close, node switch, restore, export, and rejection/retry.
2. Same-node-ID revision restore followed by editing and reopen, including native parity.
3. Make Rust consume the existing canonical-hash fixture; add shared operation/IPC serialization fixtures.
4. Full operation invariant/rollback suite for memory and SQLite implementations.
5. Version-1 format fixture retained before any schema change; migration gate required for format `2`.
6. Generated standalone `file://` syntax/CSP/render smoke.

### P1 - Release confidence

1. React integration tests for create/edit/tree/history/restore/error/read-only states.
2. Tauri command contract tests.
3. Invalid/corrupt/future/journal/locked-file fixtures.
4. Backup/export replacement-failure and desktop completeness tests.
5. Controller Load-older/filter/race tests plus a Rust SQL redesign and 100,001+ contribution boundary case.
6. Contributor-profile mismatch workflow tests after product behavior is specified.
7. Windows/macOS/Linux build and packaged-runtime matrix.
8. Make Ammonia consume or deliberately version expectations against the existing DOMPurify adversarial fixture.

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
