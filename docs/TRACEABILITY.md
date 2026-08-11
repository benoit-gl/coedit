# Feature traceability and code map

Use this document as the fastest answer to “where is this implemented?” It traces RUP use cases and UI actions to components, domain operations, adapters, Rust/SQLite behavior, and tests. The current test suite is intentionally sparse; an empty test cell is evidence of a gap, not evidence that no test is needed.

Status terms are defined in [the documentation index](./README.md#status-language).

## Concern-to-file lookup

| Concern | Start at | Important symbols / next files |
|---|---|---|
| Standalone page source | [`index.html`](../index.html) | loads `src/main.tsx` |
| Standalone composition | [`src/main.tsx`](../src/main.tsx) | `App`, `MemoryDocumentGateway` |
| Tauri page source | [`tauri.html`](../tauri.html) | loads `src/main-tauri.tsx` |
| Desktop composition | [`src/main-tauri.tsx`](../src/main-tauri.tsx) | `App`, `TauriDocumentGateway`, `tauriFileDialogs` |
| Standalone one-file build | [`vite.config.ts`](../vite.config.ts) | `standaloneHtml`, mode-dependent Rollup input/CSP |
| Desktop build/window/CSP | [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) | `beforeBuildCommand`, window `url`, security `csp` |
| Native permissions | [`src-tauri/capabilities/default.json`](../src-tauri/capabilities/default.json) | core defaults, dialog open/save |
| Application UI state/orchestration | [`src/App.tsx`](../src/App.tsx) | `App`, `run`, `apply`, `refreshHistory`, lifecycle callbacks |
| Contributor preference/fallback | [`src/App.tsx`](../src/App.tsx) | `PROFILE_KEY`, `loadContributor`, `contributor` memo |
| Outline hierarchy presentation | [`src/components/Outline.tsx`](../src/components/Outline.tsx) | `Outline`, `OutlineRow`, `buildTree` |
| Outline keyboard navigation | [`src/components/Outline.tsx`](../src/components/Outline.tsx) | `visible`, `onKeyDown`, `expanded` |
| Drag-to-reparent / reorder | [`src/components/Outline.tsx`](../src/components/Outline.tsx) | `onDrop`, row move buttons; dispatches through `App` |
| Node title/summary/kind form | [`src/components/NodeEditor.tsx`](../src/components/NodeEditor.tsx) | `NodeEditor`, `kinds`, blur commits |
| Rich-text toolbar/editor | [`src/editor/RichTextEditor.tsx`](../src/editor/RichTextEditor.tsx) | `RichTextEditor`, Tiptap extensions, `SAFE_TAGS` |
| Yjs loading/Base64 | [`src/editor/yjsEncoding.ts`](../src/editor/yjsEncoding.ts) | `createYDoc`, `bytesToBase64`, `base64ToBytes` |
| 1.2-second typing grouping | [`src/editor/RichTextEditor.tsx`](../src/editor/RichTextEditor.tsx) | `pendingUpdates`, `timer`, `flush`, `handleUpdate` |
| History search/filter/restore UI | [`src/components/HistoryPanel.tsx`](../src/components/HistoryPanel.tsx) | `HistoryPanel`, `filtered` |
| Layout, colors, responsive behavior | [`src/styles.css`](../src/styles.css) | `workspace`, `outline`, `node-editor`, `history-panel`, `@media` |
| Shared TypeScript data model | [`src/domain/types.ts`](../src/domain/types.ts) | all document/contribution/AI interfaces |
| Operation tagged union | [`src/domain/types.ts`](../src/domain/types.ts) | `DocumentOperation` |
| Pure tree mutation rules | [`src/domain/tree.ts`](../src/domain/tree.ts) | `applyOperation`, `assertValidTree`, `descendantIds` |
| Tree display projection | [`src/domain/tree.ts`](../src/domain/tree.ts) | `buildTree`, `TreeNode`, `activeNodes` |
| Browser state hash | [`src/domain/hash.ts`](../src/domain/hash.ts) | `canonicalDocumentJson`, `hashDocument` |
| ID generation | [`src/domain/ids.ts`](../src/domain/ids.ts) | `newId` and Web Crypto fallback |
| Persistence abstraction | [`src/persistence/gateway.ts`](../src/persistence/gateway.ts) | `DocumentGateway` |
| File-dialog abstraction | [`src/persistence/fileDialogs.ts`](../src/persistence/fileDialogs.ts) | `DocumentFileDialogs` |
| Standalone state/history/export | [`src/persistence/memoryGateway.ts`](../src/persistence/memoryGateway.ts) | `MemoryDocumentGateway`, `markdownFor`, `download` |
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

## Use-case traceability

Use-case definitions and acceptance flows are in [Vision and use cases](./RUP_VISION_AND_USE_CASES.md).

| UC | User-facing owner | Application/domain path | Host/persistence path | Current automated evidence | Status |
|---|---|---|---|---|---|
| UC-01 Create document | `App.createDocument`, welcome screen | `DocumentGateway.createDocument` | Memory `createDocument`; Tauri `create_document` → `DocumentStore::create` | Memory gateway history/restore test; Rust portable round trip | Implemented |
| UC-02 Open portable document | `App.openDocument` | `DocumentFileDialogs.chooseDocumentToOpen`, `DocumentGateway.openDocument` | Tauri dialog/gateway; `open_document` → `DocumentStore::open`/`load_state`/`validate_tree` | Rust round trip covers a valid reopen only | Partial |
| UC-03 Maintain hierarchy | `Outline`, `App.addNode`, `App.deleteNode` | `buildTree`; operations `createNode`, `moveNode`, `softDeleteNode` | memory `applyOperation`; Rust `apply_sql` | 4 tree tests; Rust cycle and round-trip cases | Implemented with UX gaps |
| UC-04 Edit node metadata | `NodeEditor`; `App.apply` | `updateNode` | both operation engines | Rust round trip covers summary; no UI/direct boundary suite | Partial test coverage |
| UC-05 Edit developed text | `RichTextEditor`; `NodeEditor`; `App.apply` | Yjs encoding; `updateContent` | memory stores strings; Rust validates/sanitizes/stores state | Rust sanitizer test only; no editor/Yjs integration test | Partial / known lifecycle defects |
| UC-06 Inspect history | `App.refreshHistory`; `HistoryPanel` | `listContributions({limit:500})`; client filters | memory query; Rust `contributions` | gateway/Rust round-trip counts only | Partial (500-entry UI slice) |
| UC-07 Restore revision | `HistoryPanel`; `App.restore` | `DocumentGateway.restoreRevision` | memory revision Map; Tauri `restore_revision` → `DocumentStore::restore` | Memory test and Rust round trip | Partial / stale-editor defect |
| UC-08 Export | App Export menu | `DocumentGateway.exportDocument` | memory Blob download; Tauri dialog → Rust `export`/`atomic_write` | Rust round trip only | Partial; formats differ and JSON cap exists |
| UC-09 Back up desktop document | App Export menu | `backupDocument`; backup dialog | Tauri `backup_document` → `DocumentStore::backup`/`atomic_copy` | Rust round trip creates file | Partial; UI cannot open backup extension directly |
| UC-10 Close document | `App.close` | `DocumentGateway.closeDocument` | memory clear; Tauri `close_document` drops store | none | Known defect for unflushed input |
| UC-11 Run standalone | welcome/workspace | `main.tsx` + memory gateway | single-file Vite build | build-time bundle assertions; manual double-click | Implemented, volatile by design |

## UI action-to-implementation map

| UI action | Local component behavior | Operation/gateway call | Persistence effect |
|---|---|---|---|
| Edit contributor name on welcome | updates `profile`; effect writes `coedit-local-contributor` when allowed | none | browser preference only; contributor is stored when a new document is created |
| Edit new-document title | updates `newTitle`; Enter invokes creation | `createDocument` | revision-0 document/contribution/snapshot |
| Open `.coedit` | desktop-only native dialog | `openDocument(path)` | validated SQLite connection becomes current store |
| Edit top-bar document title | uncontrolled input; commit on blur if changed | `renameDocument` | metadata title, revision, contribution, snapshot |
| Add root idea | `Outline.onAdd(null)` → `App.addNode` | `createNode` | new root at end of active siblings |
| Add child | row `+` → `App.addNode(parentId)` | `createNode` | new child at end of active siblings |
| Select node | updates `selectedId` | none | no document revision |
| Expand/collapse node | updates `Outline.expanded` | none | presentation state only |
| Arrow navigation | selects visible previous/next/parent or expands/collapses | none | presentation state only |
| Move up/down | row button supplies sibling index | `moveNode` | parent/position changes; sibling positions normalized |
| Drag a row onto another | HTML drag data; drop target becomes parent, append index | `moveNode` | reparent and normalize; no between-row/root drop target |
| Delete subtree | confirm in `App.deleteNode` | `softDeleteNode` | node and descendants get `deletedAt`; history retains them |
| Edit idea title | local `title` draft; commit on blur | `updateNode({title})` | normalized nonempty title and new revision |
| Edit summary | local `summary` draft; commit on blur | `updateNode({summary})` | summary and new revision |
| Change kind | immediate select callback | `updateNode({kind})` | validated enum and new revision |
| Type/format developed text | Tiptap/Yjs; group after 1.2 seconds | `updateContent` with HTML/update/state | new revision; desktop re-sanitizes HTML and stores full Yjs state |
| Undo/redo text | Yjs collaboration history through Tiptap | eventually part of next `updateContent` | no operation until flush |
| Open/close History | toggles `historyOpen` | none | no revision |
| Search/filter History | `HistoryPanel.filtered` over props | none after initial fetch | filters latest loaded 500 only |
| Restore history item | confirm in `App.restore` | `restoreRevision` | snapshot state becomes a new compensating revision |
| Export Markdown/JSON | menu and optional desktop save dialog | `exportDocument` | standalone download or atomic desktop output |
| Create SQLite backup | desktop-only save dialog | `backupDocument` | atomic byte copy of open SQLite file |
| Close | call gateway, then clear React view | `closeDocument` | memory cleared or current Rust store dropped; current ordering races pending drafts |

## Document operation cross-layer matrix

The serialized operation tag is camel case in both languages.

| Operation | TypeScript definition | Memory semantics | Desktop model/semantics | UI caller | Direct tests |
|---|---|---|---|---|---|
| `createNode` | `domain/types.ts::DocumentOperation` | `tree.ts::applyOperation` creates, shifts, normalizes | `models.rs::CreateNode`; `store.rs::apply_sql` validates/inserts/normalizes | `App.addNode` from `Outline`/empty editor | Rust round trip; no dedicated TS creation assertion |
| `updateNode` | same union | updates title/summary/kind/metadata | `UpdateNode`; field checks and SQL updates | `NodeEditor` | Rust round trip summary only |
| `updateContent` | same union | stores HTML/full state; incremental update only in payload | `UpdateContent`; bounds/Base64 checks, Ammonia, stores full state | `RichTextEditor` → `NodeEditor` → `App` | sanitizer only |
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
| `openDocument(path)` | `open_document` | `open_document` | `DocumentStore::open`, then `view` |
| `closeDocument()` | `close_document` | `close_document` | replace `AppState.document` with `None` |
| `getDocument()` | `get_document` | `get_document` | `view` |
| `applyOperation(operation,context)` | `apply_operation` | `apply_operation` | `apply` → `apply_sql` |
| `listContributions(query)` | `list_contributions` | `list_contributions` | `contributions` |
| `restoreRevision(revision,context)` | `restore_revision` | `restore_revision` | `restore` |
| `backupDocument(path)` | `backup_document` | `backup_document` | `backup` |
| `exportDocument(format,path)` | `export_document` | `export_document` | `export` |

Command strings, TypeScript payload property names, Rust parameter names, and serde field/tag naming form one manual contract. There is no generated binding or IPC contract test.

## Domain-to-storage map

| Domain concept | TypeScript | Rust | SQLite/materialization |
|---|---|---|---|
| Document identity/title/version/revision/time | `DocumentMetadata` | `DocumentMetadata` | rows in `metadata` keyed by `document_id`, `title`, `format_version`, `revision`, `created_at`, `updated_at`; `magic` is storage-only |
| Hierarchical node | `DocumentNode` | `DocumentNode` | `nodes`; self-reference through `parent_id`; active sibling ordering through `position` |
| Node kind | `NodeKind` union | `NodeKind` enum/converters | `nodes.kind` with `CHECK` constraint |
| Rich content | `contentHtml`, Base64 `yjsState` | String forms at IPC boundary | sanitized `content_html` TEXT; decoded `yjs_state` BLOB |
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
| [`src/domain/tree.test.ts`](../src/domain/tree.test.ts) | ordered tree projection, descendant-move rejection, subtree soft delete, cyclic-state rejection | UI behavior, all other operations, Rust parity, persistence |
| [`src/persistence/memoryGateway.test.ts`](../src/persistence/memoryGateway.test.ts) | create/update/restore attribution, revision progression, nonempty hashes | export ledger parity, sessions, UI lifecycle, desktop semantics |
| `src-tauri/src/store.rs` `tests` module | cycle rejection, Ammonia executable HTML removal, portable create/update/restore/backup/export/reopen round trip | migration, most error/limit/rollback paths, hash verification, UI/IPC contract |
| Vite build assertions in [`vite.config.ts`](../vite.config.ts) | standalone has one inline chunk, no unexpected assets, CSP hash generation, inline syntax parse | actual browser/UI behavior on each platform |

The target coverage and manual suites are in [Testing](./TESTING.md).

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
| Standalone recovery/import | JSON/Markdown downloads | durable browser storage or import parser, format validation, fidelity tests |

## Change-impact quick reference

| Change | Minimum files/layers to inspect |
|---|---|
| New document operation | `domain/types.ts`, `domain/tree.ts`, both TS tests/gateway, `models.rs`, `store.rs`, initiating UI, traceability/sequences |
| New node kind | TS type, `NodeEditor.kinds`, Rust enum/converters, SQLite `CHECK`/migration, exporters/tests/docs |
| New persisted field | TS/Rust models, schema/load/all writes/restore/hash/export, version/migration, format tests/docs |
| New rich-text format | Tiptap extension/toolbar, DOMPurify allowlist, Ammonia policy, Yjs/reload/restore/export/security tests |
| New gateway method | interface, memory implementation, Tauri adapter, Rust command/registration/store, contract tests, UI |
| New native dialog | dialog port, Tauri adapter, capability/plugin review, composition/use-case/platform tests |
| New host | dedicated entry/composition, gateway/dialog adapters, Vite/package entry, CSP/capabilities, deployment/portability/tests |
| New export | gateway/dialog literal types, both adapters, Rust command/store, filename/atomic behavior, fidelity/security tests |
| AI/sync/network | provider/transport outside offline root, consent and operation acceptance, new capability/CSP profile, threat model/tests |
| UI layout/interaction | owning component, `styles.css`, UI state/wireframes, keyboard/touch/a11y/component tests |

Detailed recipes and the definition of done are in [Contributing](./CONTRIBUTING.md).
