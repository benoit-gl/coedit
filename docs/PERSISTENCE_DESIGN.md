# Persistence design

This artifact describes the persistence subsystem that exists in Coedit Local `0.1.0`. It is the analysis-and-design/data-model companion to the [architecture](./ARCHITECTURE.md), [document-format specification](./DOCUMENT_FORMAT.md), and [security model](./SECURITY.md). It deliberately distinguishes the durable Tauri implementation from the in-memory standalone implementation.

For unresolved defects and constraints, see [Known limitations](./KNOWN_LIMITATIONS.md). For end-to-end use-case realizations, see [Sequence diagrams](./SEQUENCE_DIAGRAMS.md). Future snapshot-query, navigator-presentation-state, and checkpoint/grouping changes are specified separately in the [proposed continuous-workspace package](./proposals/README.md).

## Responsibilities and boundary

The shared React UI does not know whether a document lives in browser memory or SQLite. `useDocumentController` calls the capability-oriented TypeScript ports assembled as `DocumentGateway`. Native file selection is a separate `DocumentFileDialogs` port. Host storage behavior is a discriminated `DocumentStorage` union: `VolatileDocumentStorage` creates/exports without paths, while `NativeDocumentStorage` creates/opens/backs up/exports with paths.

There are two explicit compositions:

- `src/main.tsx` constructs `MemoryDocumentGateway` for the standalone `index.html` artifact.
- `src/main-tauri.tsx` constructs `TauriDocumentGateway` and supplies `tauriFileDialogs` for the desktop host.

There is no runtime probing for Tauri and no local HTTP persistence service. Desktop persistence crosses Tauri IPC; standalone persistence stays inside the browser process.

```plantuml
@startuml
skinparam componentStyle rectangle
left to right direction

package "Shared React application" {
  component App
  component useDocumentController as Controller
  interface DocumentGateway
  interface DocumentStorage
  interface VolatileDocumentStorage
  interface NativeDocumentStorage
  interface DocumentFileDialogs
}

package "Standalone composition" {
  component "main.tsx" as StandaloneMain
  component "MemoryDocumentGateway" as Memory
  rectangle "Browser memory" as BrowserMemory
  artifact "Downloaded JSON / Markdown" as Download
}

package "Tauri composition" {
  component "main-tauri.tsx" as TauriMain
  component "TauriDocumentGateway" as TauriGateway
  component "tauriFileDialogs" as FileDialogs
  component "Tauri command layer" as Commands
  component DocumentStore as Store
  database ".coedit SQLite file" as SQLite
  component "Native open/save dialogs" as NativeDialogs
}

StandaloneMain --> App
StandaloneMain --> Memory
TauriMain --> App
TauriMain --> TauriGateway
TauriMain --> FileDialogs
App --> Controller
Controller --> DocumentGateway
Controller --> DocumentFileDialogs
DocumentGateway o-- DocumentStorage
DocumentStorage <|-- VolatileDocumentStorage
DocumentStorage <|-- NativeDocumentStorage
Memory ..|> DocumentGateway
TauriGateway ..|> DocumentGateway
FileDialogs ..|> DocumentFileDialogs
Memory --> BrowserMemory
Memory --> Download
TauriGateway --> Commands : invoke(...)
Commands --> Store
Store --> SQLite : rusqlite
FileDialogs --> NativeDialogs
@enduml
```

## Ports, adapters, and ownership

### `DocumentGateway`

`src/persistence/gateway.ts` separates shared behavior into small ports and composes them as `DocumentGateway`:

- `DocumentSession`: close, apply one attributed operation, and restore a revision;
- `ContributionHistory`: return cursor-addressable `ContributionPage` values;
- `DocumentRevisionQueries`: materialize one detached, structurally valid, hash-verified snapshot without mutation;
- `RevisionQueryCapability`: advertise that query port as `available` or explicitly `host-deferred`;
- `DocumentStorage`: a discriminated union held in `DocumentGateway.storage`;
- `VolatileDocumentStorage`: create/export with no filesystem path;
- `NativeDocumentStorage`: create/open/backup/export with required filesystem paths.

The controller narrows `storage.kind` (`volatile` or `native-file`) before calling its shape-specific methods. The memory adapter no longer implements rejecting native open/backup stubs, and method signatures no longer accept meaningless nullable paths.

The command port returns complete `DocumentView` values after mutations, the history port returns bounded `ContributionPage` values, and the separate optional query capability returns `MaterializedRevision`. It has no event stream, optimistic expected-revision argument, partial-document API, total-history-count API, contributor-registration API, attachment API, or import API.

### `DocumentFileDialogs`

