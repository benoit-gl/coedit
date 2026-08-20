# Software architecture description

This document describes the current Coedit Local architecture. Detailed UI and persistence ownership lives in [Frontend design](./FRONTEND_DESIGN.md) and [Persistence design](./PERSISTENCE_DESIGN.md); risks are in [Known limitations](./KNOWN_LIMITATIONS.md).

## Architectural scope

Coedit is a local-first hierarchical writing editor with one shared React/TypeScript application and two explicit hosts:

- **Standalone HTML** — self-contained `dist/index.html`, volatile `MemoryDocumentGateway`, no native file access.
- **Tauri desktop** — packaged WebView plus Rust/SQLite persistence and native file dialogs.

Production Coedit has no HTTP application server, telemetry, synchronization provider, or AI provider.

## Current logical architecture

```text
Presentation
  App
  DocumentCanvas
    NodeBlock
      NodeMetadataFields
      RichTextEditor (0 or 1 live owner)
  HistoryPanel
  HistoricalWorkspaceBanner

Application control
  useDocumentController
  WorkspaceProjection (live | historical)
  DraftTransitionCoordinator
  SerializedTaskQueue
  historyProjection

Ports
  DocumentGateway
  DocumentStorage (volatile | native-file)
  RevisionQueryCapability
  ContributionGroupQueryCapability
  DocumentFileDialogs

Adapters
  MemoryDocumentGateway
  TauriDocumentGateway
  tauriFileDialogs
  Rust DocumentStore -> SQLite
```

`App` and shared components do not import Tauri. Host behavior is injected from `main.tsx` or `main-tauri.tsx`.

## Continuous workspace

WP-6/WP-7 retired the former outline-plus-selected-editor master/detail composition. `DocumentCanvas` is now the sole live and historical document surface.

The persisted tree remains a flat collection of nodes with `parentId` and `position`. `projectVisibleNodes` derives a pre-order visible sequence with depth and expansion state without changing persisted structure. `NodeBlock` renders each row. Exactly one live block may own `RichTextEditor`; inactive bodies are sanitized previews. Historical blocks are read-only and never mount metadata inputs, Tiptap/Yjs editors, or structural mutation controls.

Any action that may transfer, hide, remove, restore, export, or close the active editor goes through the controller's draft-transition barrier. Participants freeze synchronously, flush/await their pending work, and cancel the requested transition if persistence fails.

## Rich-text checkpoint architecture

`RichTextEditor` observes ProseMirror/Tiptap transactions before application and feeds normalized facts to `BodyEditBatchCoordinator`. The coordinator owns:

- semantic edit-group identity;
- configurable character-threshold and idle boundaries;
- synchronous HTML/Yjs checkpoint capture;
- ordered bounded persistence;
- visible failure/backpressure;
- freeze/flush/unfreeze integration with controlled transitions.

Threshold checkpoints in one uninterrupted edit episode share one `groupId`. Physical checkpoints remain immutable contributions and snapshots.

## History architecture

History has two layers:

1. **Raw ledger paging** — `ContributionHistory.listContributions` returns newest-first cursor pages with adapter-side filters.
2. **Presentation projection** — `historyProjection.ts` collapses only contiguous `updateBody` contributions sharing a non-null `groupId` into one semantic History row.

The projection is recomputed over all currently loaded raw pages, so a group split by an ordinary History page boundary merges once the next page is loaded. If the oldest loaded group may continue into unloaded history, the row is marked partial and reports `at least N` checkpoints.

WP-5 adds `ContributionGroupQueryCapability` for exact expansion. Standalone implements an exact cursor-paged query over the complete in-memory ledger and ignores ordinary History search filters when explicitly expanding a group. Tauri advertises the capability as host-deferred until WP-10; the UI states that limitation rather than claiming a partial expansion is complete.

On hosts with `RevisionQueryCapability`, History uses non-mutating **View** and the shared historical canvas. Tauri still lacks native revision materialization and therefore retains the temporary row-level Restore fallback.

## Persistence architecture

`DocumentGateway` composes command/history behavior with host capabilities. A successful mutation returns a complete replacement `DocumentView`.

Standalone stores the current view, raw contributions, and revision snapshots in memory. Desktop delegates through Tauri IPC to `DocumentStore`, which owns one SQLite connection and commits materialized state, contribution, hash, and full snapshot in one transaction.

WP-5 changes no persisted shape. `Contribution.groupId` and SQLite `contributions.group_id` already existed.

## Concurrency and stale-response rules

Document commands are serialized. History and revision queries may run outside the mutation queue, so the controller uses workspace/request epochs and revision checks to reject stale responses. Historical loading retains its exact origin projection. Back/close/newer requests invalidate older responses.

## Current staged boundary

Implemented: WP-1 through WP-7, including WP-5 grouped History.

Remaining:

- **WP-7A** optional navigation-only hierarchy view;
- **WP-8** browser/focus/accessibility qualification;
- **WP-9** standalone artifact qualification;
- **WP-10** Tauri/native revision and exact-group queries plus broader adapter parity/hardening.

Other important hardening remains outside those UX packages: contributor identity portability, migrations, hash/sanitizer parity, recovery import, native path authorization, snapshot growth, CI/platform evidence, and host-exit draft durability.

## Architectural rules

1. Keep shared UI free of host detection and Tauri imports.
2. Keep document mutations behind typed `DocumentOperation` plus contribution context.
3. Historical viewing is a query; restoration is a compensating mutation.
4. Presentation grouping never rewrites or deletes physical contribution records.
5. Keep transient canvas/history/navigator state out of `DocumentState`, hashes, snapshots, and exports.
6. Treat rich text and persisted snapshots as untrusted input.
7. Do not claim host parity merely because TypeScript interfaces compile.
