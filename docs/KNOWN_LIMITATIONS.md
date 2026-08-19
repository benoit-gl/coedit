# Known limitations and risk register

This is the current RUP risk list for version `0.1.0`, not a roadmap promise. Each item is grounded in the present code. Severity combines likelihood and impact; it is not a security rating.

Priority meaning:

- **P0**: credible document loss, corruption, or attribution-integrity risk; address before relying on Coedit for important work.
- **P1**: material correctness, recovery, compatibility, or architectural risk.
- **P2**: scalability, usability, portability, or maintainability limitation.
- **P3**: reserved capability or polish gap with limited current impact.

## Summary register

| ID | Priority | Area | Current limitation | Primary evidence |
|---|---|---|---|---|
| R-03 | P0 | Attribution | Opening another author's file can silently attribute new work to its first contributor | `App` `contributor` fallback; no registration API |
| R-04 | P1 | Integrity | Memory revision queries verify snapshot hashes, but desktop open/restore and both restore paths still do not verify/replay the ledger | `materializeRevision`; `DocumentStore::open`/`restore` |
| R-05 | P1 | Compatibility | Format/version fields exist, but there is no migration machinery | `FORMAT_VERSION`; `DocumentStore::open` |
| R-06 | P1 | Draft lifecycle | Controlled transitions drain registered drafts, but page/process exit and forced host suspension cannot await them | controller/editor; React/browser lifecycle |
| R-07 | P1 | Recovery export | Desktop JSON silently caps history at 100,000; neither JSON envelope has an importer | Rust export; both product workflows |
| R-08 | P1 | CRDT integrity | Desktop decodes but does not reconcile/verify incremental Yjs update, full state, and HTML | `DocumentStore::apply_sql(UpdateBody)` |
| R-09 | P1 | Adapter parity | Browser/Rust hash, sanitization, limits, sessions, and Markdown semantics differ; new TS fixtures have no Rust conformance yet | protocol fixtures versus Rust store |
| R-10 | P1 | Backup UX | `.coedit-backup` is produced, but Open filters only `.coedit` | `tauriFiles.ts` filters |
| R-11 | P2 | History | Shared UI pages/filter-before-limit correctly, but desktop only considers the newest 100,000 rows | `ContributionPage`; `DocumentStore::contributions` |
| R-12 | P2 | Storage growth | Every revision stores a complete JSON snapshot | `insert_snapshot` on create/apply/restore |
| R-13 | P2 | Standalone durability | Page close/reload loses the document; no import or durable browser store exists | `MemoryDocumentGateway` |
| R-14 | P2 | Multi-document/concurrency | One process-global store/mutex supports one open document and serialized commands | `AppState` in `lib.rs` |
| R-15 | P2 | Session model | Sessions are partial: memory has none; desktop starts lazily and never ends them | both gateways/schema |
| R-16 | P2 | Rich-text/export | Markdown conversion is deliberately lossy; browser and Rust converters differ | `markdownFor`; Rust `markdown`/`plain_text` |
| R-17 | P2 | Platform support | Linux/macOS are unverified; iPadOS native/touch/file lifecycle is unfinished | build config/UI/dialog contracts |
| R-18 | P2 | UI accessibility/touch | Drag/drop, hover actions, narrow layout, and ARIA coverage are incomplete | `Outline`, `styles.css`, toolbar |
| R-19 | P2 | Test/release confidence | Focused component coverage exists, but no browser E2E/IPC/migration/a11y/CI/platform matrix; Rust does not consume the protocol fixtures | current test files/repository |
| R-21 | P2 | Tampered-data defense | Open validates structure but does not re-sanitize all stored HTML or validate snapshot hashes/content limits | `load_state`; `restore` |
| R-22 | P2 | Crash durability | Atomic output syncs the file, not explicitly its parent directory | `atomic_write`, `atomic_copy`, `replace_file` |
| R-23 | P3 | Reserved features | Attachments, AI, collaboration, contributor management, and direct node restore have no complete workflow | schema/types/interfaces with missing UI/adapters |
| R-24 | P3 | Outline behavior | New expansion state, drag placement/root drops, and affected-node reporting are limited | `Outline`; both operation models |
| R-25 | P2 | Writing flow | Separate outline and selected-node editor force master/detail context switching for ordinary writing and node insertion | `App` workspace composition; `Outline`; `NodeEditor` |
| R-26 | P2 | Historical inspection | Standalone View/Back is implemented in the current master/detail workspace, but continuous-canvas reuse and native queries remain incomplete | `workspaceProjection`; `HistoryPanel`; `HistoricalNodeView`; Tauri query capability |
| R-27 | P2 | Edit history/noise | Fixed 1.2-second quiet-period checkpoints and one new group ID per compatibility editor flush create indiscriminate revisions and noisy History; the WP-4 core is implemented but not wired | `RichTextEditor`; `BodyEditBatchCoordinator`; full snapshots |

