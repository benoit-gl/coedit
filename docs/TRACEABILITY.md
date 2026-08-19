# Feature traceability and code map

Use this document as the fastest answer to “where is this implemented?” It traces RUP use cases and UI actions to components, domain operations, adapters, Rust/SQLite behavior, and tests. The current test suite is intentionally sparse; an empty test cell is evidence of a gap, not evidence that no test is needed.

Status terms are defined in [the documentation index](./README.md#status-language).

## Concern-to-file lookup

| Concern | Start at | Important symbols / next files |
|---|---|---|
| Standalone page source | [`index.html`](../index.html) | loads `src/main.tsx` |
| Standalone composition | [`src/main.tsx`](../src/main.tsx) | `App`, `MemoryDocumentGateway`, available revision-query capability |
| Tauri page source | [`tauri.html`](../tauri.html) | loads `src/main-tauri.tsx` |
| Desktop composition | [`src/main-tauri.tsx`](../src/main-tauri.tsx) | `App`, `TauriDocumentGateway`, host-deferred revision-query capability, `tauriFileDialogs` |
| Standalone one-file build | [`vite.config.ts`](../vite.config.ts) | `standaloneHtml`, mode-dependent Rollup input/CSP |
| Desktop build/window/CSP | [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) | `beforeBuildCommand`, window `url`, security `csp` |
| Native permissions | [`src-tauri/capabilities/default.json`](../src-tauri/capabilities/default.json) | core defaults, dialog open/save |
| Application UI composition | [`src/App.tsx`](../src/App.tsx) | `App`, welcome/profile state, event translation, controller rendering |
| Application use cases/state | [`src/application/useDocumentController.ts`](../src/application/useDocumentController.ts) | `useDocumentController`, `executeMutation`, `runTransition`, `acceptView`, `requestHistory`, `viewRevision`, `backToCurrent`, lifecycle/capability callbacks |
| Live/historical application projection | [`src/application/workspaceProjection.ts`](../src/application/workspaceProjection.ts) | `WorkspaceProjection`, `RevisionRequestState`, retained-live/history helpers, `WorkspaceMutationUnavailableError` |
| Document-command serialization | [`src/application/serializedTaskQueue.ts`](../src/application/serializedTaskQueue.ts) | `SerializedTaskQueue.enqueue` |
| Contributor preference/fallback | [`src/App.tsx`](../src/App.tsx), [`src/application/useDocumentController.ts`](../src/application/useDocumentController.ts) | `PROFILE_KEY`, `loadContributor`, `contributor` memo |
| Outline hierarchy presentation | [`src/components/Outline.tsx`](../src/components/Outline.tsx) | `Outline`, `OutlineRow`, `buildTree` |
| Outline keyboard navigation | [`src/components/Outline.tsx`](../src/components/Outline.tsx) | `visible`, `onKeyDown`, `expanded` |
| Drag-to-reparent / reorder | [`src/components/Outline.tsx`](../src/components/Outline.tsx) | `onDrop`, row move buttons; dispatches through controller callbacks supplied by `App` |
| Document/node title-tag drafts | [`src/App.tsx`](../src/App.tsx), [`src/components/NodeEditor.tsx`](../src/components/NodeEditor.tsx), [`src/components/TagEditor.tsx`](../src/components/TagEditor.tsx) | `DocumentTitleInput`, `NodeEditor`, `TagEditor`, dirty sets, eager drains, composed registered participants |
| Tag normalization/suggestions | [`src/domain/tags.ts`](../src/domain/tags.ts) | `normalizeTag`, `normalizeTags`, `collectActiveTags`; active-node document vocabulary |
| Rich-text toolbar/editor | [`src/editor/RichTextEditor.tsx`](../src/editor/RichTextEditor.tsx) | `RichTextEditor`, Tiptap extensions, `DraftParticipant`, drain/retry logic |
| Controlled draft transitions | [`src/application/draftTransition.ts`](../src/application/draftTransition.ts), [`src/App.tsx`](../src/App.tsx), [`src/components/NodeEditor.tsx`](../src/components/NodeEditor.tsx) | `DraftTransitionCoordinator`, `DocumentTitleInput`, composed node-metadata/rich-text participant |
| Browser rich-text policy | [`src/editor/sanitizeRichText.ts`](../src/editor/sanitizeRichText.ts) | `RICH_TEXT_POLICY`, centralized allowlists, `sanitizeRichText` |
| Yjs loading/Base64 | [`src/editor/yjsEncoding.ts`](../src/editor/yjsEncoding.ts) | `createYDoc`, `bytesToBase64`, `base64ToBytes` |
| Semantic body checkpoints / explicit drain | [`src/editor/RichTextEditor.tsx`](../src/editor/RichTextEditor.tsx), [`src/editor/bodyEditorTransaction.ts`](../src/editor/bodyEditorTransaction.ts), [`src/editor/BodyEditBatchCoordinator.ts`](../src/editor/BodyEditBatchCoordinator.ts) | pre-application transaction observation, synchronous Yjs/HTML capture, semantic groups, bounded FIFO, visible retry/backpressure, `DraftParticipant` |
| History search/page/revision-action UI | [`src/components/HistoryPanel.tsx`](../src/components/HistoryPanel.tsx) | `HistoryPanel`, debounced `onQueryChange`, `onLoadOlder`, capability-aware View/current/loading/viewed states, host-deferred Restore fallback |
| Historical read-only presentation | [`src/App.tsx`](../src/App.tsx), [`src/components/HistoricalNodeView.tsx`](../src/components/HistoricalNodeView.tsx), [`src/components/HistoricalWorkspaceBanner.tsx`](../src/components/HistoricalWorkspaceBanner.tsx) | live-editor replacement, sanitizer-backed static body, persistent revision/current-revision identity, Back, confirmed restore |
| Layout, colors, responsive behavior | [`src/styles.css`](../src/styles.css) | `workspace`, `outline`, `node-editor`, `history-panel`, `@media` |
| Shared TypeScript data model | [`src/domain/types.ts`](../src/domain/types.ts) | all document/contribution/AI interfaces |
| Operation tagged union | [`src/domain/types.ts`](../src/domain/types.ts) | `DocumentOperation` |
| Pure tree mutation rules | [`src/domain/tree.ts`](../src/domain/tree.ts) | `applyOperation`, `assertValidTree`, `descendantIds` |
| Tree display projection | [`src/domain/tree.ts`](../src/domain/tree.ts) | `buildTree`, `TreeNode` |
| JSON-compatible metadata / canonical encoding | [`src/domain/json.ts`](../src/domain/json.ts) | `cloneJson`, `cloneJsonObject`, `canonicalJson`, `compareJsonStrings` |
| Browser state hash/projection | [`src/domain/hash.ts`](../src/domain/hash.ts) | `DOCUMENT_HASH_ALGORITHM`, `toDocumentState`, `canonicalDocumentJson`, `hashDocument` |
| ID generation | [`src/domain/ids.ts`](../src/domain/ids.ts) | `newId` and Web Crypto fallback |
| Persistence abstractions/paging | [`src/persistence/gateway.ts`](../src/persistence/gateway.ts) | command/history ports, `DocumentRevisionQueries`, `RevisionQueryCapability`, `MaterializedRevision`, storage variants, `DocumentGateway`, page/cursor helpers |
| File-dialog/filename abstraction | [`src/persistence/fileDialogs.ts`](../src/persistence/fileDialogs.ts) | `DocumentFileDialogs`, `safeFilenameStem` |
| Standalone state/history/revision query/export | [`src/persistence/memoryGateway.ts`](../src/persistence/memoryGateway.ts) | `MemoryDocumentGateway`, `materializeRevision`, `markdownFor`, `download` |
| TypeScript Tauri IPC calls | [`src/persistence/tauriGateway.ts`](../src/persistence/tauriGateway.ts) | `TauriDocumentGateway` |
| Native path dialogs/filters | [`src/persistence/tauriFiles.ts`](../src/persistence/tauriFiles.ts) | `choose*`, `tauriFileDialogs` |
| Rust IPC/domain model | [`src-tauri/src/models.rs`](../src-tauri/src/models.rs) | mirrored structs/enums, operation names/affected nodes |
| Tauri command registry/state | [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) | `AppState`, command functions, `run` |
| SQLite schema/constants/limits | [`src-tauri/src/store.rs`](../src-tauri/src/store.rs) | `initialize_schema`, `FORMAT_VERSION`, `APPLICATION_ID`, `MAX_*` |
| File creation/open validation | [`src-tauri/src/store.rs`](../src-tauri/src/store.rs) | `DocumentStore::create`, `DocumentStore::open`, `load_state`, `validate_tree` |
| Desktop transaction semantics | [`src-tauri/src/store.rs`](../src-tauri/src/store.rs) | `DocumentStore::apply`, `apply_sql` |
| Desktop ledger query | [`src-tauri/src/store.rs`](../src-tauri/src/store.rs) | `DocumentStore::contributions` |
| Desktop restore | [`src-tauri/src/store.rs`](../src-tauri/src/store.rs) | `DocumentStore::restore`, `insert_snapshot` |
| Desktop backup/export | [`src-tauri/src/store.rs`](../src-tauri/src/store.rs) | `backup`, `export`, `markdown`, `atomic_*`, `replace_file` |
| Rust HTML sanitization | [`src-tauri/src/store.rs`](../src-tauri/src/store.rs) | Ammonia calls in content creation/update/restore |
| Future AI contract | [`src/ai/provider.ts`](../src/ai/provider.ts) | `AiRequest`, `AiProvider`; no adapter/UI |
| `.coedit` specification/recovery | [`docs/DOCUMENT_FORMAT.md`](./DOCUMENT_FORMAT.md) | format version 1 and output distinctions |
| Security/trust boundaries | [`docs/SECURITY.md`](./SECURITY.md) | CSP, capabilities, sanitization, future network rules |
| Known defects/debt | [`docs/KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) | prioritized risk register |
| Versioned browser protocol fixtures | [`fixtures/protocol`](../fixtures/protocol) | `document-hash-v1.json`, `rich-text-v1.json` |

## Use-case traceability

Use-case definitions and acceptance flows are in [Vision and use cases](./RUP_VISION_AND_USE_CASES.md).

| UC | User-facing owner | Application/domain path | Host/persistence path | Current automated evidence | Status |
|---|---|---|---|---|---|
| UC-01 Create document | welcome screen; `controller.createDocument` | narrowed `storage.createDocument` through serialized queue | Memory volatile create; Tauri native-file create → `DocumentStore::create` | Memory gateway tests; queue tests; Rust portable round trip | Implemented |
| UC-02 Open portable document | `controller.openDocument` | `DocumentFileDialogs.chooseDocumentToOpen`, narrowed `NativeDocumentStorage.openDocument` | Tauri dialog/gateway; `open_document` → `DocumentStore::open`/`load_state`/`validate_tree` | Rust round trip covers a valid reopen only | Partial |
| UC-03 Maintain hierarchy | `Outline`, `App.addNode`, `App.deleteNode` | `buildTree`; operations `createNode`, `moveNode`, `softDeleteNode` | memory `applyOperation`; Rust `apply_sql` | 5 tree tests (including body-operation isolation); Rust cycle and round-trip cases | Implemented with UX gaps |
| UC-04 Edit node metadata | `NodeEditor`; controller commit callbacks | registered metadata/rich-text participant; queued `updateNode` | both operation engines | tag domain/component and title-acknowledgement tests; no full UI suite | Partial test coverage |
| UC-05 Edit node body | `RichTextEditor`; `NodeEditor`; controller | composed draft participant; centralized sanitizer; queued `updateBody`; authoritative editor generation | memory sanitizes/detaches; Rust validates/sanitizes/stores state | sanitizer, memory body-operation, draft, and controller transition tests; no full Tiptap/native integration | Partial / host-exit and cross-adapter evidence |
| UC-06 Inspect history | controller; `HistoryPanel` | filtered `ContributionPage`, exclusive cursor, Load older | memory complete-ledger paging; Tauri page wrapper over Rust `contributions` | memory filter/page test; no controller/Rust boundary suite | Partial (desktop 100,000 pre-window) |
| UC-07 Restore revision | `HistoryPanel`; controller | draft drain, queue, `restoreRevision`, authoritative editor generation | memory revision Map; Tauri `restore_revision` → `DocumentStore::restore` | controller generation, memory restore, Rust round trip | Shared/standalone implemented; full editor/native parity pending |
| UC-08 Export | App Export menu; controller | drain, narrowed storage `exportDocument`, centralized `ExportFormat`/filename | volatile Blob recovery envelope; native dialog → Rust `export`/`atomic_write` | standalone envelope/filename tests; Rust round trip | Partial; no importer and desktop JSON cap |
| UC-09 Back up desktop document | App Export menu; controller | drain, narrowed `NativeDocumentStorage.backupDocument`; backup dialog | Tauri `backup_document` → `DocumentStore::backup`/`atomic_copy` | Rust round trip creates file | Partial; UI cannot open backup extension directly |
| UC-10 Close document | `controller.closeDocument` | freeze/await registered drafts → serialized `DocumentGateway.closeDocument` | memory clear; Tauri `close_document` drops store | draft + controller Close tests | Implemented in-app; full editor/native evidence pending |
| UC-11 Run standalone | welcome/workspace | `main.tsx` + memory gateway | single-file Vite build | build-time bundle assertions; manual double-click | Implemented, volatile by design |

## UI action-to-implementation map

| UI action | Local component behavior | Operation/gateway call | Persistence effect |
|---|---|---|---|
| Edit contributor name on welcome | updates `profile`; effect writes `coedit-local-contributor` when allowed | none | browser preference only; contributor is stored when a new document is created |
| Edit new-document title | updates `newTitle`; Enter invokes creation | `createDocument` | revision-0 document/contribution/snapshot |
| Open `.coedit` | rendered when `storage.kind === "native-file"`; native dialog | `storage.openDocument(path)` after narrowing | validated SQLite connection becomes current store |
| Edit top-bar document title | controlled dirty draft; eager blur drain and transition participant | queued `renameDocument` | metadata title, revision, contribution, snapshot |
| Add root idea | `Outline.onAdd(null)` → `App.addNode` | `createNode` | new root at end of active siblings |
| Add child | row `+` → `App.addNode(parentId)` | `createNode` | new child at end of active siblings |
| Select node | freezes/drains document title plus current node metadata/rich text, then updates `selectedId` | `controller.selectNode`; no gateway call when all drafts are clean | no document revision unless a pending draft commits first |
| Expand/collapse node | updates `Outline.expanded` | none | presentation state only |
| Arrow navigation | selects visible previous/next/parent or expands/collapses | none | presentation state only |
| Move up/down | row button supplies sibling index | `moveNode` | parent/position changes; sibling positions normalized |
| Drag a row onto another | HTML drag data; drop target becomes parent, append index | `moveNode` | reparent and normalize; no between-row/root drop target |
| Delete subtree | confirm in `App.deleteNode` | `softDeleteNode` | node and descendants get `deletedAt`; history retains them |
| Edit idea title | controlled dirty draft; eager blur or transition drain | `updateNode({title})` | normalized nonempty title and new revision |
| Add/reuse/remove tag | editable combobox and removable chips; pending text drains before transitions | `updateNode({tags})` | normalized/deduplicated tag array and new revision; active-node suggestions adapt |
| Type/format node body | Tiptap/Yjs; pre-application semantic/threshold/idle/IME classification; bounded checkpoint FIFO and visible retry; explicit transition drain | queued `updateBody` with producer-owned episode group and centralized sanitized HTML/update/state | new revision; desktop re-sanitizes HTML and stores full Yjs state |
| Undo/redo text | Yjs collaboration history through Tiptap | eventually part of next `updateBody` | no operation until flush |
| Open/close History | toggles `historyOpen` | none | no revision |
| Search/filter History | 250 ms debounce; reset loaded items/cursor | `listContributions(filters, limit:100)` | adapter filters before page construction |
| Load older History | shown when `hasMore`; append unseen IDs | `listContributions(filters, beforeRevision:cursor, limit:100)` | exclusive-cursor next page |
| Restore history item | confirm in `App`; controller drains/queues | `restoreRevision` | snapshot state becomes a new compensating revision |
| Export Markdown/JSON | controller freezes/drains registered drafts; native save dialog only after narrowing | `storage.exportDocument` | standalone safe-named download or atomic desktop output |
| Create SQLite backup | controller drains; native-storage-gated save dialog | `storage.backupDocument` after narrowing | atomic byte copy of open SQLite file |
| Close | controller freezes/awaits all registered drafts and queued work; clears state only after success | `closeDocument` | memory cleared or current Rust store dropped; controlled failure retains workspace/drafts |

## Document operation cross-layer matrix

The serialized operation tag is camel case in both languages.

| Operation | TypeScript definition | Memory semantics | Desktop model/semantics | UI caller | Direct tests |
|---|---|---|---|---|---|
| `createNode` | `domain/types.ts::DocumentOperation` | `tree.ts::applyOperation` creates, shifts, normalizes | `models.rs::CreateNode`; `store.rs::apply_sql` validates/inserts/normalizes | `App.addNode` from `Outline`/empty editor | Rust round trip; no dedicated TS creation assertion |
| `updateNode` | same union | updates title/tags/metadata | `UpdateNode`; tag/field checks and SQL updates | `NodeEditor`/`TagEditor` | tag domain/component tests and title acknowledgement |
| `updateBody` | same union | stores body HTML/full state; incremental update only in payload | `UpdateBody`; bounds/Base64 checks, Ammonia, stores full state | `RichTextEditor` → `NodeEditor` → `App` | sanitizer and memory gateway operation tests |
| `moveNode` | same union | validates target/descendants; shifts/normalizes | `MoveNode`; same intended invariants in SQL | `Outline` drag/up/down | TS rejects descendant; no Rust operation-specific test |
| `softDeleteNode` | same union | timestamps node and descendants | `SoftDeleteNode`; recursive CTE | `App.deleteNode` | TS subtree test |
| `restoreNode` | same union | restores node and ancestors | `RestoreNode`; restores node and ancestors | no current UI | none |
| `renameDocument` | same union | title fallback and timestamp | `RenameDocument`; `clean_title` and metadata update | top-bar blur | none |

For every operation, `tree.ts::affectedNodeIds` and Rust `DocumentOperation::affected_node_ids` also require parity. Current reporting usually lists the requested node only, even when a subtree/siblings are materially affected.

`createDocument` and `restoreRevision` are contribution operation types but not members of the normal `DocumentOperation` union. They have dedicated gateway/store methods.

## Gateway-to-Tauri command map

| `DocumentGateway` method | Tauri adapter invocation | Rust command in `lib.rs` | Store call |
|---|---|---|---|
| `createDocument(path,title,contributor)` | `create_document` | `create_document` | `DocumentStore::create`, then `view` |
| native `storage.openDocument(path)` | `open_document` | `open_document` | `DocumentStore::open`, then `view` |
| `closeDocument()` | `close_document` | `close_document` | replace `AppState.document` with `None` |
| `applyOperation(operation,context)` | `apply_operation` | `apply_operation` | `apply` → `apply_sql` |
| `listContributions(query)` | `list_contributions`, request `limit + 1`, wrap `ContributionPage` | `list_contributions` | `contributions` (still pre-windows 100,000 rows) |
| `restoreRevision(revision,context)` | `restore_revision` | `restore_revision` | `restore` |
| native `storage.backupDocument(path)` | `backup_document` | `backup_document` | `backup` |
| `exportDocument(format,path)` | `export_document` | `export_document` | `export` |

Command strings, TypeScript payload property names, Rust parameter names, and serde field/tag naming form one manual contract. There is no generated binding or IPC contract test.

## Domain-to-storage map

| Domain concept | TypeScript | Rust | SQLite/materialization |
|---|---|---|---|
| Document identity/title/version/revision/time | `DocumentMetadata` | `DocumentMetadata` | rows in `metadata` keyed by `document_id`, `title`, `format_version`, `revision`, `created_at`, `updated_at`; `magic` is storage-only |
| Hierarchical node | `DocumentNode` | `DocumentNode` | `nodes`; self-reference through `parent_id`; active sibling ordering through `position` |
| Node tags | `DocumentNode.tags` | `Vec<String>` | `nodes.tags_json`; validated JSON array, suggestion vocabulary derived at runtime |
| Node body | `bodyHtml`, Base64 `yjsState` | String forms at IPC boundary | sanitized `body_html` TEXT; decoded `yjs_state` BLOB |
| Contributor | `Contributor`/`ContributorKind` | matching struct/enum | `contributors` |
| Writing session | `WritingSession` | matching struct | `writing_sessions`; lazily inserted by desktop mutation |
| Current state | `DocumentState` | `DocumentState` | constructed from metadata/contributors/sessions/nodes |
| Host view fields | `DocumentView` | `DocumentView` flattening state | `path`, `read_only`, `recovery_warning` live on `DocumentStore`, not tables |
| Contribution | `Contribution` | `Contribution` | `contributions`; affected IDs/payload stored as JSON text |
| Snapshot | not a public TS type | serialized `DocumentState` | `snapshots` by revision with state JSON/hash/time |
| Attachment | no current TS contract | no active model | `attachments` reserved table only |

The complete column/constraint description is in [Persistence design](./PERSISTENCE_DESIGN.md) and [Document format](./DOCUMENT_FORMAT.md).

## Test ownership map

| Test file/location | Current coverage | Features it does not prove |
|---|---|---|
| [`src/domain/tree.test.ts`](../src/domain/tree.test.ts) | ordered tree projection, descendant-move rejection, subtree soft delete, body update, cyclic-state rejection | UI behavior, remaining operations, Rust parity, persistence |
| [`src/application/serializedTaskQueue.test.ts`](../src/application/serializedTaskQueue.test.ts) | strict task ordering and continuation after rejection | React/controller integration, cancellation, teardown |
| [`src/application/draftTransition.test.ts`](../src/application/draftTransition.test.ts) | synchronous freeze, all-participant drain, failure/retry, safe participant replacement | full component/editor and host-exit behavior |
| [`src/application/useDocumentController.test.tsx`](../src/application/useDocumentController.test.tsx) | selection/Close draft ordering, failed-flush blocking, restore generation, historical entry/Back/restore, exact failure origins, stale/closed request invalidation, unavailable capability, command/export guards | full `App`/Tiptap historical rendering and native parity |
| [`src/application/workspaceProjection.test.ts`](../src/application/workspaceProjection.test.ts) | live/historical discriminants, read-only derivation, retained live selection/editor candidate, historical selection fallback, Back | future canvas/navigator context fields |
| [`src/domain/visibleNodes.test.ts`](../src/domain/visibleNodes.test.ts) | deterministic pre-order/depth/adjacency, collapse/deletion, immutability, invalid ancestry/cycles, and 10,000-level iterative projection | React ownership/focus and browser performance |
| [`src/components/DocumentCanvas.test.tsx`](../src/components/DocumentCanvas.test.tsx) + [`src/components/NodeBlock.test.tsx`](../src/components/NodeBlock.test.tsx) | static order/depth, live/historical/read-only identity, collapse/empty/error states, sanitized title/tag/body presentation, and absence of historical controls | reachable workspace composition, structural interaction, browser/a11y qualification |
| [`src/components/DocumentCanvasEditorOwnership.test.tsx`](../src/components/DocumentCanvasEditorOwnership.test.tsx) | sole editor owner, registered participant, drain-before-unmount, successful transfer, and failed-transfer owner/focus retention | real Tiptap focus/browser behavior and every later structural owner-removal path |
| [`src/editor/bodyEditorTransaction.test.ts`](../src/editor/bodyEditorTransaction.test.ts) | concrete ProseMirror observation, retained capture failure, and real Tiptap/Yjs synchronous checkpoint capture | real-browser IME/input matrix and React StrictMode qualification |
| [`src/domain/tags.test.ts`](../src/domain/tags.test.ts) | tag normalization, deduplication, limits, and active-node vocabulary | Rust normalization parity and full UI behavior |
| [`src/components/TagEditor.test.tsx`](../src/components/TagEditor.test.tsx) | freeform create, suggestion reuse, chip removal, transition flush | real-browser IME, touch, and assistive-technology behavior |
| [`src/application/localContributor.test.ts`](../src/application/localContributor.test.ts) | stored contributor validation and safe fallback | contributor registration/selection and browser-specific storage behavior |
| [`src/components/NodeEditor.test.tsx`](../src/components/NodeEditor.test.tsx) | normalized title adoption and absence of a secondary summary field | remaining metadata/focus behavior and full Tiptap composition |
| [`src/domain/hash.test.ts`](../src/domain/hash.test.ts) + hash fixture | canonical JSON/digest, host-field exclusion, input-order preservation, Unicode/integer-like key order, invalid-JSON rejection | Rust parity, replay/open verification |
| [`src/editor/sanitizeRichText.test.ts`](../src/editor/sanitizeRichText.test.ts) + rich-text fixture | supported/hostile cases and idempotence | Rust parity and full editor paste/commit integration |
| [`src/persistence/memoryGateway.test.ts`](../src/persistence/memoryGateway.test.ts) | attribution/restore, revision progression, verified detached/non-mutating materialization, corrupt/missing/invalid snapshot rejection, cursor paging/filtering, complete runtime recovery envelope, input detachment/metadata validation/direct sanitization, safe filenames | sessions, import, desktop semantics/native materialization |
| [`src/persistence/tauriGateway.test.ts`](../src/persistence/tauriGateway.test.ts) | native revision-query capability is explicitly host-deferred with no throwing query stub | native query/IPC/materialization parity |
| `src-tauri/src/store.rs` `tests` module | cycle rejection, Ammonia executable HTML removal, portable create/update/restore/backup/export/reopen round trip | migration, most error/limit/rollback paths, hash verification, UI/IPC contract |
| Vite build assertions in [`vite.config.ts`](../vite.config.ts) | standalone has one inline chunk, no unexpected assets, CSP hash generation, inline syntax parse | actual browser/UI behavior on each platform |

The target coverage and manual suites are in [Testing](./TESTING.md).

## Proposed continuous-workspace traceability

The rows below track the staged continuous-workspace package. A status explicitly identifies implemented work; all other proposed source names remain ownership targets, not evidence that the feature exists. The authoritative package is [Proposed continuous workspace](./proposals/README.md).

| Proposed use case / requirement | Design artifact | Intended ownership | Required verification | Current status |
|---|---|---|---|---|
| UC-12, FR-PW-01/02/11 - continuous block outline | [Continuous block-outline](./proposals/CONTINUOUS_BLOCK_OUTLINE.md) | pure visible-node projection; `DocumentCanvas`; `NodeBlock`; separate focus/editor ownership; shared styles | projection units; static security tests; sole-owner transfer/failure integration; collapse/structural, keyboard, pointer, touch, IME, a11y, browser, and scale cases | Partial: WP-6, the WP-7 scaffold, and the active-editor safety gate are implemented; `App` still uses `Outline` + selected `NodeEditor` pending editable/structural canvas parity |
| UC-12/UC-13, US-41, FR-PW-12/13 - optional navigator | [Optional navigator sidebar](./proposals/CONTINUOUS_BLOCK_OUTLINE.md#optional-navigator-sidebar) | navigation-only `NavigatorPanel`; independent requested/effective dock/drawer/selection/expansion state; canvas-context/focus-region/editor-owner/one-shot-resume separation; versioned Navigator browser preference; shared live/historical projection | single-editor/non-mutation contracts; reveal/explicit-focus and resize-forced dirty-focus-boundary ordering; outside-app focus preservation; effective-History initial/silent/stale-refresh query counts plus data-generation response guard; active-snapshot source, exact Back restoration, fresh/consumed resume candidates, changed-ancestry visible Restore target, and context rebasing; preference validation/non-persistence; deterministic mutually exclusive drawers, ARIA tree, keyboard, focus return, touch/iPadOS tests | Proposed; it augments the continuous canvas and does not preserve the current master/detail editor as a selectable mode |
| UC-13, FR-PW-03/04/05 - query-first history | [Query-first historical views](./proposals/QUERY_FIRST_HISTORY.md) | revision-query port; memory/Tauri query adapters; explicit workspace projection; History **View** action; read-only rendering path | memory query detachment/non-mutation/hash/tree; controller origin/stale/Back/guards; static hostile-HTML rendering; banner/History component semantics; full-App View/Back/one-restore integration present; WP-7 static historical canvas identity present; native contract and reachable canvas contexts remain | Partial: WP-1 through WP-3 implement standalone selected-detail viewing and WP-7 supplies the unreachable static canvas seam; Tauri query and controller/canvas reuse remain |
| UC-14, FR-PW-06/07/08/09/10 - checkpoint/group policy | [Body checkpoint strategy](./proposals/BODY_CHECKPOINT_STRATEGY.md) | exported injectable policy; pure body-edit coordinator; concrete Tiptap/Yjs adapter; bounded FIFO/backpressure; caller-owned application group contract; controller/canvas transition integration; page-aware grouped History projection | fake-time/configurable-threshold units; ProseMirror/Tiptap/Yjs capture; IME grouping; slow/failure retry; owner-transfer ordering; tree-operation ordering; page-spanning grouped/exact History | Partial: WP-4 core plus editor/ownership integration are implemented and the fixed timer is removed; structural canvas boundaries, browser qualification, and grouped History WP-5 remain |

The proposal intentionally reuses the existing `DocumentOperation`, contribution, snapshot, and draft-transition boundaries. It does not authorize inserting not-yet-existing symbols into the as-built ownership tables above.

## Reserved and proposed extension seams

| Seam | Existing code/schema | Missing for an implemented feature |
|---|---|---|
| AI proposals | `src/ai/provider.ts`; AI proposal/metadata types | provider adapter, explicit composition, UI/consent/preview, accepted-operation attribution, network security profile, tests |
| Real-time collaboration | Yjs local editor state | transport/auth, shared structural model, conflict/revision/ledger semantics, opt-in capability, tests |
| Attachments | SQLite `attachments` table | shared types, operations, gateway/commands/store API, checksum policy, UI, export/recovery, tests |
| Contributor management | types and contributor table | register/select APIs, cross-machine identity UX, attribution policy, tests |
| Session management | types/table and lazy desktop insert | explicit start/end/description, memory parity, UI, integrity policy |
| Direct deleted-node restore | `restoreNode` operation in both engines | deleted-item UI/history affordance and tests |
| Schema evolution | format/user version fields | migration registry/transactions, compatibility matrix, fixtures/tests |
| Standalone recovery/import | marked `coedit-recovery` version-2 state + complete runtime-ledger JSON; Markdown downloads | durable browser storage or import parser, format validation, snapshot/replay semantics, fidelity tests |

## Change-impact quick reference

| Change | Minimum files/layers to inspect |
|---|---|
| New document operation | `domain/types.ts`, `domain/tree.ts`, both TS tests/gateway, `models.rs`, `store.rs`, initiating UI, traceability/sequences |
| Tag behavior/limits | `domain/tags.ts`, `TagEditor`, `NodeEditor`, Rust validation, SQLite `tags_json`, hash/recovery fixtures, tests/docs |
| New persisted field | TS/Rust models, schema/load/all writes/restore/hash/export, version/migration, format tests/docs |
| New rich-text format | Tiptap extension/toolbar, `sanitizeRichText.ts`, versioned fixture/policy decision, Ammonia policy, Yjs/reload/restore/export/security tests |
| New shared gateway capability | smallest owning port, memory behavior, controller/UI, Tauri adapter, Rust command/registration/store where native, contract tests |
| New native-only capability | `NativeDocumentStorage` or a new discriminated capability, dialog port, Tauri command/security review; no rejecting memory stub |
| New native dialog | dialog port, Tauri adapter, capability/plugin review, composition/use-case/platform tests |
| New host | dedicated entry/composition, gateway/dialog adapters, Vite/package entry, CSP/capabilities, deployment/portability/tests |
| New export | centralized `ExportFormat`, controller/menu, relevant adapters/dialogs, Rust command/store, `safeFilenameStem`, fidelity/security tests |
| AI/sync/network | provider/transport outside offline root, consent and operation acceptance, new capability/CSP profile, threat model/tests |
| UI layout/interaction | owning component, `styles.css`, UI state/wireframes, keyboard/touch/a11y/component tests |
| Continuous block-outline implementation | `proposals/CONTINUOUS_BLOCK_OUTLINE.md`, visible-node projection, canvas/block ownership, active-editor drain/focus transfer, live/historical rendering, interaction/a11y/performance tests |
| Optional navigator implementation | `proposals/CONTINUOUS_BLOCK_OUTLINE.md#optional-navigator-sidebar`, navigation-only panel, independent UI state/preference, shared live/historical projection, canvas reveal/focus boundary, responsive styles, non-mutation/a11y/portability tests |
| Historical materialization query | `proposals/QUERY_FIRST_HISTORY.md`, query port and both adapters, explicit workspace mode, History/canvas controls, non-mutation/security/stale-response/restore tests |
| Body checkpoint policy | `proposals/BODY_CHECKPOINT_STRATEGY.md`, centralized injectable `batchCharacterThreshold`/`idleTimeoutMs`, coordinator/classifier, controller queue, group projection, deterministic timer/IME/failure tests |

Detailed recipes and the definition of done are in [Contributing](./CONTRIBUTING.md).
