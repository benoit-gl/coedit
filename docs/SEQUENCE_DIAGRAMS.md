# Sequence diagrams

This document is the RUP interaction view for Coedit Local. It traces important use cases through the current implementation and names the files that own each step.

Every diagram below describes current code unless a note explicitly marks deferred second-pass Tauri work. Notes labeled **Current limitation** identify observed behavior rather than intended behavior.

Related documents:

- [Documentation index](README.md)
- [Repository overview](../README.md)
- [Architecture](ARCHITECTURE.md)
- [Frontend design](FRONTEND_DESIGN.md)
- [Persistence design](PERSISTENCE_DESIGN.md)
- [UI and UX specification](UI_UX.md)
- [Feature-to-code traceability](TRACEABILITY.md)
- [Known limitations](KNOWN_LIMITATIONS.md)

## Participants and notation

| Diagram name | Implementation |
|---|---|
| `App` | Presentation boundary in `src/App.tsx` |
| `Controller` | `useDocumentController` in `src/application/useDocumentController.ts` |
| `Queue` | `SerializedTaskQueue` in `src/application/serializedTaskQueue.ts` |
| `MemoryGateway` | `MemoryDocumentGateway` in `src/persistence/memoryGateway.ts` |
| `TauriGateway` | `TauriDocumentGateway` in `src/persistence/tauriGateway.ts` |
| `Dialogs` | `tauriFileDialogs` in `src/persistence/tauriFiles.ts` |
| `Commands` | Tauri commands in `src-tauri/src/lib.rs` |
| `Store` | `DocumentStore` in `src-tauri/src/store.rs` |
| `SQLite` | The current `.coedit` database connection |

Solid return arrows show relevant returned values, not every JavaScript or Rust stack return. A Tauri `invoke` serializes camel-case TypeScript values to the Serde models in `src-tauri/src/models.rs` and serializes the result back.

## Standalone bootstrap

**Implemented.** This is the double-clicked `dist/index.html` path produced by the default build. It does not start or contact a local server.

```plantuml
@startuml
title Standalone HTML bootstrap (implemented)
actor User
participant "Operating system" as OS
participant "Browser" as Browser
participant "dist/index.html\n(generated)" as Html
participant "inline bundle from\nsrc/main.tsx" as Main
participant "MemoryDocumentGateway" as Memory
participant "App" as App
database "localStorage" as LocalStorage

User -> OS : double-click dist/index.html
OS -> Browser : open file://.../dist/index.html
Browser -> Html : read one local HTML file
note right of Html
  Generated JavaScript and CSS are inline.
  The generated CSP has connect-src 'none'.
end note
Html -> Main : execute inline ES module
Main -> Memory : new MemoryDocumentGateway()
Main -> App : mount App with injected gateway
App -> LocalStorage : getItem("coedit-local-contributor")
alt stored preference parses
  LocalStorage --> App : Contributor JSON
else missing, inaccessible, or corrupt
  App -> App : newId(); create "Local author"
end
App --> Browser : render standalone Welcome
note over Browser,Memory
  No HTTP request, Tauri invoke, SQLite access,
  or durable document restore occurs.
end note
@enduml
```

The repository-source `index.html` still references `/src/main.tsx` and normally needs Vite. The self-contained behavior belongs to the generated `dist/index.html` created by `standaloneHtml()` in `vite.config.ts`.

## Create a standalone document

**Implemented.** Standalone create does not ask for a path; `App` passes `null` to the gateway.

```plantuml
@startuml
title Create document in standalone mode (implemented)
actor User
participant "App\nsrc/App.tsx" as App
participant "useDocumentController" as Controller
participant "SerializedTaskQueue" as Queue
participant "MemoryDocumentGateway" as Memory
participant "newId()" as Ids
participant "hashDocument()" as Hash

User -> App : enter contributor/title
User -> App : Create document
App -> Controller : createDocument(newTitle)
Controller -> Queue : enqueue create command; busyCount++
Queue -> Memory : createDocument(null, newTitle, profile)
Memory -> Ids : document and contribution IDs
Memory -> Memory : create revision-0 DocumentView\nwith contributor and empty nodes/sessions
Memory -> Hash : SHA-256 of initial state
Hash --> Memory : resultingHash
Memory -> Memory : append createDocument contribution
Memory -> Memory : revisions.set(0, cloned state)
Memory --> Queue : detached DocumentView
Queue --> Controller : created view
Controller -> Controller : acceptView(epoch/revision, authoritative reset)
Controller -> Controller : increment editorGeneration; mark History stale until opened; status
Controller -> App : view + history state; busyCount--
App --> User : render empty Workspace
@enduml
```