`src/persistence/fileDialogs.ts` owns native selection of document, export, and backup paths. `src/persistence/tauriFiles.ts` implements it with `@tauri-apps/plugin-dialog`. The standalone composition omits the port because browser downloads choose their destination according to browser policy.

### `MemoryDocumentGateway`

`src/persistence/memoryGateway.ts` stores:

- one current `DocumentView`;
- an in-memory `Contribution[]`;
- a `Map<number, StoredRevision>` containing a projected `DocumentState` and its commit-time hash for every runtime revision.

It uses `src/domain/tree.ts` for operations and structural validation and `src/domain/hash.ts` for SHA-256 hashes. It can create, edit, query history, materialize a detached verified revision, restore, and download exports. Materialization validates the revision key and tree, recomputes the snapshot hash, and does not change current state, history, or stored snapshots. It cannot open SQLite files, and closing or reloading destroys the document.

Memory history filters the complete newest-first runtime ledger before applying an exclusive `beforeRevision` cursor and page limit. JSON export writes an explicitly marked `coedit-recovery` `RecoveryExport` version-2 envelope containing algorithm/state hash, an explicit `DocumentState` projection, history order/completeness, and every contribution accumulated in that runtime, newest first. It does not serialize the internal revision-snapshot `Map`, and no importer exists.

### `TauriDocumentGateway`

`src/persistence/tauriGateway.ts` is intentionally thin. Each method validates only path presence where required and delegates to a named Tauri command with `invoke`. Rust owns durable validation, transactions, recovery metadata, sanitization, and file output.

The adapter implements both `DocumentGateway` and `NativeDocumentStorage`, exposing itself through `storage` with kind `native-file`. For history it requests one extra row, then converts the returned Rust array to `ContributionPage`. This makes the shared UI shape compatible, but does not remove Rust's existing 100,000-row pre-window; store-side SQL paging/filtering is second-pass work.

### Rust command and store layers

`src-tauri/src/lib.rs` contains the IPC boundary. `AppState` holds `Mutex<Option<DocumentStore>>`, so the running application has one current store and serializes command access to it. Tauri commands translate Rust errors to rejected invoke promises as strings.

`src-tauri/src/store.rs` contains schema creation, loading, validation, operations, revision history, restore, backup, and export. `src-tauri/src/models.rs` mirrors the camel-case TypeScript wire model with Serde.

```plantuml
@startuml
hide empty members

interface DocumentGateway {
  + storage: DocumentStorage
  + closeDocument()
  + applyOperation(operation, context): DocumentView
  + listContributions(query): ContributionPage
  + restoreRevision(revision, context): DocumentView
}

interface VolatileDocumentStorage {
  + kind: "volatile"
  + createDocument(title, contributor): DocumentView
  + exportDocument(format): ExportResult
}

interface NativeDocumentStorage {
  + kind: "native-file"
  + createDocument(path, title, contributor): DocumentView
  + openDocument(path): DocumentView
  + backupDocument(path): ExportResult
  + exportDocument(format, path): ExportResult
}

interface DocumentFileDialogs {
  + chooseDocumentToOpen()
  + chooseDocumentToCreate(suggestedName)
  + chooseExportPath(format, title)
  + chooseBackupPath(title)
}

class MemoryDocumentGateway {
  - current: DocumentView?
  - contributions: Contribution[]
  - revisions: Map<number, StoredRevision>
  + materializeRevision(revision): MaterializedRevision
  - download(name, content, type): ExportResult
}

class TauriDocumentGateway
object "tauriFileDialogs" as TauriFileDialogs

class AppState {
  document: Mutex<Option<DocumentStore>>
}

class DocumentStore {
  - path: PathBuf
  - connection: Connection
  - read_only: bool
  - recovery_warning: Option<String>
  + create(path, title, contributor): DocumentStore
  + open(path): DocumentStore
  + view(): DocumentView
  + apply(operation, context): DocumentView
  + contributions(query): Contribution[]
  + restore(revision, context): DocumentView
  + backup(destination): ExportResult
  + export(format, destination): ExportResult
}

MemoryDocumentGateway ..|> DocumentGateway
MemoryDocumentGateway ..|> VolatileDocumentStorage
TauriDocumentGateway ..|> DocumentGateway
TauriDocumentGateway ..|> NativeDocumentStorage
DocumentGateway o-- DocumentStorage
DocumentStorage <|-- VolatileDocumentStorage
DocumentStorage <|-- NativeDocumentStorage
TauriFileDialogs ..|> DocumentFileDialogs
DocumentGateway --> GatewayMode : mode
TauriDocumentGateway ..> AppState : Tauri commands
AppState *-- "0..1" DocumentStore
@enduml
```