## Data-integrity and attribution risks

### R-03: contributor fallback can misattribute work

The local contributor preference lives in browser `localStorage`. After opening a `.coedit` whose contributors do not contain that ID, `App` selects `view.contributors[0]`. The store correctly rejects unknown contributor IDs, but this fallback avoids rejection by impersonating an existing contributor.

**Impact:** a file moved to another computer/user can record edits under its first original contributor.

**Recommended direction:** add contributor registration/selection to the gateway and store; prompt rather than silently fall back; specify import/cross-device identity rules and tests.

### R-04: stored hashes are checksums, not verified provenance

Desktop contributions and snapshots receive a SHA-256 of serialized `DocumentState`; memory contributions receive a Web Crypto hash. WP-1 memory materialization now recomputes the browser canonical hash and rejects a mismatch before returning a detached snapshot. On open/restore, the store still checks SQLite integrity and tree structure but does not:

- recompute the current state hash and compare it with the current contribution/snapshot;
- verify each snapshot's `state_hash`;
- replay the contribution ledger;
- authenticate the ledger against malicious direct SQLite edits.

The browser now has a named `coedit-document-state-v1` canonical form and golden fixture. It projects only `DocumentState`, sorts entity collections by ID and object keys recursively, and excludes host-only `DocumentView` fields. Rust still hashes Serde's own `DocumentState` encoding/order and has not been run against the shared vector.

**Recommended direction:** adopt the existing versioned canonical fixture in Rust or deliberately version a different cross-language contract; verify snapshot/current hashes on open/restore; define replay/tamper guarantees honestly. Cryptographic authentication would require a trust/key model beyond plain hashes.

### R-06: host-exit draft/lifecycle boundaries remain

`useDocumentController` serializes document commands and rejects older/superseded view/history responses. `DraftTransitionCoordinator` synchronously freezes the registered document-title and node-editor participants and awaits title, metadata, and rich-text drains before controlled selection, operations, restore, export, backup, and Close. Failed commits retain their dirty value/delta for retry and cancel the controlled action. This closes the earlier in-app Close-before-debounce and blur-ordering mechanisms.

Residual limitations remain:

- tab close/reload, process termination, forced native suspension, and arbitrary React teardown cannot await a Promise;
- `RichTextEditor` cleanup intentionally does not launch a late unawaitable commit, so pending standalone state is lost if the host bypasses controller actions;
- controller tests cover freeze/flush ordering, failure blocking, Close/selection, and restore generation, but a full Tiptap DOM/native lifecycle test is absent.

**Recommended direction:** define discard/retry behavior for actual application-exit and suspension hooks in each host and add controlled-timer editor/component/native lifecycle tests.

### R-08: Yjs payload consistency is trusted

`updateBody` carries sanitized rendered `bodyHtml`, a merged incremental `yjsUpdate`, and a complete `yjsState`. Rust checks size/Base64 validity and stores the complete state, but it does not apply the update to the prior state or prove that the HTML and state represent the same content. The incremental update remains only in the contribution payload.

**Recommended direction:** decide which representation is authoritative; reconstruct/validate state transitions at the persistence boundary; derive sanitized HTML from the accepted editor state where practical; test malformed/mismatched updates.

## Persistence, recovery, and compatibility risks

### R-05: there are no migrations