The initial contribution has revision `0`, base revision `-1`, operation type `createDocument`, and message `Created document`.

## Create a desktop document

**Implemented.** The UI selects a destination before `run()` invokes the gateway. `DocumentStore::create` builds a temporary database, commits its initial state, atomically renames it, and then reopens it through the normal validation path.

```plantuml
@startuml
title Create .coedit document in Tauri (implemented)
actor User
participant "App" as App
participant "useDocumentController" as Controller
participant "SerializedTaskQueue" as Queue
participant "tauriFileDialogs" as Dialogs
participant "TauriDocumentGateway" as Gateway
participant "Tauri invoke" as IPC
participant "create_document\nsrc-tauri/src/lib.rs" as Command
participant "DocumentStore\nsrc-tauri/src/store.rs" as Store
database "temporary SQLite file" as Temp
participant "File system" as FS
collections "AppState.document\nMutex of optional DocumentStore" as State

User -> App : Create document
App -> Controller : createDocument(newTitle)
Controller -> Dialogs : chooseDocumentToCreate(newTitle)
Dialogs -> User : native Save dialog (.coedit)
alt user cancels
  User --> Dialogs : null
  Dialogs --> Controller : null
  App --> User : remain on Welcome
else path selected
  User --> Dialogs : destination path
  Dialogs --> Controller : path
  Controller -> Queue : enqueue create command
  Queue -> Gateway : createDocument(path, title, profile)
  Gateway -> IPC : invoke("create_document", payload)
  IPC -> Command : create_document(...)
  Command -> Store : DocumentStore::create(path, title, contributor)
  Store -> FS : validate unused .coedit path and destination folder
  Store -> Temp : open unique .coedit.tmp-UUID
  Store -> Temp : application/user version and schema;\nFULL synchronous; DELETE journal
  Store -> Temp : transaction: metadata + contributor
  Store -> Temp : state hash + revision-0 contribution + snapshot
  Store -> Temp : commit; PRAGMA optimize; close
  Store -> FS : rename temporary file to destination
  Store -> Store : Self::open(path) validation
  Store --> Command : DocumentStore
  Command -> Store : view()
  Store --> Command : DocumentView
  Command -> State : replace current store
  Command --> IPC : DocumentView
  IPC --> Gateway : Promise<DocumentView>
  Gateway --> Queue : DocumentView
  Queue --> Controller : DocumentView
  Controller -> Controller : acceptView(workspace epoch, authoritative reset)
  Controller -> Controller : increment editorGeneration; mark History stale until opened
  Controller --> App : render state
  App --> User : render Workspace
end
@enduml
```

If creation fails before the final rename, `DocumentStore::create` attempts to remove the temporary file and returns an error. The controller's `executeMutation()` path presents gateway errors in the error banner and leaves later queue tasks runnable.

## Open and validate a desktop document

**Implemented.** Opening is desktop-only. Validation happens before the new store replaces the current `AppState.document` value.