## Domain and wire model

The TypeScript source of truth for frontend-facing shapes is `src/domain/types.ts`. The Rust transport equivalents are in `src-tauri/src/models.rs`. Serde uses `camelCase`, and `DocumentOperation` is a tagged union with a `type` field.

```plantuml
@startuml
hide methods

class DocumentState
class DocumentView {
  path: string?
  readOnly: boolean
  recoveryWarning: string?
}
class DocumentMetadata {
  id: string
  title: string
  formatVersion: number
  revision: number
  createdAt: string
  updatedAt: string
}
class DocumentNode {
  id: string
  parentId: string?
  position: number
  tags: string[]
  title: string
  bodyHtml: string
  yjsState: base64 string
  metadata: object
  deletedAt: string?
}
class Contributor
class WritingSession
class Contribution {
  revision: number
  operationType: string
  affectedNodeIds: string[]
  payload: object
  baseRevision: number
  resultingHash: string
}
class DocumentOperation <<tagged-union>>

DocumentState <|-- DocumentView
DocumentState *-- "1" DocumentMetadata
DocumentState *-- "0..*" DocumentNode
DocumentState *-- "0..*" Contributor
DocumentState *-- "0..*" WritingSession
DocumentNode "0..*" --> "0..1" DocumentNode : parent
Contribution --> Contributor : contributorId
Contribution --> DocumentOperation : payload represents
@enduml
```

The seven implemented operation variants are `createNode`, `updateNode`, `updateBody`, `moveNode`, `softDeleteNode`, `restoreNode`, and `renameDocument`. Contributions additionally use `createDocument` and `restoreRevision` as operation types.

## Implementation map

| Concern | File and symbol |
|---|---|
| Frontend domain and wire types | `src/domain/types.ts` |
| In-memory tree rules | `src/domain/tree.ts`: `applyOperation`, `assertValidTree`, `affectedNodeIds` |
| JSON validation/canonical encoding | `src/domain/json.ts`: `cloneJsonObject`, `canonicalJson`, `compareJsonStrings` |
| Browser canonicalization and hashing | `src/domain/hash.ts`: `DOCUMENT_HASH_ALGORITHM`, `toDocumentState`, `canonicalDocumentJson`, `hashDocument` |
| Persistence ports/page helpers | `src/persistence/gateway.ts`: `DocumentSession`, `ContributionHistory`, `DocumentStorage`, volatile/native variants, `DocumentGateway`, page/cursor helpers |
| File-dialog/filename contract | `src/persistence/fileDialogs.ts`: `DocumentFileDialogs`, `safeFilenameStem` |
| Application sequencing | `src/application/useDocumentController.ts`, `src/application/serializedTaskQueue.ts` |
| Browser sanitizer contract | `src/editor/sanitizeRichText.ts`, `fixtures/protocol/rich-text-v1.json` |
| Standalone adapter | `src/persistence/memoryGateway.ts`: `MemoryDocumentGateway` |
| Desktop adapter | `src/persistence/tauriGateway.ts`: `TauriDocumentGateway` |
| Native file dialogs | `src/persistence/tauriFiles.ts` |
| Standalone composition | `src/main.tsx` |
| Desktop composition | `src/main-tauri.tsx` |
| Rust wire/domain types | `src-tauri/src/models.rs` |
| Tauri state and commands | `src-tauri/src/lib.rs` |
| SQLite store | `src-tauri/src/store.rs`: `DocumentStore` |
| Schema constants | `src-tauri/src/models.rs`: `APPLICATION_ID`, `FORMAT_VERSION` |
| Tauri permissions | `src-tauri/capabilities/default.json` |
| Desktop build/runtime policy | `src-tauri/tauri.conf.json` |
| Format and recovery contract | `docs/DOCUMENT_FORMAT.md` |

### IPC command map

| Gateway method | Tauri command | Store operation |
|---|---|---|
| `createDocument` | `create_document` | `DocumentStore::create`, then `view` |
| `storage.openDocument` after `native-file` narrowing | `open_document` | `DocumentStore::open`, then `view` |
| `closeDocument` | `close_document` | Drop the store from `AppState` |
| `applyOperation` | `apply_operation` | `apply` |
| `listContributions` | `list_contributions` | `contributions` |
| `restoreRevision` | `restore_revision` | `restore` |
| `storage.backupDocument` after `native-file` narrowing | `backup_document` | `backup` |
| `exportDocument` | `export_document` | `export` |

## SQLite data model

