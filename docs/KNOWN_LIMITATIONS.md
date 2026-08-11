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
| R-01 | P0 | Editor lifecycle | Close can discard a pending debounced rich-text commit | `App.close`; `RichTextEditor` cleanup `flush` |
| R-02 | P0 | Restore/editor | Restoring the selected node can leave a stale `Y.Doc` that later overwrites restored text | `RichTextEditor` memo depends only on `node.id` |
| R-03 | P0 | Attribution | Opening another author's file can silently attribute new work to its first contributor | `App` `contributor` fallback; no registration API |
| R-04 | P1 | Integrity | Contribution/snapshot hashes are stored but never verified or replayed | `DocumentStore::open`/`restore`; both gateways |
| R-05 | P1 | Compatibility | Format/version fields exist, but there is no migration machinery | `FORMAT_VERSION`; `DocumentStore::open` |
| R-06 | P1 | Draft lifecycle | Blur metadata commits, Close, selection changes, and async full-view responses can race | `App`, `NodeEditor`, global `busy` behavior |
| R-07 | P1 | Recovery export | Desktop JSON silently caps history at 100,000; standalone “JSON recovery” omits its ledger | both gateway export implementations |
| R-08 | P1 | CRDT integrity | Desktop decodes but does not reconcile/verify incremental Yjs update, full state, and HTML | `DocumentStore::apply_sql(UpdateContent)` |
| R-09 | P1 | Adapter parity | Browser/Rust hash, sanitization, limits, sessions, backup, and JSON semantics differ | memory gateway versus Rust store |
| R-10 | P1 | Backup UX | `.coedit-backup` is produced, but Open filters only `.coedit` | `tauriFiles.ts` filters |
| R-11 | P2 | History | UI loads only 500 contributions; backend only considers newest 100,000 before filtering | `App.refreshHistory`; `DocumentStore::contributions` |
| R-12 | P2 | Storage growth | Every revision stores a complete JSON snapshot | `insert_snapshot` on create/apply/restore |
| R-13 | P2 | Standalone durability | Page close/reload loses the document; no import or durable browser store exists | `MemoryDocumentGateway` |
| R-14 | P2 | Multi-document/concurrency | One process-global store/mutex supports one open document and serialized commands | `AppState` in `lib.rs` |
| R-15 | P2 | Session model | Sessions are partial: memory has none; desktop starts lazily and never ends them | both gateways/schema |
| R-16 | P2 | Rich-text/export | Markdown conversion is deliberately lossy; browser and Rust converters differ | `markdownFor`; Rust `markdown`/`plain_text` |
| R-17 | P2 | Platform support | Linux/macOS are unverified; iPadOS native/touch/file lifecycle is unfinished | build config/UI/dialog contracts |
| R-18 | P2 | UI accessibility/touch | Drag/drop, hover actions, narrow layout, and ARIA coverage are incomplete | `Outline`, `styles.css`, toolbar |
| R-19 | P2 | Test/release confidence | No component/E2E/IPC/migration/a11y/CI/platform matrix; only eight automated cases | current test files/repository |
| R-20 | P2 | Error handling | History refresh rejects outside `App.run`, so normal error/status handling can be bypassed | `App.refreshHistory` call ordering |
| R-21 | P2 | Tampered-data defense | Open validates structure but does not re-sanitize all stored HTML or validate snapshot hashes/content limits | `load_state`; `restore` |
| R-22 | P2 | Crash durability | Atomic output syncs the file, not explicitly its parent directory | `atomic_write`, `atomic_copy`, `replace_file` |
| R-23 | P3 | Reserved features | Attachments, AI, collaboration, contributor management, and direct node restore have no complete workflow | schema/types/interfaces with missing UI/adapters |
| R-24 | P3 | Outline behavior | New expansion state, drag placement/root drops, and affected-node reporting are limited | `Outline`; both operation models |

## Data-integrity and attribution risks

### R-01: pending text can be lost on Close

**Current sequence:** `App.close()` awaits `documentGateway.closeDocument()`, then clears `view`. Clearing `view` unmounts `NodeEditor`/`RichTextEditor`. The editor cleanup then calls `flush()`, but the memory state or Rust `DocumentStore` is already gone.

**Impact:** text entered less than 1.2 seconds before Close can fail to create its `updateContent` contribution. The error occurs after the UI has transitioned toward the welcome screen and may not provide a useful recovery path.