```plantuml
@startuml
title Open and validate .coedit document (implemented)
actor User
participant "App" as App
participant "useDocumentController" as Controller
participant "SerializedTaskQueue" as Queue
participant "tauriFileDialogs" as Dialogs
participant "TauriDocumentGateway" as Gateway
participant "open_document command" as Command
participant "DocumentStore::open" as Store
database ".coedit SQLite" as SQLite
collections "AppState.document" as State

User -> App : Open .coedit file
App -> Controller : openDocument()
Controller -> Dialogs : chooseDocumentToOpen()
Dialogs -> User : native Open dialog (coedit filter)
alt cancel
  User --> Controller : no path; remain on Welcome
else selected path
  User --> Dialogs : path
  Dialogs --> Controller : path
  Controller -> Queue : enqueue open command
  Queue -> Gateway : storage.openDocument(path)\n(after native-file narrowing)
  Gateway -> Command : invoke("open_document", { path })
  Command -> Store : DocumentStore::open(path)
  Store -> Store : require path.is_file()
  Store -> Store : record whether path + "-journal" exists
  Store -> SQLite : read-only probe: PRAGMA application_id, user_version
  SQLite --> Store : identifiers
  Store -> Store : require APPLICATION_ID
  Store -> Store : readOnly = user_version > FORMAT_VERSION
  Store -> SQLite : reopen read-only or read-write
  Store -> SQLite : busy timeout; foreign_keys = ON
  Store -> SQLite : PRAGMA integrity_check
  SQLite --> Store : "ok" or failure detail
  Store -> SQLite : require metadata magic marker
  Store -> SQLite : load metadata, contributors, sessions, nodes
  Store -> Store : parse enums/JSON; validate parent links and cycles
  Store -> Store : require metadata format == user_version
  Store -> Store : attach recovery warning if journal pre-existed
  Store --> Command : validated DocumentStore
  Command -> Store : view() (reload state)
  Store --> Command : DocumentView
  Command -> State : replace current store
  Command --> Gateway : DocumentView
  Gateway --> Queue : DocumentView
  Queue --> Controller : DocumentView
  Controller -> Controller : acceptView(new workspace epoch, authoritative reset)
  Controller -> Controller : increment editorGeneration; mark History stale until opened
  Controller --> App : view + history state
  App --> User : Workspace + optional read-only/recovery banner
end

alt any validation or I/O error
  Store --> Command : StoreError
  Command --> Gateway : rejected invoke with message
  Gateway --> Queue : rejected Promise
  Queue --> Controller : rejection; queue tail recovers
  Controller --> App : error state
  App --> User : error banner; view remains null
end
@enduml
```

A file whose SQLite `user_version` is newer than the supported format is reopened read-only, provided the current core tables can still be loaded. There is no schema migration path in the current store.

## Apply a structural or metadata operation

**Implemented.** This covers `createNode`, `updateNode`, `moveNode`, `softDeleteNode`, `restoreNode`, and `renameDocument`. `updateContent` travels through the same gateway operation but has the editor-specific preparation shown in the next diagram.

```plantuml
@startuml
title Apply DocumentOperation across adapters (implemented)
actor User
participant "Outline / NodeEditor / Header" as Component
participant "App" as App
participant "useDocumentController" as Controller
participant "DraftTransitionCoordinator" as Drafts
participant "title + node-editor participants" as Participants
participant "SerializedTaskQueue" as Queue
participant "DocumentGateway" as Gateway
participant "MemoryDocumentGateway" as Memory
participant "domain/tree.ts" as Tree
participant "TauriDocumentGateway" as Tauri
participant "apply_operation command" as Command
participant "DocumentStore" as Store
database "SQLite" as SQLite

User -> Component : add/edit/move/delete/rename
Component -> App : callback(operation)
App -> Controller : applyOperation(operation, message, group)
Controller -> Drafts : begin()
Drafts -> Participants : freeze() synchronously
Controller -> Participants : flush title/metadata/rich text
Participants --> Controller : resolved (or abort action with visible error)
Controller -> Controller : context(contributor, session, message, group)
Controller -> Queue : enqueue mutation
Queue -> Gateway : applyOperation(operation, context)

alt standalone adapter
  Gateway -> Memory : applyOperation(...)
  Memory -> Memory : require current and writable; load base revision
  Memory -> Tree : applyOperation(cloned state, operation, now)
  Tree -> Tree : mutate; normalize positions; assertValidTree
  Tree --> Memory : updated state
  Memory -> Memory : revision = base + 1; require contributor
  Memory -> Memory : hash; append contribution; snapshot revision
  Memory --> Gateway : cloned DocumentView
else Tauri adapter
  Gateway -> Tauri : applyOperation(...)
  Tauri -> Command : invoke("apply_operation", payload)
  Command -> Store : apply(operation, context) under document mutex
  Store -> SQLite : load current state; require writable/contributor
  Store -> SQLite : begin transaction
  opt context has sessionId
    Store -> SQLite : INSERT OR IGNORE writing session
  end
  Store -> SQLite : apply_sql(operation) + validations/sanitization
  Store -> SQLite : update revision and updated_at
  Store -> SQLite : reload state; SHA-256 hash
  Store -> SQLite : insert contribution and full snapshot
  Store -> SQLite : commit transaction
  Store --> Command : fresh DocumentView
  Command --> Tauri : serialized result
  Tauri --> Gateway : DocumentView
end

Gateway --> Queue : complete updated DocumentView
Queue --> Controller : updated view
Controller -> Controller : accept only current epoch/non-older revision
opt History is open
  Controller -> Gateway : listContributions(active filters, limit: 100)
  Gateway --> Controller : ContributionPage
else History is closed
  Controller -> Controller : mark History stale for next open
end
Controller -> Participants : unfreeze() in reverse order
Controller --> App : current view/history/status
App --> Component : rerender from returned state
@enduml
```

