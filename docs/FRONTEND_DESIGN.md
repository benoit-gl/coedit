# Frontend design

This is the as-built guide to the React/TypeScript application. Proposed behavior is kept in `docs/proposals`; this document describes reachable code.

## Composition roots

| Host | Entry | Gateway | Native dialogs |
|---|---|---|---|
| Standalone/browser | `src/main.tsx` | `MemoryDocumentGateway` | no |
| Tauri desktop | `src/main-tauri.tsx` | `TauriDocumentGateway` | `tauriFileDialogs` |

Both mount the same `App`. The shared UI performs no runtime Tauri detection.

## Application ownership

`useDocumentController` owns cross-component use-case state: live/historical workspace projection, current view, canvas context/editor owner, mutation serialization, draft transitions, revision loading, raw History paging/filter state, contributor/session context, status/error state, and authoritative editor generation after restores.

`App` is the composition/presentation boundary. It owns welcome/profile state, renders the current projection, maps user intent to controller calls, and supplies host capabilities to History.

## Continuous document surface

`DocumentCanvas` is the sole live/historical document surface. The old master/detail outline/editor composition is retired.

`projectVisibleNodes` derives the current visible pre-order from the persisted flat tree. `DocumentCanvas` owns controlled disclosure/context and maps structural actions to controller callbacks. `NodeBlock` renders one visible node.

Live blocks provide inline title/tags, structural actions, sanitized body previews, and an **Edit body** affordance. Exactly one block may own `RichTextEditor`. Historical blocks share the same canvas layout but expose only read-only content and local disclosure.

`NodeMetadataFields` and `RichTextEditor` register draft participants. Any operation that may change editor ownership or externalize/replace the workspace must freeze and drain registered drafts first.

## Rich-text editing

`RichTextEditor` uses Tiptap/Yjs locally. Persistence is not a per-keystroke debounce. Transaction/input facts are classified and sent to `BodyEditBatchCoordinator`, which owns semantic edit groups, threshold/idle boundaries, synchronous sanitized HTML/Yjs capture, bounded FIFO delivery, failure retry, and transition draining.

The default checkpoint policy lives in one dedicated policy module and is injectable for tests. Checkpoints inside one semantic episode share one `groupId`; a semantic boundary closes that group.

## History presentation

`HistoryPanel` receives raw newest-first contributions from the controller and projects them through `src/application/historyProjection.ts`.

Projection rules:

- only contiguous `updateBody` contributions with the same non-null `groupId` collapse;
- non-body rows and different/null groups remain separate and break contiguity;
- the newest/final checkpoint is the collapsed row's canonical View target;
- loaded raw contribution count and visible History-row count are distinct;
- groups merge automatically when ordinary raw pages are appended;
- an oldest group that may continue into unloaded history is marked partial and reports `at least N` checkpoints.

Expanding a complete loaded group reveals its exact physical checkpoints. Expanding a partial group uses the injected `ContributionGroupQueryCapability` when available. Standalone fetches the complete group; Tauri reports that exact expansion is unavailable in the current host and shows only the loaded checkpoints.

The group expansion query intentionally ignores ordinary History text/node filters: expansion asks for the immutable physical members of one known `groupId`.

On a host with revision queries, collapsed groups View their canonical final checkpoint and expanded checkpoints can be viewed exactly. Tauri currently has no revision-query capability and retains row-level Restore until WP-10.

## Historical workspace

`WorkspaceProjection` explicitly distinguishes `live` and `historical`; read-only behavior is not just a UI flag. Entering historical mode drains pending live drafts, performs a non-mutating materialization query, retains the exact live origin, and renders the detached state through `DocumentCanvas` with no editor owner. Back restores the retained live projection without a gateway mutation. Restore creates a new compensating live revision.

## Source map

| Concern | Primary files |
|---|---|
| Composition | `src/main.tsx`, `src/main-tauri.tsx`, `src/App.tsx` |
| Use cases and History paging | `src/application/useDocumentController.ts` |
| Live/historical projection | `src/application/workspaceProjection.ts` |
| Draft barrier | `src/application/draftTransition.ts` |
| Serialized commands | `src/application/serializedTaskQueue.ts` |
| Grouped History projection | `src/application/historyProjection.ts` |
| Continuous canvas | `src/components/DocumentCanvas.tsx`, `NodeBlock.tsx` |
| Metadata/tags | `NodeMetadataFields.tsx`, `TagEditor.tsx`, `src/domain/tags.ts` |
| History UI | `src/components/HistoryPanel.tsx` |
| Historical banner | `src/components/HistoricalWorkspaceBanner.tsx` |
| Rich text/checkpoints | `src/editor/RichTextEditor.tsx`, `BodyEditBatchCoordinator.ts`, `bodyCheckpointPolicy.ts`, transaction helpers |
| Browser sanitizer/Yjs encoding | `src/editor/sanitizeRichText.ts`, `yjsEncoding.ts` |
| Domain/tree/projection | `src/domain/types.ts`, `tree.ts`, `visibleNodes.ts` |
| Persistence ports/adapters | `src/persistence/*` |

## State boundaries

Persisted document state contains authored document data, contributors/sessions, revision metadata, and node data. It does **not** contain History search text, loaded pages, collapsed/expanded group UI state, canvas disclosure/context, future navigator state, current focus, editor ownership, or dialog state.

`groupId` is persisted contribution metadata because it describes authorship/checkpoint semantics; whether those physical rows are collapsed is presentation state.

## Remaining frontend work

The major staged frontend work is the optional navigation-only sidebar and broader browser/accessibility qualification. The navigator must remain an auxiliary projection of the same live/historical workspace and must never reintroduce a second editing surface.

Native revision materialization and exact contribution-group queries are persistence/host parity work, not a reason to fork the shared History UI.