**Current workaround:** pause until the UI reports saved before Close, node switches, browser closure, or application exit. This is not a reliable product guarantee.

**Recommended direction:** expose an awaitable editor/draft flush contract; block Close/navigation/application exit until it succeeds or the user explicitly discards; add fake-timer component/E2E tests.

### R-02: same-node revision restore can retain stale CRDT state

`RichTextEditor` constructs its `Y.Doc` with:

```text
useMemo(() => createYDoc(node.yjsState), [node.id])
```

A revision restore normally keeps the same node ID but supplies an older `yjsState`. The memoized document is therefore not recreated. The mounted editor can display/retain stale state and a later change can persist it over the restored revision.

**Current workaround:** after restore, select a different node and then return before editing. This is an informal mitigation, not a tested guarantee.

**Recommended direction:** make a restored/content generation part of editor identity or synchronize an external state replacement deliberately; protect unsaved local changes; add restore-while-selected integration tests.

### R-03: contributor fallback can misattribute work

The local contributor preference lives in browser `localStorage`. After opening a `.coedit` whose contributors do not contain that ID, `App` selects `view.contributors[0]`. The store correctly rejects unknown contributor IDs, but this fallback avoids rejection by impersonating an existing contributor.

**Impact:** a file moved to another computer/user can record edits under its first original contributor.

**Recommended direction:** add contributor registration/selection to the gateway and store; prompt rather than silently fall back; specify import/cross-device identity rules and tests.

### R-04: stored hashes are checksums, not verified provenance

Desktop contributions and snapshots receive a SHA-256 of serialized `DocumentState`; memory contributions receive a Web Crypto hash. On open, the store checks SQLite integrity and tree structure but does not:

- recompute the current state hash and compare it with the current contribution/snapshot;
- verify each snapshot's `state_hash`;
- replay the contribution ledger;
- authenticate the ledger against malicious direct SQLite edits.

Browser and Rust hash algorithms are not a shared formal specification. Browser canonicalization sorts keys/collections and is sometimes passed a runtime `DocumentView`, so host-only fields can enter the hash. Rust hashes serde's `DocumentState` encoding/order.

**Recommended direction:** specify one cross-language canonical byte representation; add golden vectors; verify snapshot/current hash on open/restore; define replay/tamper guarantees honestly. Cryptographic authentication would require a trust/key model beyond plain hashes.

### R-06: draft/command races are not serialized end to end

Node/document titles and summaries persist on blur. Clicking another control can cause a blur operation and another action concurrently. `busy` disables outline structural controls, but `NodeEditor` receives only `view.readOnly`, so typing/metadata work can continue while a request is active. Gateways return complete views; out-of-order completions could replace a newer UI state with an older response.

**Recommended direction:** introduce an explicit application command queue or revision-aware reducer, await draft commits during lifecycle transitions, and pass precise busy/editability state. Add rapid blur/select/restore/close tests.

### R-08: Yjs payload consistency is trusted

`updateContent` carries sanitized rendered HTML, a merged incremental `yjsUpdate`, and a complete `yjsState`. Rust checks size/Base64 validity and stores the complete state, but it does not apply the update to the prior state or prove that the HTML and state represent the same content. The incremental update remains only in the contribution payload.

**Recommended direction:** decide which representation is authoritative; reconstruct/validate state transitions at the persistence boundary; derive sanitized HTML from the accepted editor state where practical; test malformed/mismatched updates.

## Persistence, recovery, and compatibility risks

### R-05: there are no migrations

`PRAGMA user_version` and metadata `format_version` are validated, but no code upgrades an older schema. A higher version is opened read-only only if current tables/columns are still readable. A lower version would be opened writable if current queries happen to succeed.

**Rule for contributors:** do not alter a persisted field, enum constraint, or table shape without a version increment, transactional migration design, fixtures, rollback/recovery rules, and compatibility tests. See [Document format](./DOCUMENT_FORMAT.md).

### R-07: recovery JSON has bounded or incomplete history

- Desktop export builds an envelope with state and contributions, but `DocumentStore::contributions` never reads more than the newest 100,000 records.
- Standalone JSON serializes only the current `DocumentView`, omitting `MemoryDocumentGateway.contributions` and revision snapshots even though the menu label says “JSON recovery file.”
- Neither JSON shape can be imported by the current application.