Both adapters return a complete materialized view after every successful mutation. Components do not mutate `view.nodes` directly.

## Rich-text/Yjs commit after 1.2 seconds

**Implemented.** The quiet-period timer starts only after a Yjs update. No gateway operation occurs for each keystroke.

```plantuml
@startuml
title Debounced rich-text contribution (implemented)
actor User
participant "Tiptap Editor" as Tiptap
participant "Y.Doc\nfield: content" as YDoc
participant "RichTextEditor" as Rich
participant "window timer" as Timer
participant "DOMPurify" as Purify
participant "NodeEditor" as NodeEditor
participant "App" as App
participant "useDocumentController" as Controller
participant "SerializedTaskQueue" as Queue
participant "DocumentGateway" as Gateway

note over Rich,YDoc
  On mount, createYDoc(node.yjsState) loads a full update
  with origin "persistence-load". That origin is ignored by
  the persistence listener.
end note

loop each edit in a typing burst
  User -> Tiptap : type or formatting command
  Tiptap -> YDoc : collaboration transaction
  YDoc -> Rich : update(bytes, origin)
  Rich -> Rich : pendingUpdates.push(update)
  opt prior timer exists
    Rich -> Timer : clearTimeout(previous)
  end
  Rich -> Timer : setTimeout(flush, 1200 ms)
end

... 1.2 seconds with no new Yjs update ...
Timer -> Rich : flush()
Rich -> Rich : cancel timer; start one drain Promise
Rich -> Rich : Y.mergeUpdates(pendingUpdates); clear queue
Rich -> Tiptap : getHTML()
Tiptap --> Rich : materialized HTML
Rich -> Purify : sanitizeRichText() using coedit-rich-text-v1
Purify --> Rich : clean HTML
Rich -> YDoc : Y.encodeStateAsUpdate(document)
YDoc --> Rich : complete binary state
Rich -> Rich : Base64 merged update + complete state
Rich -> NodeEditor : onCommit(html, update, state)
NodeEditor -> App : onContentChange(...)
App -> Controller : commitContent(...)
Controller -> Controller : newId() for this contribution group
Controller -> Queue : enqueue updateContent
Queue -> Gateway : applyOperation(updateContent, context)
Gateway --> Queue : updated DocumentView
Queue --> Controller : updated view
loop updates arrived while persistence was pending
  Rich -> Rich : merge/sanitize/encode next pending batch
  Rich -> Controller : commitContent(next batch)
  Controller -> Queue : enqueue next updateContent
end
opt History is open
  Controller -> Gateway : refresh first history page
  Gateway --> Controller : ContributionPage
else History is closed
  Controller -> Controller : mark History stale for next open
end
App --> User : saved status and rerender

alt commit rejects
  Gateway --> Rich : rejection through controller/callback
  Rich -> Rich : prepend merged delta to pendingUpdates
  Rich --> Controller : rejected flush; controlled action is canceled
end
@enduml
```

`RichTextEditor` exposes a participant to `NodeEditor`; `NodeEditor` combines its metadata drain with the rich-text drain and registers that aggregate with the controller. The document title registers separately. Controlled selection, operations, restore, export, backup, and Close synchronously freeze these drafts and await them rather than depending on unmount cleanup. In the desktop branch, Rust decodes both Base64 values, enforces content/Yjs size limits, independently sanitizes HTML with Ammonia, and writes the complete Yjs state. Rust sanitizer-fixture parity remains second-pass work.