`PRAGMA user_version` and metadata `format_version` are validated, but no code upgrades an older schema. A higher version is opened read-only only if current tables/columns are still readable. A lower version would be opened writable if current queries happen to succeed.

**Rule for contributors:** do not alter a persisted field, enum constraint, or table shape without a version increment, transactional migration design, fixtures, rollback/recovery rules, and compatibility tests. See [Document format](./DOCUMENT_FORMAT.md).

### R-07: recovery JSON has desktop bounds and no importer

- Standalone export now uses the explicitly marked `coedit-recovery` `RecoveryExport` version 2 with algorithm/state hash, an explicit portable `DocumentState`, history order/completeness metadata, and every newest-first contribution accumulated during the current in-memory session.
- The standalone envelope deliberately excludes internal revision snapshots; it preserves the ledger but cannot currently be opened by Coedit.
- Desktop export still uses an older version-1 envelope without `hashAlgorithm`, `stateHash`, or `history`, and `DocumentStore::contributions` never reads more than the newest 100,000 records.
- Neither host provides JSON validation/import/reconstruction UI.

Documentation and UI must not call either format a tested round trip. For desktop recovery, preserve the `.coedit`/backup as the primary lossless artifact.

### R-09: standalone and desktop are not behavioral equivalents

| Concern | Standalone | Desktop |
|---|---|---|
| Durability | page memory | SQLite file |
| Input limits | no gateway/domain limits | Rust byte limits |
| Sanitization | editor DOMPurify path | editor plus Rust Ammonia on writes |
| Sessions | contribution IDs only; state array stays empty | session row inserted lazily |
| Hash input/algorithm | Versioned canonical `DocumentState` + TS golden vector | Rust serialized `DocumentState`; fixture parity pending |
| Native open/backup | capability absent | SQLite open/byte-copy capability |
| JSON | marked `coedit-recovery` version-2 envelope, state hash, explicit complete runtime ledger | legacy version-1 envelope + bounded ledger |
| Markdown conversion | browser DOM text | Rust tag stripping/entity replacements |

The shared gateway/page shapes are structural contracts, not proven semantic equivalence; recovery JSON schemas still differ. Shared adapter-contract and Rust protocol-fixture tests do not yet exist.

### R-10: backup extension cannot be selected by Open

Backup saves `title.coedit-backup`. The Open dialog accepts only extension `coedit`, though `DocumentStore::open` itself identifies a file by SQLite application ID rather than requiring its extension.

**Current workaround:** copy or rename a backup to a new `.coedit` path before opening it; preserve the original backup.

**Recommended direction:** include backup files in the dialog, make recovery intent explicit, and test read/recovery behavior.

### R-11: desktop history still has a hidden pre-window

The shared contract now returns `ContributionPage`, filters before page construction, and uses an exclusive revision cursor. The UI loads 100 at a time, exposes **Load older contributions**, displays a loaded count with `+` while more is reachable, and issues search/node filters to the adapter rather than filtering a fixed client slice. Memory history is fully reachable within the page lifetime.

Rust still selects at most the newest 100,000 rows before applying `beforeRevision`, contributor, node, and search filters. The Tauri adapter can page only within that pre-window, so older matches remain unreachable.

**Recommended direction:** move cursor and scalar filters into indexed SQL, define an affected-node indexing strategy instead of JSON scanning, and add 100,001+ desktop cases in the second pass.

### R-12: snapshot growth is unbounded

Every revision stores a full JSON `DocumentState`, including Base64 Yjs states, in addition to materialized node data and operation payloads. Long writing sessions can create a snapshot after each 1.2-second typing group.

**Recommended direction:** measure real files first, then define retention/checkpoint/replay/compaction that preserves recovery and verifiability. Never delete historical material without a format/backup policy. The proposed [body checkpoint strategy](./proposals/BODY_CHECKPOINT_STRATEGY.md) improves semantic boundaries and collapsed presentation but can still create frequent physical revisions at the character threshold; it does not by itself solve snapshot growth.

### R-21: open/restore validation is incomplete for hostile database edits

Open checks application ID, version agreement, SQLite integrity, magic metadata, enum/JSON decoding, parents, and cycles. It does not validate recorded hashes, apply the normal write limits to every loaded field, or re-sanitize all stored `body_html`. Restore re-sanitizes HTML but does not reapply every normal body/metadata limit to a tampered snapshot.