Format version `1` is a SQLite database with application ID `0x434F4544`. The exact portable format is specified in [Document format](./DOCUMENT_FORMAT.md).

```plantuml
@startuml
hide methods

entity metadata {
  * key: TEXT <<PK>>
  --
  value: TEXT
}

entity contributors {
  * id: TEXT <<PK>>
  --
  display_name: TEXT
  kind: TEXT
  created_at: TEXT
}

entity writing_sessions {
  * id: TEXT <<PK>>
  --
  contributor_id: TEXT <<FK>>
  started_at: TEXT
  ended_at: TEXT?
  description: TEXT?
}

entity nodes {
  * id: TEXT <<PK>>
  --
  parent_id: TEXT? <<FK>>
  position: INTEGER
  tags_json: TEXT
  title: TEXT
  body_html: TEXT
  yjs_state: BLOB
  metadata_json: TEXT
  created_at: TEXT
  updated_at: TEXT
  deleted_at: TEXT?
}

entity contributions {
  * id: TEXT <<PK>>
  * revision: INTEGER <<UNIQUE>>
  --
  contributor_id: TEXT <<FK>>
  session_id: TEXT?
  group_id: TEXT?
  timestamp: TEXT
  operation_type: TEXT
  affected_node_ids_json: TEXT
  payload_json: TEXT
  base_revision: INTEGER
  resulting_hash: TEXT
  message: TEXT?
}

entity snapshots {
  * revision: INTEGER <<PK>>
  --
  state_json: TEXT
  state_hash: TEXT
  created_at: TEXT
}

entity attachments {
  * id: TEXT <<PK>>
  * checksum: TEXT <<UNIQUE>>
  --
  mime_type: TEXT
  filename: TEXT
  content: BLOB
  created_at: TEXT
}

contributors ||--o{ writing_sessions
contributors ||--o{ contributions
nodes |o--o{ nodes : parent / children
contributions .. snapshots : same revision by convention

note right of contributions
session_id is not a foreign key.
Affected node IDs are JSON, not relations.
end note

note right of attachments
Reserved: no command, gateway method,
or UI currently uses this table.
end note
@enduml
```

### Physical and logical relationships

- `contributors.id` is referenced by `writing_sessions.contributor_id` and `contributions.contributor_id`.
- `nodes.parent_id` is a nullable self-reference. A null parent denotes a root.
- `contributions.session_id` is descriptive text, not a foreign key.
- `contributions.affected_node_ids_json` can name nodes but is not relationally constrained.
- A contribution and snapshot normally share a revision, but the schema defines no foreign key between them.
- `metadata.revision` is stored as text and identifies the current materialized revision.
- `attachments` is reserved and disconnected from the current domain model.

The materialized node table includes deleted nodes. `deleted_at IS NULL` identifies active nodes. Active siblings are ordered by `position` and then ID where a stable tie-break is needed.

## Document lifecycle

### Create

`DocumentStore::create`:

1. rejects an existing destination, a destination without the exact lowercase `.coedit` extension, or a missing parent directory;
2. creates a uniquely named temporary SQLite file beside the destination;
3. initializes schema and PRAGMAs;
4. inserts metadata and the initial contributor in a transaction;
5. creates revision `0`, its `createDocument` contribution, SHA-256 state hash, and full snapshot in that transaction;
6. commits, runs `PRAGMA optimize`, closes the temporary database, and renames it to the requested path;
7. reopens it through the normal validation path.

Creation cleanup attempts to remove the temporary file after an error.

### Open

`DocumentStore::open`:

1. requires an existing regular file but does not require an extension;
2. notes whether a sibling SQLite `-journal` file exists;
3. probes `application_id` and `user_version` read-only;
4. chooses read-only mode for a version newer than the application and read-write mode otherwise;
5. opens with a five-second busy timeout and enables foreign keys;
6. runs `PRAGMA integrity_check` and requires `ok`;
7. verifies the metadata magic marker;
8. loads metadata, contributors, sessions, and nodes;
9. requires metadata `format_version` to equal SQLite `user_version`;
10. validates node identities, parent references, and cycles.

If a journal existed, the returned view contains a recovery warning. A newer file opens read-only only if its core version-1 tables and columns remain readable; forward compatibility is therefore best-effort, not guaranteed.

### Close

Desktop close replaces `AppState.document` with `None`, dropping the SQLite connection. Standalone close clears the current view, contributions, and revision map. Neither adapter prompts independently; close coordination belongs to `App`.

## Transactional mutation

Every desktop `applyOperation` reloads the current state, validates the contributor, and then commits the materialized change, metadata revision, contribution, and snapshot together.