## Load, filter, and page history

**Implemented for the standalone adapter and shared UI.** Filtering is part of the gateway query and occurs before page construction. The controller requests 100 entries at a time and the panel exposes **Load older contributions** while `hasMore` is true.

```plantuml
@startuml
title Cursor-paged contribution history (implemented)
actor User
participant HistoryPanel as Panel
participant useDocumentController as Controller
participant DocumentGateway as Gateway
participant MemoryDocumentGateway as Memory
participant TauriDocumentGateway as Tauri
participant "DocumentStore::contributions" as Store
database "SQLite contributions" as SQLite

User -> Panel : open History
Panel -> Controller : setHistoryOpen(true)
Controller -> Gateway : listContributions(filters, limit=100)
alt standalone
  Gateway -> Memory : listContributions(query)
  Memory -> Memory : newest-first complete ledger
  Memory -> Memory : filter search/node/contributor/beforeRevision
  Memory -> Memory : take limit+1; build ContributionPage
  Memory --> Controller : items, exclusive nextBeforeRevision, hasMore
else desktop adapter (pass-2 store limitation remains)
  Gateway -> Tauri : listContributions(query)
  Tauri -> Store : invoke with limit=101
  Store -> SQLite : SELECT newest 100000 rows
  SQLite --> Store : rows
  Store -> Store : apply query filters; stop at 101
  Store --> Tauri : Contribution[]
  Tauri -> Tauri : expose first 100 as ContributionPage
  Tauri --> Controller : page
end
Controller -> Controller : accept only current request + workspace epoch
Controller -> Panel : items, loading, error, hasMore

loop debounced query change
  User -> Panel : type search / toggle selected idea
  Panel -> Panel : wait 250 ms
  Panel -> Controller : updateHistoryQuery(filters)
  Controller -> Gateway : first page for normalized filters
end

opt hasMore
  User -> Panel : Load older contributions
  Panel -> Controller : loadOlderHistory()
  Controller -> Gateway : same filters, beforeRevision=cursor, limit=100
  Gateway --> Controller : next page
  Controller -> Controller : append unseen contribution IDs
end
@enduml
```

The header count is the number of loaded entries and appends `+` while another page is known to exist; it is not a ledger total. A superseded search/page response is ignored. History failures appear independently from a mutation that already succeeded. In standalone mode the entire runtime ledger is reachable; desktop matching entries older than Rust's 100,000-row pre-window remain a documented second-pass limitation.

## Restore a revision as a compensating contribution

**Implemented.** Restore does not delete later ledger records or move the revision counter backward. It creates a new current revision from an earlier snapshot.

```plantuml
@startuml
title Compensating revision restore (implemented)
actor User
participant "HistoryPanel" as Panel
participant "App" as App
participant "useDocumentController" as Controller
participant "DraftTransitionCoordinator" as Drafts
participant "title + node-editor participants" as Participants
participant "SerializedTaskQueue" as Queue
participant "DocumentGateway" as Gateway
participant "MemoryDocumentGateway" as Memory
participant "Tauri DocumentStore" as Store
database "SQLite" as SQLite

User -> Panel : Restore on revision R
Panel -> App : onRestore(R)
App -> User : confirm restore; current state remains in history
alt user cancels
  User --> App : cancel
else user confirms
  App -> Controller : restoreRevision(R)
  Controller -> Drafts : begin(); freeze participants synchronously
  Controller -> Participants : flush title/metadata/rich text
  Participants --> Controller : resolved (or cancel restore on error)
  Controller -> Queue : enqueue restoreRevision(R, context)
  Queue -> Gateway : restoreRevision(R, context)
  alt standalone
    Gateway -> Memory : restoreRevision(R, context)
    Memory -> Memory : require current/contributor; revisions.get(R)
    Memory -> Memory : clone target; preserve current path/contributors
    Memory -> Memory : new revision = current + 1; update time
    Memory -> Memory : hash; append restoreRevision contribution
    Memory -> Memory : snapshot new revision
    Memory --> Gateway : restored DocumentView
  else desktop
    Gateway -> Store : invoke restore_revision under mutex
    Store -> SQLite : require writable/current contributor
    Store -> SQLite : SELECT snapshot state_json WHERE revision = R
    Store -> Store : deserialize target state
    Store -> SQLite : begin transaction; defer foreign keys
    Store -> SQLite : insert session if needed; DELETE nodes
    loop each target node
      Store -> SQLite : INSERT node; sanitize HTML; decode Yjs state
    end
    Store -> SQLite : restore title; set revision = current + 1; updated_at
    Store -> SQLite : reload; hash; insert restore contribution + snapshot
    Store -> SQLite : commit
    Store --> Gateway : restored DocumentView
  end
  Gateway --> Queue : restored view at a new revision
  Queue --> Controller : restored view
  Controller -> Controller : acceptView(epoch/revision guard, authoritative reset)
  Controller -> Controller : editorGeneration++
  opt History remains open
    Controller -> Gateway : first history page under active filters
    Gateway --> Controller : page including new restore contribution when it matches
  end
  Controller --> App : current state
  App -> App : key NodeEditor by node ID + editorGeneration
  App -> App : remount RichTextEditor with restored Yjs state
  Controller -> Participants : release/unfreeze old participants
  App --> User : rerender restored document
end
@enduml
```

