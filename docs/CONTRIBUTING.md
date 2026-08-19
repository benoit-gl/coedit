# Contributor guide

This guide turns the architecture and RUP artifacts into a practical change workflow. Begin with [Traceability](./TRACEABILITY.md) when you know the feature but not the file; begin with [Architecture](./ARCHITECTURE.md) when the change crosses a runtime boundary.

## Development setup

Prerequisites and platform packaging dependencies are described in [Build and portability](./BUILD_AND_PORTABILITY.md). For the shared frontend and tests:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm build
```

For native work:

```powershell
corepack pnpm tauri:dev
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Use `corepack pnpm tauri:build` for a release package. Do not treat `cargo build --release` as the complete application build.

## Repository orientation

```text
coedit/
├── index.html                    standalone source entry
├── tauri.html                    desktop-WebView source entry
├── vite.config.ts                build split and standalone inliner
├── src/
│   ├── main.tsx                  standalone composition root
│   ├── main-tauri.tsx            Tauri composition root
│   ├── App.tsx                   presentation composition and event translation
│   ├── application/              use-case controller and serialized task queue
│   ├── components/               outline, node metadata, history
│   ├── editor/                   Tiptap/Yjs editor, encoding, sanitizer contract
│   ├── domain/                   TS contracts, tree rules, JSON/hash, IDs
│   ├── persistence/              ports and memory/Tauri adapters
│   ├── ai/                       reserved provider contract
│   └── styles.css                all current layout/presentation
├── src-tauri/
│   ├── src/models.rs             mirrored IPC/domain models
│   ├── src/lib.rs                commands and application state
│   ├── src/store.rs              SQLite store and exports
│   ├── capabilities/default.json native permission allowlist
│   └── tauri.conf.json           native build/window/CSP
└── docs/                         engineering artifacts
```

The symbol-level index is [Traceability and code map](./TRACEABILITY.md). The shortest useful reading path for most features is:

1. the matching UC row in [Vision and use cases](./RUP_VISION_AND_USE_CASES.md);
2. the matching feature/operation row in [Traceability](./TRACEABILITY.md);
3. its current sequence in [Sequence diagrams](./SEQUENCE_DIAGRAMS.md);
4. the owning frontend or persistence design section;
5. existing tests and [known limitations](./KNOWN_LIMITATIONS.md).

## Resuming the proposed continuous-workspace work

The implementation handoff for the next UX iteration is [Proposed continuous workspace](./proposals/README.md). It coordinates three designs that must be read together:

1. [Query-first historical views](./proposals/QUERY_FIRST_HISTORY.md) - add a non-mutating revision query and explicit live/historical workspace modes.
2. [Body checkpoint and commit strategy](./proposals/BODY_CHECKPOINT_STRATEGY.md) - replace the fixed timer with an injectable event-aware coordinator before inline focus transfer depends on it.
3. [Continuous block-outline](./proposals/CONTINUOUS_BLOCK_OUTLINE.md) - replace the master/detail composition after the query and checkpoint boundaries exist.

When picking the work up later:

- begin with the proposal [resume checklist](./proposals/README.md#resume-checklist) and confirm the current interfaces have not drifted;
- implement one delivery slice and its tests at a time, with the standalone host as the first qualification target;
- keep the Tauri frontend compiling and document intentional native gaps, but do not broaden a slice into unrelated Rust/schema hardening;
- define the proposed `BodyCheckpointPolicy` once, inject it into the coordinator, and keep `batchCharacterThreshold` and `idleTimeoutMs` free of duplicated production literals;
- implement the optional navigator only after the canvas projection is stable; keep it navigation-only, consume the same live/historical projection, and keep Navigator preference, History dock request/effective visibility/query staleness/data generation, compact drawer, selection/expansion, canvas context, actual focus region, actual editor ownership, one-shot retained-live resume candidate, and canvas expansion as the distinct states defined by the proposal; never accept an older History response over a hidden change or mount a restored resume target until its rebuilt canvas ancestry is visible;
- store at most validated, versioned preferred dock visibility in browser UI storage, default an invalid initial read closed, keep compact drawer state transient, and prove neither enters document state, hashes, snapshots, History, or exports;
- update the proposal decision/status tables and the as-built RUP, traceability, sequences, UI/UX, limitations, security, and testing sections only as behavior becomes reachable; and
- do not delete the current master/detail or timer documentation before the replacement passes its acceptance criteria.

The proposal documents are the decision record. Conversation history is not required to reconstruct the intended behavior.

## Change workflow (RUP-lite)

Use the RUP separation of concerns as a checklist, not as ceremony:

1. **Change request / vision**: state the user or maintainer problem and whether it is in current scope.
2. **Use case**: identify the actor, trigger, preconditions, success flow, alternatives, and postconditions. Add or revise a UC identifier when behavior changes materially.
3. **Analysis**: find affected domain concepts, invariants, persistence/security boundaries, and portability constraints.
4. **Design**: choose the owning component/port/store method; update diagrams if a relationship or sequence changes.
5. **Implementation**: change every required adapter/model deliberately. Avoid host detection inside shared UI.
6. **Verification**: add risk-proportionate unit, integration, and manual checks for both composition roots where applicable.
7. **Traceability/change management**: update the UC-to-code/test row, special specifications, limitations, and release notes/record.

Small refactors may not need a new use case, but they still must preserve the documented contracts and tests.

## Architectural contribution rules

- Keep [`App`](../src/App.tsx) and shared components free of Tauri imports. Supply host services in a composition root.
- Keep cross-component use-case state, command serialization, history paging/guards, and editor-flush policy in [`useDocumentController`](../src/application/useDocumentController.ts).
- Route every accepted visible document mutation through `DocumentOperation` plus `ContributionContext`.
- Add host-specific behavior to the applicable discriminated storage capability (`VolatileDocumentStorage` or `NativeDocumentStorage`); do not force adapters to provide rejecting stubs.
- Keep TypeScript and Rust operation names/serialized shapes aligned.
- Keep standalone and desktop semantics explicitly comparable; differences must be intentional and documented.
- Preserve stable node IDs through moves, soft deletion, and revision restoration.
- Preserve tree invariants: unique IDs, existing parents, no cycles, normalized active sibling positions.
- Do not mutate or delete historical contributions to implement restoration; append a compensating contribution.
- Treat `.coedit` input and rich HTML as untrusted.
- Do not add network origins, plugins, or providers to the offline composition roots incidentally.
- Treat any persisted schema/type change as a format-compatibility decision.

## Add a document operation

This is the most important cross-layer recipe. For a new persisted mutation such as `setNodeFlag`:

1. Add a discriminated union variant to `DocumentOperation` in [`src/domain/types.ts`](../src/domain/types.ts).
2. Add pure in-memory semantics to `applyOperation` in [`src/domain/tree.ts`](../src/domain/tree.ts).
3. Update `affectedNodeIds` in the same file.
4. Add unit cases to [`src/domain/tree.test.ts`](../src/domain/tree.test.ts), including invalid input and hierarchy effects.
5. Add the matching serde-tagged `DocumentOperation` variant in [`src-tauri/src/models.rs`](../src-tauri/src/models.rs).
6. Update Rust `operation_type()` and `affected_node_ids()`.
7. Add validation and transactional SQL in `DocumentStore::apply_sql` in [`src-tauri/src/store.rs`](../src-tauri/src/store.rs).
8. Add Rust tests for success, rollback/error, contribution payload/type, affected nodes, hash/snapshot, and reopen behavior.
9. Initiate the operation from [`App.tsx`](../src/App.tsx) or the owning component; use `useDocumentController.applyOperation` so flushing, context, queue, accepted-view guards, history, and status remain consistent.
10. Add a memory-gateway contract/integration case if generic dispatch is insufficient.
11. Update [Traceability](./TRACEABILITY.md), applicable sequence/class diagrams, the use case, and document-format/security text if persisted or security-relevant.

Do not implement an operation only in the UI or only in Rust. The standalone and desktop hosts would then silently diverge.

## Add or change a document field

First decide whether the field is:

- transient UI state;
- node `metadata` with no stable typed contract;
- a typed field in `DocumentState`/`DocumentNode`;
- a ledger-only field;
- a new normalized SQLite relationship.

For a persisted typed field:

1. Update the TypeScript model and all constructors/clones/serializers.
2. Update the Rust model and serde mapping.
3. Update schema creation, load, every relevant insert/update/restore path, snapshots, hashes, and exports.
4. Decide the default for existing documents.
5. Increment `FORMAT_VERSION`/`user_version` and implement/test a migration before opening old documents writable.
6. Update [Document format](./DOCUMENT_FORMAT.md), compatibility cases, recovery JSON expectations, and class/ER diagrams.

**Current hard constraint:** there is no migration framework. A schema change is not safe merely because a fresh database works. Design and land migration infrastructure or keep the persisted version unchanged.

## Change node-tag behavior

Change all of these together:

- normalization and vocabulary collection in [`src/domain/tags.ts`](../src/domain/tags.ts);
- token/combobox interaction in [`src/components/TagEditor.tsx`](../src/components/TagEditor.tsx);
- `NodeEditor` draft composition and transition flushing;
- the mirrored Rust `Vec<String>` validation and SQLite `tags_json` paths;
- hashes, snapshots, recovery fixtures, and format/migration behavior;
- TypeScript/Rust/UI tests and documentation.

Tags are document-local freeform values. Do not add a hard-coded global vocabulary: suggestions are derived from distinct tags on active nodes. Preserve the difference between an empty tag list and unrelated metadata, keep matching/limits consistent across adapters, and retain accessible combobox/chip keyboard behavior.

## Change the rich-text schema or toolbar

Formatting crosses the editor, sanitizers, stored HTML, Yjs state, export, and security boundaries:

1. Add/configure the Tiptap extension in [`src/editor/RichTextEditor.tsx`](../src/editor/RichTextEditor.tsx).
2. Add the toolbar command and correct pressed/disabled accessibility state.
3. Update the centralized allowlist in [`src/editor/sanitizeRichText.ts`](../src/editor/sanitizeRichText.ts), its version identifier, and [`fixtures/protocol/rich-text-v1.json`](../fixtures/protocol/rich-text-v1.json) as appropriate.
4. Configure or validate the Rust Ammonia policy in [`src-tauri/src/store.rs`](../src-tauri/src/store.rs); do not assume a frontend-only allowlist protects tampered IPC/input.
5. Define the Markdown behavior; it is currently deliberately lossy plain text.
6. Test paste, reload, restore, standalone/desktop parity, malicious attributes/URLs, undo/redo, and export.
7. Update [Security](./SECURITY.md), [Frontend design](./FRONTEND_DESIGN.md), and [Document format](./DOCUMENT_FORMAT.md).

The desktop backend currently trusts that supplied HTML, incremental Yjs update, and full Yjs state describe the same edit. A change in this area should consider validating that relationship.

## Add a UI component or workflow

- Keep leaf-local draft/visual state in the leaf when possible; keep document/use-case orchestration in `useDocumentController`.
- Pass data and callbacks downward. The current code has no router, context store, or event bus.
- Use the gateway rather than importing an adapter.
- Define welcome/empty/busy/read-only/recovery/error behavior, not only the happy workspace.
- Add keyboard and touch alternatives for pointer interactions.
- Add component/integration tests; current UI coverage is absent.
- Update the current wireframe/state model in [UI and UX](./UI_UX.md).

Do not move controller responsibilities back into `App.tsx`. If `useDocumentController` grows substantially, split it by application concern (session, history, native-files facade, drafts) while preserving one explicit composition seam and queue policy.

## Add a gateway capability

For a shared capability such as import or contributor registration:

1. Change the smallest owning port (`DocumentSession`, `ContributionHistory`, an applicable `DocumentStorage` variant, or a new focused interface) in [`src/persistence/gateway.ts`](../src/persistence/gateway.ts).
2. Define memory semantics in `MemoryDocumentGateway`.
3. Map the method in `TauriDocumentGateway`.
4. Add/register a narrow command in [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs).
5. Implement store behavior and validation in [`src-tauri/src/store.rs`](../src-tauri/src/store.rs).
6. Add adapter-contract tests so both implementations satisfy common expectations.
7. Expose orchestration through `useDocumentController` and rendering through `App`/components. If it needs native path selection, extend `DocumentFileDialogs` plus `tauriFileDialogs` separately.
8. Document parity, permissions, errors, and platform behavior.

Keep file selection separate from document persistence. For native-only behavior, extend `NativeDocumentStorage` or introduce another discriminated capability; the volatile variant should not gain a method that exists only to throw.

## Add another host or persistence adapter

1. Implement the shared session/history/export contracts with explicitly documented semantics.
2. Expose the correct storage capability and `DocumentFileDialogs` only when that host actually supports them.
3. Add a dedicated entry/composition root analogous to `main.tsx` or `main-tauri.tsx`.
4. Define durability, import/open, attribution, sanitization, limits, hash algorithm, snapshot retention, restore, backup, and export semantics.
5. Add shared adapter contract tests.
6. Add a build entry and CSP/capability profile specific to that host.
7. Extend architecture/deployment/portability documentation.

Do not reintroduce automatic runtime probing in shared modules. Explicit composition made the standalone artifact independently launchable.

## Add an export or import format

For a new export:

- extend the centralized `ExportFormat` in `src/domain/types.ts`, then update the controller/menu and relevant adapters/dialogs;
- extend native dialog filters and the Rust command/store dispatch;
- reuse `safeFilenameStem()` for standalone/native suggested names rather than introducing another slug implementation;
- use safe atomic desktop output and test overwrite/failure behavior;
- specify whether it is lossless recovery, interchange, or presentation output;
- test large documents and hostile content.

For import, first define identity, history, and snapshot/replay semantics. Standalone emits the explicitly marked `coedit-recovery` version-2 envelope with hash/completeness fields and a complete current-runtime ledger; desktop retains its older, capped version-1 shape. Neither has an importer. Do not label import as recovery until validation, round-trip fidelity, ledger validation, and failure recovery are tested.

## Add contributor/session management

The types and desktop tables exist, but the workflow does not. A complete contribution should include:

- gateway/command/store methods to register/select contributors;
- a policy for matching the local preference to document identities;
- explicit session start/end/description lifecycle;
- referential-integrity decisions for `contributions.session_id`;
- UI for identity selection without silently impersonating the first contributor;
- standalone parity and migration/version analysis;
- attribution and cross-machine tests.

Do this before treating multi-person portable-document attribution as reliable.

## Add an AI provider

[`src/ai/provider.ts`](../src/ai/provider.ts) defines `AiProvider` and `AiRequest`, but no provider is registered. A compliant integration must:

1. live outside the base offline composition roots or use an explicit permission/build profile;
2. disclose endpoint, model, content, and privacy effect;
3. run only after explicit user action and support cancellation;
4. keep returned content as an `AiProposal`, not an implicit mutation;
5. sanitize and preview the proposal;
6. apply only accepted changes through `DocumentGateway.applyOperation`;
7. attribute the provider and approving human in a defined contribution model;
8. update CSP/capabilities/security documentation intentionally;
9. test redirect/protocol/content/error/cancellation/offline behavior.

The existence of the interface does not mean AI is an implemented feature.

## Add collaboration

Yjs is currently a local rich-text representation, not a network collaboration system. Before adding a transport, specify:

- authentication and document authorization;
- opt-in discovery/endpoints and offline continuation;
- structural-operation conflict semantics (the tree is not a Yjs structure today);
- contributor/session identity across replicas;
- revision, hash, snapshot, and ledger ordering under concurrency;
- migration from single-writer assumptions;
- CSP/capability changes and threat model;
- deterministic replay and recovery tests.

Do not attach a synchronization provider only to `RichTextEditor`; that would synchronize text while leaving structure/history inconsistent.

## TypeScript practices

- Keep strict typing and discriminated unions exhaustive.
- Prefer pure domain functions for mutation/invariant logic.
- Avoid `any`, hidden host globals, and unhandled promise rejections.
- Keep user-visible async actions inside a consistent error/busy lifecycle.
- Route document commands through `SerializedTaskQueue`; keep history reads independently guarded by request/workspace epochs.
- Route controlled workspace changes through `runTransition()` so `DraftTransitionCoordinator` freezes and awaits document-title, pending tag-input, node-metadata, and rich-text participants before state can be invalidated or externalized.
- Preserve immutable React state boundaries; gateways return clones/complete views today.
- Add `.test.tsx` for components and `.test.ts` for domain/adapter behavior.
- Use browser APIs available under the documented standalone target or update the portability contract.

There is currently no lint script. TypeScript compilation and tests are the enforceable frontend checks until linting is added.

## Current staged scope

1. **Pass 1 — standalone architecture (current):** controller/queue, synchronous draft freeze plus awaitable title/metadata/rich-text drains, authoritative editor remount, discriminated storage capabilities, cursor-paged/filter-before-limit memory history, complete runtime recovery envelope, shared format/filename/sanitizer helpers, and versioned browser fixtures.
2. **Pass 2 — Rust/Tauri parity and hardening (deferred):** make Rust consume the hash/sanitizer fixtures, implement store-side indexed cursor filtering without a 100,000-row pre-window, move file authorization/path ownership behind a defensible Rust boundary, minimize native permissions, add schema migration and measured snapshot-compaction policy, and run native/platform verification.
3. **Pass 3 — dormant-feature decisions (deferred):** explicitly finish, retain as reserved, migrate, or remove AI, attachments, `restoreNode`, session lifecycle, contribution grouping, and generic node metadata.

The continuous-workspace package is a separately scoped UX/application iteration. Its implementation order is the completed revision-query slice, UI-neutral checkpoint core, visible-node projection, and unreachable read-only canvas scaffold; next comes checkpoint integration into the final one-editor canvas boundary, then editable canvas parity, grouped History, and the optional navigator over the stable shared projection, with standalone qualification first. The navigator is not a compatibility mode for the current master/detail editor. Do not confuse the checkpoint use of `groupId` for body-edit presentation with a final pass-3 decision about the broader dormant grouping/session model.

Do not implement a pass-2 or pass-3 item incidentally without updating its design, format/security impact, and tests.

## Rust and SQLite practices

- Return actionable `StoreError` messages; do not expose panics across commands.
- Validate before mutation and keep a visible mutation, revision, contribution, hash, and snapshot in one transaction.
- Use bound SQL parameters.
- Preserve the fixed file identity checks, `STRICT` schema, foreign keys, integrity check, busy timeout, and hierarchy validation.
- Apply input-size limits and sanitize untrusted HTML.
- Exercise create, reopen, restore, export, backup, and rollback behavior with temporary files.
- Run format, Clippy with warnings denied, and tests.
- Never make an old database writable under changed semantics without an explicit tested migration.

## Testing expectations

Use [Testing](./TESTING.md) to choose the suite. At minimum:

- pure domain changes need unit tests;
- gateway changes need memory and desktop contract/integration tests;
- UI changes need component behavior plus keyboard/accessibility cases;
- persisted changes need reopen/restore/export and compatibility tests;
- security changes need hostile-input cases;
- build changes need both standalone double-click and Tauri packaging checks;
- platform claims need evidence on that platform.

Do not use the standalone gateway as proof of desktop transactional behavior or the Rust store as proof of editor lifecycle correctness.

## Documentation expectations

Update the smallest authoritative set:

- visible product behavior: RUP use case and UI/UX;
- new relationship/boundary: architecture/design diagram;
- changed ordering: sequence diagram;
- new file/symbol/operation: traceability map;
- schema/export/recovery: document format;
- trust/capability/network/sanitizer: security;
- build/platform: build and portability;
- fixed/new debt: known limitations;
- tests: testing inventory/matrix.

Mark proposals as proposals. Documentation must not turn a reserved interface/table into an advertised feature.

## Definition of done

A contribution is complete when all applicable items are true:

- The use case and acceptance behavior are explicit.
- Ownership follows the documented dependency boundaries.
- Standalone and desktop behavior is implemented or the intentional difference is visible/documented.
- TypeScript and Rust models/operations agree.
- State/tree/transaction/attribution invariants remain true.
- Format-version and migration implications are resolved.
- Rich HTML and file input remain untrusted and bounded.
- Offline CSP/capabilities remain least-privilege unless the change explicitly defines another profile.
- Automated tests cover success and meaningful failure cases.
- Relevant manual suites pass in both runtimes and claimed platforms.
- Docs, traceability, limitations, and third-party notices are current.
- `pnpm` build/test, Rust format/Clippy/test, and `git diff --check` pass.
- No release artifact depends accidentally on a development server.