```plantuml
@startuml
actor User
boundary "React component / editor" as UI
control App
participant TauriDocumentGateway as Gateway
participant "apply_operation command" as Command
control DocumentStore as Store
database SQLite

User -> UI : edit or tree action
UI -> App : callback(operation data)
App -> Gateway : applyOperation(operation, context)
Gateway -> Command : invoke("apply_operation", payload)
Command -> Store : apply(operation, context)
Store -> SQLite : load current DocumentState
Store -> Store : validate contributor
alt operation is accepted and storage succeeds
  Store -> SQLite : BEGIN
  opt context has sessionId
    Store -> SQLite : INSERT OR IGNORE writing_session
  end
  Store -> SQLite : apply materialized change
  Store -> SQLite : update revision and updated_at
  Store -> SQLite : reload state and validate tree
  Store -> Store : SHA-256(serialized DocumentState)
  Store -> SQLite : INSERT contribution
  Store -> SQLite : INSERT full snapshot
  Store -> SQLite : COMMIT
  Store --> Command : fresh DocumentView
  Command --> Gateway : serialized result
  Gateway --> App : updated view
else validation, serialization, SQL, or I/O error
  Store -> SQLite : ROLLBACK if a transaction is active
  Command --> Gateway : rejected invoke with error string
  Gateway --> App : rejected Promise
end
@enduml
```

The state read used to calculate `baseRevision` occurs before the SQL transaction begins. The process-local mutex serializes this application's calls, but cross-process collaborative editing is not a supported concurrency model.

### Operation enforcement

| Operation | Durable-store behavior |
|---|---|
| `createNode` | Requires a new ID and existing parent; clamps insertion index; shifts siblings; cleans title; limits body/Yjs; sanitizes HTML; decodes complete Yjs state; inserts; normalizes active sibling positions. |
| `updateNode` | Requires the node; cleans title; validates/normalizes tags; limits serialized metadata; changes tags/metadata as supplied; updates timestamp. |
| `updateBody` | Requires the node; checks body HTML and encoded-update size; decodes update and state; limits decoded complete state; sanitizes HTML; persists HTML and complete Yjs state. |
| `moveNode` | Requires node and target parent; rejects a descendant target; moves and normalizes both sibling groups. Final state loading also rejects cycles. |
| `softDeleteNode` | Uses a recursive CTE to timestamp the node and all descendants, then normalizes the former active sibling group. |
| `restoreNode` | Clears deletion on the node and its ancestors. It does not restore the node's deleted descendants. |
| `renameDocument` | Trims and limits title, using `Untitled document` when empty. |

The memory adapter performs the corresponding structural transformations in `src/domain/tree.ts`, but it does not implement the Rust store's size checks or independent Ammonia sanitization.

## Invariants and limits

The desktop store enforces these invariants when loading and after mutation:

- node IDs are unique;
- every non-null parent exists;
- the parent graph contains no cycle;
- a contributor named in a mutation is registered in the document;
- newer supported-looking formats are not mutated;
- active sibling positions are normalized after operations that affect ordering;
- contribution revisions are unique;
- current revision, contribution, and snapshot advance atomically for ordinary mutations.

Current Rust limits use UTF-8 byte length:

| Value | Limit |
|---|---:|
| Title | 4,096 bytes |
| Serialized metadata JSON | 1 MiB |
| Body HTML | 16 MiB |
| Decoded complete Yjs state | 32 MiB |
| Encoded Yjs update string | 64 MiB |

The Yjs update is base64-decoded for validity but is not interpreted or applied by Rust. The caller-supplied complete Yjs state is authoritative. The store does not prove that `bodyHtml`, `yjsUpdate`, and `yjsState` represent identical content.

## Contributions, hashes, and snapshots

Each contribution records:

- a UUID and unique revision;
- contributor identity and kind (the latter is resolved when reading);
- optional session, group, and message;
- UTC timestamp;
- operation type, affected node IDs, and serialized payload;
- base revision;
- SHA-256 hash of the resulting state.

The desktop hash remains SHA-256 over Serde's JSON encoding of `DocumentState`. It covers document metadata, nodes, contributors, and sessions. It does not cover the contribution ledger, snapshots table, attachments, view path, read-only state, or recovery warning.

The current implementation writes but never verifies `contributions.resulting_hash` or `snapshots.state_hash`. Opening does not replay the contribution ledger, and restore does not compare a snapshot with its stored hash. These are useful recorded checksums, not a tamper-evidence or authenticity guarantee.