Both adapters record only `restoredRevision` in the compensating contribution payload. The controller test covers flush-before-restore and the authoritative generation change; `App` uses that generation in the editor key, so a same-node restore constructs a new `Y.Doc`. Full Tiptap DOM/reopen coverage and native restore parity remain verification work.

## Export JSON or Markdown

**Implemented.** Both storage capabilities expose export operations, but their JSON schemas still differ. Standalone emits the extended TypeScript `RecoveryExport`; Rust emits the older state/contributions envelope. Schema parity is second-pass work.

```plantuml
@startuml
title JSON / Markdown export across runtimes (implemented)
actor User
participant "App" as App
participant "useDocumentController" as Controller
participant "DraftTransitionCoordinator" as Drafts
participant "title + node-editor participants" as Participants
participant "tauriFileDialogs" as Dialogs
participant "MemoryDocumentGateway" as Memory
participant "Browser DOM" as Browser
participant "TauriDocumentGateway" as Tauri
participant "DocumentStore::export" as Store
database "SQLite" as SQLite
participant "File system" as FS

User -> App : Export -> JSON or Markdown
App -> Controller : exportDocument(format)
Controller -> Drafts : begin(); freeze participants synchronously
Controller -> Participants : flush title/metadata/rich text
Participants --> Controller : resolved (or cancel export on error)

alt standalone mode
  Controller -> Memory : exportDocument(format, null)
  Memory -> Memory : read current in-memory view
  alt JSON
    Memory -> Memory : toDocumentState(view)
    Memory -> Memory : coedit-recovery RecoveryExport v2 with algorithm/hash\n+ history order/complete + complete runtime contributions
    note right of Memory
      Host-only path/readOnly/recoveryWarning and
      internal revision snapshots are excluded.
    end note
  else Markdown
    Memory -> Memory : walk active hierarchy; DOMParser HTML;\nremove script/style/iframe/object/embed; textContent
  end
  Memory -> Browser : Blob + object URL + download anchor.click()
  Browser --> User : browser-managed download
  Memory -> Browser : revoke object URL
  Memory --> Controller : safe filename and byte count
else desktop mode
  Controller -> Dialogs : chooseExportPath(format, title)
  Dialogs -> User : native Save dialog (.json or .md)
  alt cancel
    User --> App : no export
  else destination selected
    User --> Dialogs : path
    Dialogs --> Controller : path
    Controller -> Tauri : exportDocument(format, path)
    Tauri -> Store : invoke export_document
    Store -> SQLite : load current state
    alt JSON
      Store -> SQLite : contributions(limit: 100000)
      SQLite --> Store : newest-first ledger slice
      Store -> Store : pretty RecoveryExport v1\n(exportedAt, state, contributions)
    else Markdown
      Store -> Store : walk active hierarchy; plain-text HTML conversion
    end
    Store -> FS : atomic_write to unique temporary; sync_all; replace
    FS --> Store : completed
    Store --> Tauri : path and bytesWritten
    Tauri --> Controller : ExportResult
    Controller --> App : success status
  end
end
@enduml
```