The React fallback path sanitizes `bodyHtml` when there is no Yjs state, and ProseMirror does not simply execute stored HTML as application JavaScript, but this does not replace a complete hostile-format validation policy.

### R-22: atomic replacement is not maximum crash durability

Exports/backups write/copy a temporary sibling, call `sync_all` on that file, and rename. The helpers do not explicitly fsync the parent directory after rename. Destination replacement temporarily renames the previous file and attempts recovery on failure.

This is materially safer than direct overwrite but is not a formal guarantee against every power-loss/filesystem behavior. Add platform-specific fault testing before strengthening recovery claims.

## Product and UX limitations

### R-13: standalone documents are deliberately volatile

There is no IndexedDB/local filesystem persistence, autosave, JSON import, or `.coedit` parser in the standalone composition. `localStorage` contains only a non-secret contributor preference. The warning on the welcome screen is the current safeguard.

### R-14: one document and one process-level store

Tauri `AppState` holds `Mutex<Option<DocumentStore>>`. A second open/create replaces the previous store; the current UI avoids that route by exposing a single-document workspace. Multiple windows would share this state. External simultaneous processes are not coordinated as a supported editing workflow.

### R-15: writing sessions are incomplete

The application generates one session ID per mounted `App`. Desktop mutation lazily creates a row and contributions refer to it, but sessions are never ended or described. Memory contributions carry the ID while `DocumentView.sessions` stays empty. `contributions.session_id` has no SQLite foreign key.

### R-16: Markdown is interchange, not rich recovery

Both Markdown exporters walk active nodes and emit the heading structure followed by each node body as plain text, losing most formatting and semantic details. Browser DOM text extraction and Rust's small tag/entity converter can produce different results. Deleted nodes, Yjs state, contributions, and attachments are absent.

### R-17: platform support is not yet evidenced broadly

Windows standalone was manually exercised. The architecture is intended for Linux/macOS desktop, but no CI/package evidence is recorded. iPadOS needs mobile document-provider/path handling, lifecycle flush, touch hierarchy controls, compact navigation, and packaging. See [Build and portability](./BUILD_AND_PORTABILITY.md).

### R-18 and R-24: interaction/accessibility limitations

- Dragging only makes a node the last child of another node; there is no root drop target or between-row indicator.
- Reordering has buttons, but drag itself has no complete keyboard/touch equivalent for reparenting.
- Row actions appear on hover or selection, a weak pattern for touch discovery.
- Outline expansion state initializes from mount-time nodes and is not explicitly synchronized for every newly added node.
- At widths at or below 900 px, History becomes an overlay but the 230 px outline remains; no phone/pane-switching design exists.
- Toolbar toggles do not expose full `aria-pressed` state; some symbol-only controls rely on `title`; no screen-reader audit exists.
- Affected-node lists generally name only the requested node, not every descendant/sibling whose stored state changed.

Current interaction details and proposed accessibility acceptance criteria are in [UI and UX](./UI_UX.md).

### R-25: master/detail interrupts the writing flow

The workspace renders a separate hierarchy navigator and only one selected node's editor. Creating or developing adjacent nodes repeatedly moves attention between structural controls and a detail pane, so hierarchy does not read or edit as one continuous document.

**Recommended direction:** implement the proposed [continuous block-outline](./proposals/CONTINUOUS_BLOCK_OUTLINE.md): a flattened pre-order projection, separate canvas-context/focus-region/editor-owner state, one active Tiptap editor, drain-before-hide collapse behavior, sanitized inactive previews, inline structural controls, and complete keyboard/touch alternatives. Large-document orientation may use the proposed optional navigation-only tree sidebar, docked when space permits and presented as an explicitly opened drawer on compact/touch screens. It must share the canvas's live/historical projection while keeping browsing/expansion state independent; it is not a selectable revival of the current tree-plus-detail editor. This is a component/application redesign, not a CSS-only change.

### R-26: historical inspection remains partial by host and workspace layout