The standalone adapter now names its algorithm `coedit-document-state-v1`. It explicitly projects a `DocumentState` (excluding `path`, `readOnly`, and `recoveryWarning`), sorts node/contributor/session collections by ID, recursively sorts object keys, UTF-8 encodes the compact JSON, and calculates SHA-256 with Web Crypto. `fixtures/protocol/document-hash-v1.json` fixes the canonical bytes and digest for TypeScript tests. Rust has not yet implemented or been tested against that fixture, so cross-adapter hash equality remains unproven second-pass work.

Every revision currently stores a full `DocumentState` JSON snapshot. This makes restore direct but can cause substantial database growth. There is no compactor.

The proposed checkpoint strategy continues to use ordinary physical `updateBody` revisions and full snapshots, but assigns one `groupId` across threshold checkpoints in the same semantic edit episode and collapses them in History. That improves history presentation; it does not solve physical snapshot growth. See [Body checkpoint strategy](./proposals/BODY_CHECKPOINT_STRATEGY.md) and risk R-12.

### History queries

The shared contract returns `ContributionPage { items, nextBeforeRevision, hasMore }`. The default page is 100 and callers are capped at 500. Adapters fetch or retain one extra matching record to determine `hasMore`; when more exists, the last returned revision becomes the exclusive cursor for the next request. Search, node, and contributor filters are part of the gateway query, not a client-side pass over already loaded rows.

The memory adapter reverses and filters its complete runtime array before page construction, so every in-memory contribution remains reachable through **Load older contributions**.

The current Rust store still reads at most the newest 100,000 contributions, then applies `beforeRevision`, contributor, node, and text filters in Rust. `TauriDocumentGateway` asks it for `page size + 1` and wraps the array. Consequently, the desktop shape supports paging but a match older than the database pre-window remains unreachable. Moving cursor/filter predicates and `LIMIT` into indexed SQL belongs to the Tauri second pass.

The proposed grouped History projection does not assume one raw page contains an entire edit group. It coalesces matching boundary rows while pages accumulate, marks an oldest loaded group partial when `hasMore` leaves its beginning unknown, keeps loaded raw-contribution and visible-row counts distinct, and uses an exact paged `groupId` query to expand all checkpoints. The memory adapter supplies that query for the standalone milestone; native SQL parity belongs to the proposal's WP-10. See [Groups that cross history pages](./proposals/BODY_CHECKPOINT_STRATEGY.md#groups-that-cross-history-pages).

## Revision restore

Restore never rewinds or deletes the ledger. It uses a prior snapshot as content for a new revision:

1. validate write permission and contributor;
2. load the requested snapshot JSON;
3. begin a transaction and defer foreign-key checking;
4. optionally create a writing session;
5. replace all nodes from the snapshot, sanitizing their HTML and decoding Yjs state;
6. restore the snapshot title while retaining current document identity, format metadata, contributors, and sessions;
7. allocate `current revision + 1`;
8. hash the restored materialized state;
9. append a `restoreRevision` contribution and a new full snapshot;
10. commit and return the new view.

```plantuml
@startuml
actor User
boundary HistoryPanel
control App
participant DocumentGateway as Gateway
control DocumentStore as Store
database SQLite

User -> HistoryPanel : restore revision R
HistoryPanel -> App : onRestore(R)
App -> Gateway : restoreRevision(R, context)
Gateway -> Store : restore(R, context)
Store -> SQLite : SELECT state_json\nWHERE revision = R
SQLite --> Store : target DocumentState
Store -> SQLite : BEGIN\nDELETE and INSERT nodes
Store -> SQLite : update title, revision, timestamp
Store -> Store : reload, validate, hash
Store -> SQLite : INSERT restore contribution\nINSERT new snapshot\nCOMMIT
Store --> Gateway : DocumentView at current+1
Gateway --> App : replace view
@enduml
```

## Revision-query port and controller projection — standalone WP-1/WP-2 implemented

[`gateway.ts`](../src/persistence/gateway.ts) now defines a discriminated `RevisionQueryCapability` containing `DocumentRevisionQueries.materializeRevision(revision)`. The memory implementation reads its hash-bearing runtime revision map, validates and detaches the state, recomputes the browser canonical hash, and returns a verified `MaterializedRevision` without replacing current state, appending a contribution, incrementing revision, or writing another snapshot.

The standalone composition advertises the memory query as `available`. The Tauri composition compiles with the same capability boundary but advertises `host-deferred`; it supplies no throwing query stub. WP-10 adds the read-only Rust query/IPC and makes Tauri advertise availability only after shared contract tests pass.

`restoreRevision` remains the mutating command described above. Viewing and restoration do not share an implementation that temporarily changes the live memory store. WP-1 covers memory validation and missing/tampered snapshot behavior. WP-2 adds controller request/workspace guards, exact retained origins, explicit live/historical modes, no-query Back, and restore-success/failure transitions. Native contract tests remain later work.