Markdown is presentation/interchange output, not lossless recovery. Standalone JSON contains the full state, canonical state hash, and complete contribution history for the current volatile runtime, but no revision snapshot map and no importer. Desktop JSON still silently requests at most 100,000 contributions and does not emit the standalone `hashAlgorithm`, `stateHash`, or `history` fields. Both filename paths share the centralized `ExportFormat` and `safeFilenameStem()` contracts; schema/semantic parity is part of the second pass.

## Create a desktop SQLite backup

**Implemented.** The backup menu item is rendered only in desktop mode.

```plantuml
@startuml
title Desktop SQLite backup (implemented)
actor User
participant "App" as App
participant "useDocumentController" as Controller
participant "DraftTransitionCoordinator" as Drafts
participant "title + node-editor participants" as Participants
participant "tauriFileDialogs" as Dialogs
participant "TauriDocumentGateway" as Gateway
participant "backup_document command" as Command
participant "DocumentStore::backup" as Store
database "open .coedit" as Source
participant "File system" as FS

User -> App : Export -> SQLite backup
App -> Controller : backupDocument()
Controller -> Drafts : begin(); freeze participants synchronously
Controller -> Participants : flush title/metadata/rich text
Participants --> Controller : resolved (or cancel backup on error)
Controller -> Dialogs : chooseBackupPath(document.title)
Dialogs -> User : native Save dialog (.coedit-backup)
alt cancel
  User --> App : no backup
else destination selected
  User --> Dialogs : destination
  Dialogs --> Controller : path
  Controller -> Gateway : storage.backupDocument(path)\n(after native-file narrowing)
  Gateway -> Command : invoke("backup_document", { path })
  Command -> Store : backup(destination) under document mutex
  opt document is writable
    Store -> Source : PRAGMA optimize
  end
  Store -> FS : copy source to unique temporary
  Store -> FS : sync_all temporary; atomic replace destination
  FS --> Store : destination metadata length
  Store --> Gateway : ExportResult
  Gateway --> Controller : ExportResult
  Controller --> App : "Backup created"
end
@enduml
```

The backup is a file copy while `DocumentStore` owns the connection and command mutex. The desktop Open dialog currently filters only `.coedit`, not `.coedit-backup`.

## Close with an explicit draft-transition barrier

**Implemented for controlled in-app Close.** The controller synchronously freezes all registered draft participants, awaits document-title, node-metadata, and rich-text drains, then enqueues `closeDocument`. Since draft commits and close use the same `SerializedTaskQueue`, the backend cannot be discarded before an accepted pending edit finishes.

```plantuml
@startuml
title Controlled Close ordering (implemented)
actor User
participant App
participant useDocumentController as Controller
participant DraftTransitionCoordinator as Drafts
participant "DocumentTitleInput + NodeEditor" as Participants
participant SerializedTaskQueue as Queue
participant DocumentGateway as Gateway

User -> App : click Close
App -> Controller : closeDocument()
Controller -> Drafts : begin()
Drafts -> Participants : freeze() synchronously
Controller -> Participants : flush()
loop each dirty draft in participant order
  Participants -> Queue : enqueue rename/updateNode/updateContent
  Queue -> Gateway : applyOperation(...)
  Gateway --> Queue : accepted view
  Queue --> Participants : commit resolved
end
Participants --> Controller : drain resolved
Controller -> Queue : enqueue closeDocument
Queue -> Gateway : closeDocument()
Gateway --> Queue : resolved
Queue --> Controller : resolved
Controller -> Controller : advance workspace epoch; clear view/history/selection
Controller --> App : Welcome state
Controller -> Participants : release/unfreeze (then unmount)

alt draft flush or queued mutation rejects
  Participants --> Controller : rejection; dirty value retained
  Controller -> Participants : release/unfreeze
  Controller --> App : remain in Workspace; show error
end
@enduml
```

The queue tail recovers after rejection, so one failed command does not prevent a later retry. This barrier covers actions routed through the controller, including node selection, other operations, restore, export, backup, and Close. Blur still triggers an eager drain, but correctness for these transitions no longer relies on blur ordering. The barrier does **not** make browser tab close/reload, operating-system process termination, forced host suspension, or arbitrary React-root teardown awaitable; `RichTextEditor` cleanup clears its timer and deliberately does not launch an unawaitable save.