The WP-1 boundary defines a discriminated read-only query capability. Memory advertises it as available and returns detached, tree-validated, hash-verified snapshots without changing live state, history, or its snapshot map. Tauri explicitly advertises `host-deferred` and exposes no throwing stub. WP-2 adds explicit controller live/historical projections, exact retained origins, stale request guards, no-query Back, restore separation, and command/export rejection outside live mode.

WP-3 connects capable-host History **View** to a static sanitized historical detail that mounts no title/body editor or draft participant. A persistent banner identifies viewed/current revisions, makes **Back to current** primary, and keeps **Restore as new revision** separately confirmed. Component and full-`App` integration tests prove View/Back is non-mutating and one confirmed restore appends one compensating revision. Host-deferred Tauri still exposes row-level Restore until WP-10.

**Recommended direction:** reuse the implemented historical projection in the continuous `DocumentCanvas` during WP-7, including canvas/navigator context pruning and focus restoration, then add native materialization and shared contract qualification in WP-10.

### R-27: body checkpoints are temporally arbitrary and visually noisy

Every Yjs update currently resets a 1.2-second timer. Expiry emits a body operation, and the compatibility editor assigns a new group ID to every flush while the controller preserves that supplied ID. Short pauses therefore remain unrelated History rows even when they form one editing episode, while every resulting revision also receives a full snapshot. WP-4 has implemented the validated policy, transaction classifier, edit-group state machine, immutable two-checkpoint FIFO/retry/backpressure, and caller-owned group-ID contract; Tiptap/Yjs capture and canvas ownership wiring remain intentionally deferred.

**Recommended direction:** complete the [body checkpoint and commit strategy](./proposals/BODY_CHECKPOINT_STRATEGY.md) by wiring the implemented core into the final canvas editor boundary, then add page-aware exact group expansion. The core already supplies semantic edit-mode/focus boundaries, threshold checkpoints that reuse a group ID, a two-checkpoint backpressure bound, and one injectable policy containing `batchCharacterThreshold` and `idleTimeoutMs`. Physical snapshot compaction remains separate R-12 work.

## Reserved capabilities, not current features

- `attachments` is a reserved SQLite table with no TypeScript domain type, operation, gateway method, command, exporter, or UI.
- `AiProvider` and proposal types are contracts only; no provider or AI user flow exists.
- Yjs is used locally; no collaboration transport, authentication, shared structural model, or conflict protocol exists.
- Contributor/session tables do not constitute contributor management.
- `restoreNode` exists in both mutation engines, but no current UI browses deleted nodes or invokes it.

Keep these labeled **Reserved** or **Proposed** in contributor-facing material.

## Verification and delivery gaps

The current source inventory is fifty-eight TypeScript cases and three Rust cases. New TypeScript coverage includes the draft coordinator, controller transition ordering/generation, live/historical projection and request races, historical command guards, full-App View/Back/restore composition, static historical sanitization, banner/History actions, serialized-queue behavior, contributor-storage validation, node-editor normalization, tag normalization/combobox behavior, JSON detachment/validation, cursor paging/filtering, recovery-envelope shape, verified memory revision materialization, explicit host-deferred Tauri capability advertisement, filename normalization, and versioned hash/sanitizer fixtures. There is still no:

- full-App integration with the real Tiptap editor or end-to-end browser suite;
- fake-timer editor debounce/lifecycle suite;
- shared gateway contract suite;
- TypeScript/Rust IPC schema compatibility suite;
- Rust conformance test for the TypeScript hash or sanitizer fixtures;
- migration/format fixture suite;
- corruption/fault-injection/atomic-output suite;
- accessibility/touch automation;
- CI workflow or multi-platform build/package matrix;
- performance/load test for snapshots/history/large Yjs states.

The prioritized target matrix and manual suites are in [Testing](./TESTING.md).

## Risk closure rule

When fixing a risk:

1. add a regression test that fails for the documented mechanism;
2. update the relevant use case, sequence, and design contract;
3. verify both standalone and desktop behavior when the boundary is shared;
4. record any format/security/portability consequence;
5. remove or rewrite this entry only after the implementation and verification are present.

Do not close a risk merely because the UI hides the path or because a manual happy-path test passed once.
