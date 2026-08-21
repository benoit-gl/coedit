# Feature traceability and code map

This document answers “where is current behavior implemented?” and “what automated evidence protects the current use-case contract?” Status terms are defined in [`docs/README.md`](./README.md).

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

## Use-case → implementation → evidence

This compact matrix is the stable bridge from the normative contracts in `RUP_VISION_AND_USE_CASES.md` to implementation and automated evidence. It is intentionally not an exhaustive action/symbol inventory.

| Use case | Primary implementation path | Focused automated evidence | Current status / caveat |
|---|---|---|---|
| UC-01 Create document | `App`/controller → `DocumentGateway.createDocument` → memory or Rust store | `src/App.test.tsx`; `src/persistence/memoryGateway.test.ts`; Rust `store.rs` tests | Both hosts implemented; standalone volatile |
| UC-02 Open portable document | Tauri file dialog/gateway → Rust IPC → `DocumentStore` open/validation | `src/persistence/tauriGateway.test.ts`; Rust `store.rs` tests | Desktop implemented; identity/migration/integrity caveats remain |
| UC-03 Organize hierarchy | `DocumentCanvas`/`NodeBlock` → controller draft barrier → `DocumentOperation`/tree → gateway/store | `src/domain/tree.test.ts`; `src/components/DocumentCanvas*.test.tsx`; `src/application/useDocumentController.test.tsx`; Rust `store.rs` tests | Implemented; affected-node provenance is incomplete (R-25) |
| UC-04 Edit metadata | `NodeMetadataFields`/`TagEditor` → draft participant → controller `updateNode` | `src/components/NodeMetadataFields.test.tsx`; `TagEditor.test.tsx`; controller tests | Implemented |
| UC-05 Edit body | `RichTextEditor` → transaction classifier → `BodyEditBatchCoordinator` → controller `updateBody` → gateway/store | `bodyEditTransaction.test.ts`; `bodyEditorTransaction.test.ts`; `BodyEditBatchCoordinator.test.ts`; controller tests | Implemented; forced host exit remains outside drain protocol |
| UC-06 Inspect History | controller raw paging/filter → `historyProjection` → `HistoryPanel`; optional exact group capability | `historyProjection.test.ts`; `HistoryPanel.test.tsx`; `memoryGateway.groupHistory.test.ts`; `tauriGateway.test.ts` | Grouped History implemented; desktop pre-window and native exact-group gaps remain |
| UC-07 View historical revision | History action → controller query epoch/drain → `RevisionQueryCapability` → historical workspace projection | `useDocumentController.test.tsx`; `workspaceProjection.test.ts`; `HistoryPanel.test.tsx`; `HistoricalWorkspaceBanner.test.tsx`; `memoryGateway.test.ts` | Standalone implemented; Tauri host-deferred |
| UC-08 Restore revision | History/banner confirmation → controller mutation → gateway/store compensating restore | `useDocumentController.test.tsx`; `memoryGateway.test.ts`; Rust `store.rs` tests | Implemented; append-only compensating revision |
| UC-09 Export / backup | header action → draft drain → storage/export capability → browser download or native file/store path | controller/App tests; `memoryGateway.test.ts`; Rust `store.rs` tests | Implemented with documented fidelity/recovery differences |
| UC-10 Close document | header action → draft transition barrier → host close → workspace reset | `draftTransition.test.ts`; `useDocumentController.test.tsx`; `App.test.tsx` | Controlled close implemented; forced process/page exit remains limited |
| UC-11 Standalone artifact | `src/main.tsx` + memory composition + single-file Vite build | source-level `App`/memory tests; manual ST-01..ST-05 artifact suite in `TESTING.md` | Runtime artifact implemented; browser/platform qualification remains WP-9 |

Automated suites prove their stated seams only. They do not turn jsdom, memory-adapter, or store tests into real-browser/native-package evidence; use `TESTING.md` for the required qualification level.

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