Documentation and UI must not call either format a complete unlimited round trip. For desktop recovery, preserve the `.coedit`/backup as the primary lossless artifact.

### R-09: standalone and desktop are not behavioral equivalents

| Concern | Standalone | Desktop |
|---|---|---|
| Durability | page memory | SQLite file |
| Input limits | no gateway/domain limits | Rust byte limits |
| Sanitization | editor DOMPurify path | editor plus Rust Ammonia on writes |
| Sessions | contribution IDs only; state array stays empty | session row inserted lazily |
| Hash input/algorithm | JS canonicalization, currently view leakage | Rust serialized `DocumentState` |
| Backup | method downloads current-view JSON, but UI hides it | SQLite byte copy |
| JSON | current view only | envelope plus bounded ledger |
| Markdown conversion | browser DOM text | Rust tag stripping/entity replacements |

The shared gateway is a structural contract, not a proven semantic contract. Shared adapter-contract tests do not yet exist.

### R-10: backup extension cannot be selected by Open

Backup saves `title.coedit-backup`. The Open dialog accepts only extension `coedit`, though `DocumentStore::open` itself identifies a file by SQLite application ID rather than requiring its extension.

**Current workaround:** copy or rename a backup to a new `.coedit` path before opening it; preserve the original backup.

**Recommended direction:** include backup files in the dialog, make recovery intent explicit, and test read/recovery behavior.

### R-11: history is windowed twice

The UI always fetches `limit: 500`, then searches/counts/filters that array. Rust first queries at most the newest 100,000 contributions and only afterward applies `ContributionQuery` filters. Older matching entries are unreachable.

**Recommended direction:** server/store-side indexed pagination with a stable cursor; make total versus loaded counts distinct; add queries/indexes appropriate to affected-node search instead of JSON scanning.

### R-12: snapshot growth is unbounded

Every revision stores a full JSON `DocumentState`, including Base64 Yjs states, in addition to materialized node data and operation payloads. Long writing sessions can create a snapshot after each 1.2-second typing group.

**Recommended direction:** measure real files first, then define retention/checkpoint/replay/compaction that preserves recovery and verifiability. Never delete historical material without a format/backup policy.

### R-21: open/restore validation is incomplete for hostile database edits

Open checks application ID, version agreement, SQLite integrity, magic metadata, enum/JSON decoding, parents, and cycles. It does not validate recorded hashes, apply the normal write limits to every loaded field, or re-sanitize all stored `content_html`. Restore re-sanitizes HTML but does not reapply every normal content/metadata limit to a tampered snapshot.

The React fallback path sanitizes `contentHtml` when there is no Yjs state, and ProseMirror does not simply execute stored HTML as application JavaScript, but this does not replace a complete hostile-format validation policy.

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

Both exporters walk active nodes and emit heading structure/summary. Developed text becomes plain text, losing most formatting and semantic details. Browser DOM text extraction and Rust's small tag/entity converter can produce different results. Deleted nodes, Yjs state, contributions, and attachments are absent.

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

### R-20: history refresh errors bypass the standard action wrapper

`App.run` catches the primary mutation, but callers perform `await refreshHistory()` after it. A history failure can reject outside the wrapper, leaving error/status handling inconsistent even when the mutation succeeded.

**Recommended direction:** make “mutation committed, history refresh failed” an explicit partial-success state; catch refresh separately and avoid representing a successful commit as lost.

## Reserved capabilities, not current features

- `attachments` is a reserved SQLite table with no TypeScript domain type, operation, gateway method, command, exporter, or UI.
- `AiProvider` and proposal types are contracts only; no provider or AI user flow exists.
- Yjs is used locally; no collaboration transport, authentication, shared structural model, or conflict protocol exists.
- Contributor/session tables do not constitute contributor management.
- `restoreNode` exists in both mutation engines, but no current UI browses deleted nodes or invokes it.

Keep these labeled **Reserved** or **Proposed** in contributor-facing material.

## Verification and delivery gaps

The current automated inventory is five TypeScript cases and three Rust cases. There is no:

- React component or end-to-end browser suite;
- fake-timer editor debounce/lifecycle suite;
- shared gateway contract suite;
- TypeScript/Rust IPC schema compatibility suite;
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
