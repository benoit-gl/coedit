# Known limitations and risk register

This is the current risk list for Coedit Local `0.1.0`. It records present limitations, not roadmap promises.

## Priority guide

- **P0** — credible document loss, corruption, or attribution-integrity risk.
- **P1** — material correctness, recovery, compatibility, or architectural risk.
- **P2** — scalability, usability, portability, or maintainability limitation.
- **P3** — reserved capability or polish gap.

## Current register

| ID | Priority | Area | Current limitation |
|---|---:|---|---|
| R-03 | P0 | Attribution | Opening another author's file can fall back to its first contributor and misattribute new work. |
| R-04 | P1 | Integrity | Standalone revision queries verify stored snapshot hashes; desktop open/restore still does not fully verify/replay the ledger. |
| R-05 | P1 | Compatibility | Format/version fields exist but there is no migration machinery. |
| R-06 | P1 | Draft lifecycle | Controlled transitions drain drafts; forced page/process exit or host suspension cannot await them. |
| R-07 | P1 | Recovery | Desktop JSON is capped/bounded and neither recovery JSON shape has an importer. |
| R-08 | P1 | CRDT integrity | Desktop stores HTML/Yjs update/state without proving they describe one consistent edit. |
| R-09 | P1 | Adapter parity | TypeScript and Rust hashing, sanitizer, limits, sessions and export semantics are not fully equivalent. |
| R-10 | P1 | Backup UX | `.coedit-backup` output is not directly selectable by the normal Open dialog. |
| R-11 | P2 | History scale | Desktop History still searches only inside a newest-100,000-row pre-window. |
| R-12 | P2 | Storage growth | Every physical revision/checkpoint stores a complete JSON snapshot. |
| R-13 | P2 | Standalone durability | Reload/close loses the in-memory document; no durable browser store or JSON import exists. |
| R-14 | P2 | Multi-document/concurrency | One process-global Rust store supports one open document and serialized access. |
| R-15 | P2 | Session model | Writing-session lifecycle is incomplete and inconsistent across hosts. |
| R-16 | P2 | Rich-text/export | Markdown is deliberately lossy and browser/Rust conversion differs. |
| R-17 | P2 | Platform support | Linux/macOS packages and iPad workflows are not qualified. |
| R-18 | P2 | Accessibility/touch | Canvas actions have keyboard paths but touch/browser/ARIA qualification is incomplete. |
| R-19 | P2 | Test/release confidence | No browser E2E, full native IPC/E2E, migration suite, accessibility suite, CI or platform matrix. |
| R-21 | P2 | Tampered data | Open/restore does not revalidate every stored field/hash/sanitization invariant against hostile database edits. |
| R-22 | P2 | Crash durability | Atomic output syncs file contents but does not explicitly fsync parent directories. |
| R-23 | P3 | Reserved features | Attachments, AI, collaboration, contributor management and direct node restore lack complete workflows. |
| R-24 | P3 | Canvas structure | Drag reparenting targets the target's last-child position only; no between-block/root drop indicator. |
| R-25 | P2 | History/provenance | Affected-node reporting generally names only the requested node, so node-filtered History can omit descendant/sibling changes made by the same operation. |
| R-26 | P2 | Historical parity | Standalone View/Back uses verified read-only materialization; native revision queries remain host-deferred. |
| R-27 | P2 | Group-query parity | Grouped History is implemented, but Tauri cannot yet fetch the exact remainder of a page-spanning group. |

## Resolved/changed risk: grouped History

The former R-27 statement that History did not collapse semantic body checkpoint groups is obsolete. WP-5 now collapses contiguous `updateBody` contributions sharing a non-null `groupId`, merges groups across ordinary raw-page boundaries, distinguishes raw counts from visible rows, and exposes exact standalone expansion.

The remaining risk is narrower: Tauri advertises exact group querying as host-deferred. When the oldest loaded group is partial, native History can only show the loaded checkpoints and explicitly says full expansion is unavailable. WP-10 should implement and qualify native exact-group and revision queries.

Grouping is presentation only. It does not reduce the number or size of physical snapshots, so R-12 remains.

## High-priority details

### R-03 — contributor fallback can misattribute work

The local contributor preference is browser-local. If its ID is absent from an opened document, the UI can fall back to the document's first contributor. The persistence layer rejects unknown IDs, but this fallback bypasses that protection by selecting an existing identity.

**Direction:** add contributor registration/selection/reconciliation and never silently impersonate an existing contributor.

### R-04 — hashes are incomplete integrity evidence

Standalone materialization recomputes a canonical browser state hash before returning a historical snapshot. Desktop open/restore does not yet verify the full contribution/snapshot ledger, and hashes are not authenticated signatures.

**Direction:** define cross-language hash semantics, consume shared fixtures in Rust, verify state/snapshots on open/restore, and document exactly what integrity guarantee remains.

### R-05 — no migrations

Do not change persisted schema/field constraints without a format-version and migration design. A fresh-database success is not migration evidence.

### R-06 — host exit cannot await JavaScript drains

In-app selection, structure changes, historical entry, restore, export, backup and Close use the draft barrier. Browser reload, process termination and forced host suspension remain outside that awaitable protocol.

### R-08 — HTML/Yjs relationship is trusted

`updateBody` carries sanitized HTML, incremental Yjs update and complete Yjs state. Rust validates size/encoding and sanitizes HTML but does not reconstruct the prior Yjs state or prove equivalence.

## History and storage limitations

### R-11 — desktop raw-history pre-window

The shared contract is cursor-paged and filter-before-page, but Rust still materializes at most the newest 100,000 rows before some filtering/paging work. Very old matches may therefore be unreachable on desktop.

### R-12 — full snapshot per physical checkpoint

Semantic grouping improves human readability but every checkpoint remains an immutable contribution plus full snapshot. Measure real file growth before designing compaction/replay/retention.

### R-25 — affected-node provenance is incomplete

Both `src/domain/tree.ts::affectedNodeIds` and Rust `DocumentOperation::affected_node_ids` generally report only the requested node (with creation naming the new node and document rename naming none). Several operations materially change more state than that list describes: subtree deletion changes descendants, restore can reactivate ancestors, and create/move/delete normalization can change sibling positions.

Because the selected-node History filter relies on `affectedNodeIds`, filtering for one of those indirectly changed descendants/siblings can omit the contribution that changed it. The same under-reporting weakens provenance for future attribution/replay tooling.

**Direction:** either report every node whose persisted state materially changes, with equivalent TypeScript/Rust semantics and tests, or deliberately define a narrower "operation target" contract and stop presenting the field/filter as complete affected-node provenance.

### R-26/R-27 — native query parity

Standalone supports both non-mutating revision materialization and exact contribution-group expansion. Tauri currently supports neither query capability. The shared UI is deliberately honest about this: row-level Restore remains the historical fallback, and partial grouped History says full expansion is unavailable.

## Product/UX limitations

- standalone is volatile and has no import workflow;
- only one document is open per process;
- direct deleted-node restore has no UI;
- History overlay behavior is implemented, but the optional Navigator/History compact drawer shell is not;
- touch discoverability and screen-reader/browser qualification are incomplete;
- native package/platform evidence is sparse;
- backup reopen requires copying/renaming to `.coedit` today.

## Release rule

Before describing Coedit as suitable for important work, address the P0 attribution problem and materially improve P1 integrity/recovery/parity evidence. WP-5 improves History usability; it does not change those safety priorities.
