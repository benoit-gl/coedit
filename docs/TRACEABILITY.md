# Feature traceability and code map

This document answers “where is current behavior implemented?” Status terms are defined in [`docs/README.md`](./README.md).

## Current feature map

| Concern | Primary implementation | Evidence/status |
|---|---|---|
| Standalone composition | `src/main.tsx`, `vite.config.ts`, `MemoryDocumentGateway` | Implemented; volatile by design |
| Tauri composition | `src/main-tauri.tsx`, `TauriDocumentGateway`, `tauriFileDialogs` | Implemented host shell; parity gaps remain |
| Application orchestration | `src/application/useDocumentController.ts` | Implemented |
| Command serialization | `src/application/serializedTaskQueue.ts` | Implemented/tested |
| Draft transition barrier | `src/application/draftTransition.ts` | Implemented/tested |
| Live/historical workspace model | `src/application/workspaceProjection.ts` | Implemented WP-2 |
| Continuous document surface | `src/components/DocumentCanvas.tsx`, `NodeBlock.tsx` | Implemented WP-6/WP-7; master/detail retired |
| Inline title/tags | `NodeMetadataFields.tsx`, `TagEditor.tsx` | Implemented |
| Rich-text checkpointing | `RichTextEditor.tsx`, `BodyEditBatchCoordinator.ts`, checkpoint policy/transaction helpers | Implemented WP-4 + WP-7 integration |
| Grouped History projection | `src/application/historyProjection.ts`, `HistoryPanel.tsx` | Implemented WP-5 |
| Raw History paging | controller + `DocumentGateway.listContributions` | Implemented; desktop 100k pre-window remains |
| Exact contribution-group query | `gateway.ts`, `MemoryDocumentGateway` | Standalone implemented WP-5; Tauri host-deferred |
| Revision materialization | `RevisionQueryCapability`, `MemoryDocumentGateway.materializeRevision` | Standalone implemented WP-1; Tauri host-deferred |
| Historical canvas | `HistoricalWorkspaceBanner.tsx`, `DocumentCanvas.tsx`, controller | Standalone reachable WP-3/WP-7 |
| Restore | controller + both gateways/Rust store | Implemented compensating mutation |
| `.coedit` persistence | Rust `DocumentStore` / SQLite | Implemented format v1; hardening gaps remain |
| Export/backup | storage capabilities + Rust/browser adapters | Implemented with documented recovery limits |
| Optional navigator | proposal only | WP-7A proposed |
| Browser/a11y qualification | test/manual work | WP-8 proposed |
| Standalone qualification | artifact/manual work | WP-9 proposed |
| Native revision/group query parity | Tauri/Rust | WP-10 proposed |

## WP-5 traceability

| Requirement | Implementation | Focused automated evidence |
|---|---|---|
| Collapse contiguous body checkpoints with same non-null group | `src/application/historyProjection.ts` | `historyProjection.test.ts` |
| Do not group non-body/null/different groups | same | `historyProjection.test.ts` |
| Reproject accumulated pages across raw page boundaries | controller raw accumulation + `projectHistory` | projection tests |
| Mark potentially incomplete oldest group | `projectHistory(..., hasMore)` | projection tests |
| Keep raw loaded count distinct from visible rows | `HistoryProjection` + `HistoryPanel` | component/projection tests |
| Expand exact checkpoints | `HistoryPanel` | `HistoryPanel.test.tsx` |
| Fetch complete page-spanning group in standalone | `ContributionGroupQueryCapability`, `MemoryDocumentGateway` | `memoryGateway.groupHistory.test.ts` |
| Ignore ordinary filters during explicit group expansion | memory exact group query | memory group-query tests |
| Admit native gap honestly | `TauriDocumentGateway.contributionGroupQueryCapability` | adapter/type boundary; UI host message |
| Preserve exact revision actions | History group/canonical checkpoint rendering | `HistoryPanel.test.tsx` |

## Use-case status

| Use case | Status |
|---|---|
| Create document | Implemented |
| Open `.coedit` | Desktop implemented; identity/migration caveats |
| Organize hierarchy | Implemented through continuous canvas |
| Edit metadata | Implemented |
| Edit body | Implemented with host-exit/parity limitations |
| Inspect/filter History | Implemented with grouped History; desktop long-history/query limitations |
| View historical revision | Standalone implemented; native host-deferred |
| Restore revision | Implemented |
| Export/backup | Implemented with fidelity/recovery limitations |
| Close | Implemented for controlled in-app close; forced host exit remains limited |

## Important persistence/code boundaries

| Boundary | Source |
|---|---|
| Shared domain/wire types | `src/domain/types.ts` |
| Tree invariants/mutations | `src/domain/tree.ts` |
| Visible-node projection | `src/domain/visibleNodes.ts` |
| Hash/canonical JSON | `src/domain/hash.ts`, `json.ts` |
| Persistence contracts | `src/persistence/gateway.ts` |
| Standalone adapter | `src/persistence/memoryGateway.ts` |
| Tauri adapter | `src/persistence/tauriGateway.ts` |
| Native dialogs | `src/persistence/tauriFiles.ts` |
| Rust IPC | `src-tauri/src/lib.rs` |
| Rust data/store | `src-tauri/src/models.rs`, `store.rs` |
| Format/recovery contract | `docs/DOCUMENT_FORMAT.md` |
| Security boundary | `docs/SECURITY.md` |

## Remaining continuous-workspace package

WP-1 through WP-7 are implemented, including WP-5. Remaining proposal work is WP-7A, WP-8, WP-9, and WP-10. Do not describe grouped History or the continuous canvas as proposed/future behavior.