## Standalone build pipeline

**Implemented.** `corepack pnpm build` produces the double-clickable artifact.

```plantuml
@startuml
title Standalone build pipeline (implemented)
actor Contributor
participant "pnpm script\nbuild" as Script
participant "TypeScript\ntsc -b" as TSC
participant "Vite\nmode defaults" as Vite
participant "React/Rollup" as Rollup
participant "standaloneHtml()\nvite.config.ts" as Plugin
participant "dist directory" as Dist

Contributor -> Script : corepack pnpm build
Script -> TSC : tsc -b
TSC --> Script : type-check success
Script -> Vite : vite build
Vite -> Vite : standalone = mode !== "tauri"
Vite -> Rollup : input index.html; base ./;\ninlineDynamicImports; no CSS splitting
Rollup --> Plugin : index.html + exactly one JS chunk + CSS assets
Plugin -> Plugin : reject imports/dynamic imports/unexpected assets
Plugin -> Plugin : escape closing script tokens; inline JavaScript
Plugin -> Plugin : inline each CSS asset
Plugin -> Plugin : SHA-256 script; inject restrictive CSP
Plugin -> Plugin : parse inline script with Function(...)
Plugin -> Plugin : delete every output except index.html
Plugin -> Dist : emit dist/index.html
Dist --> Contributor : one self-contained HTML file
@enduml
```

The build target includes ES2022, Chrome 105, and Safari 13. The standalone CSP denies all connections and allows only its hashed inline script, inline styles, and local data/blob image/font sources.

## Tauri build pipeline

**Implemented.** `corepack pnpm tauri:build` is the complete native build. `corepack pnpm build:tauri` creates only the Tauri-oriented frontend files.

```plantuml
@startuml
title Tauri native build pipeline (implemented)
actor Contributor
participant "pnpm script\ntauri:build" as Script
participant "Tauri CLI" as CLI
participant "tauri.conf.json" as Config
participant "pnpm build:tauri" as FrontScript
participant "TypeScript" as TSC
participant "Vite --mode tauri" as Vite
participant "dist directory" as Dist
participant "Cargo / rustc" as Rust
participant "Tauri bundler" as Bundler
participant "platform bundle" as Bundle

Contributor -> Script : corepack pnpm tauri:build
Script -> CLI : tauri build
CLI -> Config : read build/bundle configuration
Config --> CLI : beforeBuildCommand + frontendDist + targets
CLI -> FrontScript : corepack pnpm build:tauri
FrontScript -> TSC : tsc -b
TSC --> FrontScript : type-check success
FrontScript -> Vite : vite build --mode tauri
Vite -> Vite : standalone = false; input tauri.html;\nnormal assets + source maps
Vite -> Dist : tauri.html and generated assets
Dist --> CLI : frontendDist = ../dist
CLI -> Rust : compile src-tauri and bundled SQLite dependencies
Rust --> CLI : native application binary
CLI -> Bundler : package binary + frontend; targets = all
Bundler -> Bundle : platform installer/application artifacts
Bundle --> Contributor : distributable desktop build

note over Dist,Bundle
  The desktop window starts at tauri.html.
  Its TypeScript composition root is src/main-tauri.tsx.
end note
@enduml
```

For development, `tauri dev` runs `corepack pnpm dev`, points the webview at `http://127.0.0.1:1420`, and still uses `tauri.html` as the desktop window URL. A raw `cargo build --release` does not execute the configured frontend build/bundling pipeline and is not the documented release command.

## Maintaining these diagrams

**Recommendation:** update this interaction view whenever a contribution changes:

- a composition root or build command;
- gateway call ordering or payloads;
- transaction, validation, hashing, snapshot, export, or backup behavior;
- the editor debounce/flush lifecycle;
- contributor/session attribution;
- history query/pagination behavior; or
- lifecycle concurrency, cancellation, retry, and error presentation.

The matching use case and implementation locations should also be updated in [Traceability](TRACEABILITY.md), and newly discovered mismatches should be recorded in [Known limitations](KNOWN_LIMITATIONS.md).