`App` now passes the capability into `useDocumentController`, which consumes it through `viewRevision()`. `HistoryPanel` does not expose that intent yet, so no read-only historical view is currently reachable through the product UI. Presentation is WP-3.

No document-schema change is required merely to read and verify existing snapshots under their host/schema algorithm. Cross-adapter canonical hash alignment and future compaction remain separate format/version decisions.

### Proposed navigator persistence boundary — not implemented

The optional navigation-only sidebar consumes the active live or historical workspace projection and adds no gateway, SQLite, snapshot, contribution, or export field. Its selection, expansion, compact-drawer, focus-region, canvas-context, one-shot editor-resume candidate, page-session History dock request/data generation, and scroll state are transient UI/application state. A composition may remember only validated, versioned preferred Navigator dock visibility in browser-local presentation storage: an absent/invalid initial read defaults closed, while a later write failure retains the in-memory session choice. That preference is deliberately outside `DocumentState`, canonical hashing, History, recovery output, and adapter parity. See [Document format](./DOCUMENT_FORMAT.md#navigator-state-is-not-document-data).

In the current as-built open/restore paths, snapshot hashes are not verified and restore does not reapply every normal mutation size limit. Tree validation during the transactional reload still rejects missing parents and cycles. Those current limitations do not weaken the proposed query contract's verify-before-return requirement.

## Backup and export

### Desktop backup

`DocumentStore::backup` runs `PRAGMA optimize` for a writable document, copies the SQLite file to a temporary file in the destination directory, calls `sync_all`, and replaces the destination by rename. The normal UI suggests `.coedit-backup`. This is a SQLite copy, not a custom archive.

The normal open dialog filters for `.coedit`, not `.coedit-backup`; the store itself will open either extension. See the recovery procedure in [Document format](./DOCUMENT_FORMAT.md).

### Desktop JSON export

The JSON envelope contains `exportVersion`, `exportedAt`, the complete current `state`, and at most the newest 100,000 `contributions`. It is human-inspectable but not accepted by any importer because no import workflow exists.

### Desktop Markdown export

Markdown visits active nodes depth-first, using document/node titles as headings and a simple body-HTML-to-plain-text conversion. It omits tags, deleted nodes, structured rich-text markup, Yjs state, metadata, contributors, sessions, revisions, history, and attachments.

### Output replacement

Desktop exports and backups write or copy a temporary file in the destination directory, sync the file, and rename it into place. Replacing an existing destination first renames the old destination and attempts rollback if the final rename fails. Parent-directory metadata is not explicitly synchronized.

## Standalone and desktop parity

| Capability | Standalone `MemoryDocumentGateway` | Desktop `TauriDocumentGateway` / `DocumentStore` |
|---|---|---|
| Create | In memory; path ignored | New `.coedit` file; path required |
| Open `.coedit` | Rejected | Validated SQLite open |
| Lifetime | Until close/reload/tab loss | Durable file |
| Tree operations | TypeScript domain rules | Rust validation and SQL |
| Sanitization/limits at gateway boundary | JSON-only detachment/validation plus centralized rich-text sanitization; no Rust-equivalent byte limits | Ammonia, base64, tree, and byte-size validation |
| Contributions | Runtime array | SQLite ledger |
| Sessions | Never populated | Lazily inserted when context supplies an ID |
| Restore | Runtime revision map | SQLite full snapshots |
| Revision materialization query | Available; detached, tree-validated, browser-hash-verified | Explicitly `host-deferred`; no throwing stub |
| Hash | Browser Web Crypto, JS canonicalization | Rust SHA-256 over Serde JSON |
| Storage capability | `VolatileDocumentStorage`: pathless create/export | `NativeDocumentStorage`: path-required create/open/export/backup |
| JSON export | Marked `coedit-recovery` version-2 envelope: algorithm/hash, portable state, explicit complete runtime ledger | Legacy version-1 state/contributions envelope capped by the current store query |
| Markdown export | DOM parser to text | Rust tag stripping to text |
| Path selection | Browser download behavior | Native dialogs |

The adapters now share the cursor-page shape, centralized `ExportFormat`, and portable filename helper. They still do not share a recovery-envelope schema, byte-compatible storage contract, canonical hash implementation, sanitizer oracle, limits, session semantics, Markdown conversion, or import path. Rust conformance/schema work is explicitly deferred to the second pass.

## Concurrency, durability, and trust boundaries

- `AppState` permits one open desktop document and serializes its commands with a mutex.
- SQLite has a five-second busy timeout. Multiple application processes editing one file are not a supported collaboration mechanism.
- Frontend document commands are serialized by `SerializedTaskQueue`; the Tauri command mutex independently serializes native store access. Operations still do not carry a caller-supplied expected revision. The store determines `baseRevision` from its current load.
- Schema creation selects SQLite `DELETE` journal mode so a closed document normally consists of one portable file.
- Desktop writes use transactions; create and exported outputs also use same-directory temporary files and rename.
- `.coedit` files, snapshot JSON, stored metadata, and HTML are untrusted input. Open performs structural checks; frontend and Rust mutation paths provide separate HTML-sanitization boundaries. See [Security](./SECURITY.md).
- The ledger is append-only through `DocumentStore`, but SQLite contains no trigger or signature preventing direct modification.
- Documents and exports are not encrypted.

## Extension playbooks

### Add a document operation

1. Add the tagged union member to `DocumentOperation` in `src/domain/types.ts`.
2. Implement its in-memory effect and affected-node reporting in `src/domain/tree.ts`.
3. Add the matching Serde variant in `src-tauri/src/models.rs`.
4. Update Rust `operation_type` and `affected_node_ids`.
5. Implement validation and mutation in `DocumentStore::apply_sql`.
6. Initiate it from the owning UI component and dispatch/orchestrate it through `useDocumentController`.
7. Add TypeScript domain/memory tests and Rust success, rollback, history, and restore tests.
8. Update [Traceability](./TRACEABILITY.md), [Sequence diagrams](./SEQUENCE_DIAGRAMS.md), and this operation table.

### Change the schema or persisted model

1. Decide whether the change is backward-compatible at the table and JSON levels.
2. Update Rust models, schema, loaders, writers, snapshots, hashes, and exports.
3. Bump `FORMAT_VERSION` and SQLite `user_version` for an incompatible change.
4. Implement and test an explicit migration before treating an older version as writable; no migration framework exists today.
5. Preserve or deliberately change application ID and metadata magic semantics.
6. Update [Document format](./DOCUMENT_FORMAT.md) and add fixture-based compatibility/recovery tests.

### Add a persistence adapter

1. Implement the shared session/history/export ports and declare durability semantics.
2. Implement only the applicable `VolatileDocumentStorage` or `NativeDocumentStorage` variant; do not add methods that merely reject in hosts without native access.
3. Wire it in a dedicated composition root; do not add environment probing to shared UI code.
4. Define attribution, sanitization, tree validation, paging, restore, backup, and export behavior.
5. Reuse or extract gateway contract tests so parity is intentional.

### Add an export format

1. Extend `ExportFormat` in `src/domain/types.ts` and let gateway/dialog/controller references consume it.
2. Implement both adapters or explicitly mark one unsupported.
3. Extend the Tauri command/store dispatch and file filter.
4. Define whether the format is lossless, attributable, and importable.
5. Add unsafe-content, destination-overwrite, and representative hierarchy tests.

### Add contributors and session lifecycle

1. Add explicit gateway and Rust commands for registration/selection and session start/end.
2. Add transactional store methods and decide duplicate-ID behavior.
3. Decide whether `contributions.session_id` should become a foreign key.
4. Replace the UI's first-contributor fallback with an explicit identity flow.
5. Test opening on a machine whose local profile is not already registered.

### Activate attachments

Define a domain model and gateway first. Then add store commands, checksum validation, document references, size limits, export/recovery behavior, and security tests. The existing table alone does not constitute attachment support.

## Verification and known gaps

Current persistence tests are listed in [Testing strategy](./TESTING.md). Memory tests cover attribution/restore, detached and non-mutating verified materialization, invalid/missing/corrupt snapshot rejection, boundary sanitization and JSON detachment/validation, cursor paging and filter-before-page semantics, complete runtime recovery export, and filename normalization. Separate TypeScript fixtures cover canonical hash and browser sanitization. Rust tests still cover cycle rejection, HTML sanitization, and a create-edit-restore-backup-export-reopen path; they do not yet consume the new protocol fixtures.

Priority missing coverage includes format migration, native/open/restore hash verification, adapter parity, transaction failure injection, size boundaries, read-only behavior, history beyond 100,000 entries, contributor/session integrity, overwrite failures, and simultaneous access. Memory materialization now covers invalid revision keys, missing snapshots, detached results, non-mutation, mismatched hashes, and structurally invalid snapshots.

The definitive triage list, including uncontrolled host-exit lifecycle and cross-adapter/native parity risks, is [Known limitations](./KNOWN_LIMITATIONS.md).
