# Sequence diagrams

This document is the RUP interaction view for Coedit Local. It traces important use cases through the current implementation and names the files that own each step.

Except for the section explicitly titled **Proposed safe close sequence**, every diagram describes current code. Notes labeled **Current limitation** identify observed behavior rather than intended behavior.

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
| `App` | `App` in `src/App.tsx` |
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
participant "MemoryDocumentGateway" as Memory
participant "newId()" as Ids
participant "hashDocument()" as Hash

User -> App : enter contributor/title
User -> App : Create document
App -> App : run(); busy = true; error = null
App -> Memory : createDocument(null, newTitle, profile)
Memory -> Ids : document and contribution IDs
Memory -> Memory : create revision-0 DocumentView\nwith contributor and empty nodes/sessions
Memory -> Hash : SHA-256 of initial state
Hash --> Memory : resultingHash
Memory -> Memory : append createDocument contribution
Memory -> Memory : revisions.set(0, cloned state)
Memory --> App : structured clone of DocumentView
App -> App : setView(created); status = "Document created"
App -> Memory : listContributions({ limit: 500 })
Memory -> Memory : newest-first; apply query; clone
Memory --> App : Contribution[1]
App -> App : setContributions; busy = false
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
participant "tauriFileDialogs" as Dialogs
participant "TauriDocumentGateway" as Gateway
participant "Tauri invoke" as IPC
participant "create_document\nsrc-tauri/src/lib.rs" as Command
participant "DocumentStore\nsrc-tauri/src/store.rs" as Store
database "temporary SQLite file" as Temp
participant "File system" as FS
collections "AppState.document\nMutex of optional DocumentStore" as State

User -> App : Create document
App -> Dialogs : chooseDocumentToCreate(newTitle)
Dialogs -> User : native Save dialog (.coedit)
alt user cancels
  User --> Dialogs : null
  Dialogs --> App : null
  App --> User : remain on Welcome
else path selected
  User --> Dialogs : destination path
  Dialogs --> App : path
  App -> Gateway : createDocument(path, title, profile)
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
  Gateway --> App : DocumentView
  App -> Gateway : listContributions({ limit: 500 })
  Gateway --> App : newest-first contributions
  App --> User : render Workspace
end
@enduml
```

If creation fails before the final rename, `DocumentStore::create` attempts to remove the temporary file and returns an error. `App.run()` presents gateway errors in the error banner.

## Open and validate a desktop document

**Implemented.** Opening is desktop-only. Validation happens before the new store replaces the current `AppState.document` value.

```plantuml
@startuml
title Open and validate .coedit document (implemented)
actor User
participant "App" as App
participant "tauriFileDialogs" as Dialogs
participant "TauriDocumentGateway" as Gateway
participant "open_document command" as Command
participant "DocumentStore::open" as Store
database ".coedit SQLite" as SQLite
collections "AppState.document" as State

User -> App : Open .coedit file
App -> Dialogs : chooseDocumentToOpen()
Dialogs -> User : native Open dialog (coedit filter)
alt cancel
  User --> App : no path; remain on Welcome
else selected path
  User --> Dialogs : path
  Dialogs --> App : path
  App -> Gateway : openDocument(path)
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
  Gateway --> App : DocumentView
  App -> Gateway : listContributions({ limit: 500 })
  Gateway --> App : Contribution[]
  App --> User : Workspace + optional read-only/recovery banner
end

alt any validation or I/O error
  Store --> Command : StoreError
  Command --> Gateway : rejected invoke with message
  Gateway --> App : rejected Promise
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
participant "DocumentGateway" as Gateway
participant "MemoryDocumentGateway" as Memory
participant "domain/tree.ts" as Tree
participant "TauriDocumentGateway" as Tauri
participant "apply_operation command" as Command
participant "DocumentStore" as Store
database "SQLite" as SQLite

User -> Component : add/edit/move/delete/rename
Component -> App : callback(operation)
App -> App : context(contributor, session, message, group)
App -> Gateway : applyOperation(operation, context)

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

Gateway --> App : complete updated DocumentView
App -> App : setView(updated)
App -> Gateway : listContributions({ limit: 500 })
Gateway --> App : Contribution[]
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
Rich -> Rich : Y.mergeUpdates(pendingUpdates); clear queue
Rich -> Tiptap : getHTML()
Tiptap --> Rich : materialized HTML
Rich -> Purify : sanitize HTML with SAFE_TAGS/attributes
Purify --> Rich : clean HTML
Rich -> YDoc : Y.encodeStateAsUpdate(document)
YDoc --> Rich : complete binary state
Rich -> Rich : Base64 merged update + complete state
Rich -> NodeEditor : onCommit(html, update, state)
NodeEditor -> App : onContentChange(...)
App -> App : newId() for this contribution group
App -> Gateway : applyOperation(updateContent, context)
Gateway --> App : updated DocumentView
App -> Gateway : listContributions({ limit: 500 })
Gateway --> App : refreshed history
App --> User : saved status and rerender
@enduml
```

In the desktop branch, Rust decodes both Base64 values, enforces content/Yjs size limits, independently sanitizes HTML with Ammonia, and writes the complete Yjs state. The incremental `yjsUpdate` is validated and retained in the immutable operation payload, not applied separately to the materialized `nodes` row.

## Load and filter history

**Implemented.** `App` requests an unfiltered slice after create, open, every successful operation, and restore. `HistoryPanel` then filters that in-memory slice as the user types.

```plantuml
@startuml
title History load and client-side filtering (implemented)
participant "App.refreshHistory" as App
participant "DocumentGateway" as Gateway
participant "MemoryDocumentGateway" as Memory
participant "TauriDocumentGateway" as Tauri
participant "DocumentStore::contributions" as Store
database "SQLite contributions" as SQLite
participant "HistoryPanel" as Panel
actor User

App -> Gateway : listContributions({ limit: 500 })
alt standalone
  Gateway -> Memory : listContributions(query)
  Memory -> Memory : reverse to newest-first
  Memory -> Memory : apply node/contributor/before/search filters
  Memory -> Memory : slice to 500; structuredClone
  Memory --> Gateway : Contribution[]
else desktop
  Gateway -> Tauri : listContributions(query)
  Tauri -> Store : invoke list_contributions under mutex
  Store -> SQLite : SELECT newest-first LIMIT 100000\nJOIN contributors
  SQLite --> Store : rows
  Store -> Store : deserialize payload/affected IDs;\napply query filters; stop at 500
  Store --> Gateway : Contribution[]
end
Gateway --> App : fetched slice
App -> Panel : contributions, selectedNodeId

loop UI search/filter changes
  User -> Panel : change search or "Selected idea only"
  Panel -> Panel : useMemo filter over fetched slice
  Panel --> User : render matching entries
end
@enduml
```

The header count is `contributions.length`. It is therefore the size of the fetched slice, not a separately queried total. The panel does not call the gateway when its search controls change.

## Restore a revision as a compensating contribution

**Implemented.** Restore does not delete later ledger records or move the revision counter backward. It creates a new current revision from an earlier snapshot.

```plantuml
@startuml
title Compensating revision restore (implemented)
actor User
participant "HistoryPanel" as Panel
participant "App" as App
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
  App -> Gateway : restoreRevision(R, context)
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
  Gateway --> App : restored view at a new revision
  App -> App : setView(restored)
  App -> Gateway : listContributions({ limit: 500 })
  Gateway --> App : ledger including new restore contribution
  App --> User : rerender restored document
end

note over App
  Current limitation: if the selected node keeps the same ID,
  RichTextEditor memoizes its Y.Doc by node.id and may not load
  the restored yjsState. See KNOWN_LIMITATIONS.md.
end note
@enduml
```

The desktop restore contribution payload records `restoredRevision`; the memory adapter additionally places the restored state in its in-memory contribution payload.

## Export JSON or Markdown

**Implemented.** The two runtime adapters expose the same `DocumentGateway.exportDocument` method but produce different JSON shapes and use different delivery mechanisms.

```plantuml
@startuml
title JSON / Markdown export across runtimes (implemented)
actor User
participant "App" as App
participant "tauriFileDialogs" as Dialogs
participant "MemoryDocumentGateway" as Memory
participant "Browser DOM" as Browser
participant "TauriDocumentGateway" as Tauri
participant "DocumentStore::export" as Store
database "SQLite" as SQLite
participant "File system" as FS

User -> App : Export -> JSON or Markdown

alt standalone mode
  App -> Memory : exportDocument(format, null)
  Memory -> Memory : read current in-memory view
  alt JSON
    Memory -> Memory : JSON.stringify(current DocumentView)
    note right of Memory
      Current standalone JSON omits the
      in-memory contribution/snapshot collections.
    end note
  else Markdown
    Memory -> Memory : walk active hierarchy; DOMParser HTML;\nremove script/style/iframe/object/embed; textContent
  end
  Memory -> Browser : Blob + object URL + download anchor.click()
  Browser --> User : browser-managed download
  Memory -> Browser : revoke object URL
  Memory --> App : filename and byte count
else desktop mode
  App -> Dialogs : chooseExportPath(format, title)
  Dialogs -> User : native Save dialog (.json or .md)
  alt cancel
    User --> App : no export
  else destination selected
    User --> Dialogs : path
    Dialogs --> App : path
    App -> Tauri : exportDocument(format, path)
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
    Tauri --> App : ExportResult
    App --> User : success status
  end
end
@enduml
```

Markdown is presentation/interchange output, not lossless recovery. Desktop JSON is designed as recovery output but silently requests at most 100,000 contributions. The standalone JSON limitation is tracked in [Known limitations](KNOWN_LIMITATIONS.md).

## Create a desktop SQLite backup

**Implemented.** The backup menu item is rendered only in desktop mode.

```plantuml
@startuml
title Desktop SQLite backup (implemented)
actor User
participant "App" as App
participant "tauriFileDialogs" as Dialogs
participant "TauriDocumentGateway" as Gateway
participant "backup_document command" as Command
participant "DocumentStore::backup" as Store
database "open .coedit" as Source
participant "File system" as FS

User -> App : Export -> SQLite backup
App -> Dialogs : chooseBackupPath(document.title)
Dialogs -> User : native Save dialog (.coedit-backup)
alt cancel
  User --> App : no backup
else destination selected
  User --> Dialogs : destination
  Dialogs --> App : path
  App -> Gateway : backupDocument(path)
  Gateway -> Command : invoke("backup_document", { path })
  Command -> Store : backup(destination) under document mutex
  opt document is writable
    Store -> Source : PRAGMA optimize
  end
  Store -> FS : copy source to unique temporary
  Store -> FS : sync_all temporary; atomic replace destination
  FS --> Store : destination metadata length
  Store --> Gateway : ExportResult
  Gateway --> App : ExportResult
  App --> User : "Backup created"
end
@enduml
```

The backup is a file copy while `DocumentStore` owns the connection and command mutex. The desktop Open dialog currently filters only `.coedit`, not `.coedit-backup`.

## Close ordering and pending-edit race

### Current sequence

**Implemented, with known race/data-loss behavior.** `App.close()` awaits the gateway close first and only then sets `view` to `null`. The view change unmounts `RichTextEditor`, whose cleanup attempts to flush pending Yjs updates after the gateway has already closed.

Metadata fields also commit on blur. Clicking Close while such a field is focused can start a metadata operation independently just before the close click handler.

```plantuml
@startuml
title Current Close ordering (implemented; unsafe for pending edits)
actor User
participant "Focused metadata input" as Input
participant "App" as App
participant "DocumentGateway" as Gateway
participant "NodeEditor" as Node
participant "RichTextEditor" as Rich
participant "Y.Doc" as YDoc

note over Rich
  A 1.2-second timer may be active and
  pendingUpdates may be non-empty.
end note

User -> Input : pointer action moves focus toward Close
opt title/summary/document title is dirty
  Input -> App : onBlur -> apply(updateNode/renameDocument)
  App -> Gateway : applyOperation(...) (not awaited by click handler)
  note right of Gateway
    This request can race the close request.
  end note
end

User -> App : click Close
App -> App : close(); run(); busy = true
App -> Gateway : closeDocument()
Gateway -> Gateway : discard/close current document
Gateway --> App : resolved
App -> App : setView(null); clear history/selection
App -> Node : React unmount
Node -> Rich : unmount
Rich -> Rich : clear pending timer
Rich -> Rich : void flush()
Rich -> YDoc : merge pending updates; encode full state
Rich -> App : onCommit -> apply(updateContent)
App -> Gateway : applyOperation(updateContent, context)
Gateway --> App : reject "No document is open"
Rich -> YDoc : destroy()
App --> User : Welcome; possible late error/rerender race

note over App,Gateway
  The pending content commit begins after close has resolved.
  The blur mutation began before close and can complete in either order.
end note
@enduml
```

The memory adapter has an additional interleaving risk: `applyOperation()` awaits Web Crypto hashing before assigning `this.current = updated`, while `closeDocument()` can clear `current` during that await. A blur-started memory mutation can therefore finish after close and repopulate adapter state even though the UI intended to close it.

### Proposed safe close sequence

**Proposal only; not implemented.** This sequence requires an explicit save coordinator or imperative flush contract. It is included to make the intended correction reviewable, not to imply that current code already behaves this way.

```plantuml
@startuml
title Proposed safe Close ordering (not implemented)
actor User
participant "App / SaveCoordinator" as App
participant "NodeEditor" as Node
participant "RichTextEditor" as Rich
participant "DocumentGateway" as Gateway

User -> App : Close
App -> App : set closing = true; disable new mutations
App -> Node : commitDirtyMetadata()
Node --> App : metadata operation promises
App -> Rich : flushPending()
Rich -> Rich : cancel timer; merge/sanitize/encode pending content
Rich -> Gateway : applyOperation(updateContent, context), if dirty
Gateway --> Rich : updated DocumentView
Rich --> App : flush result
App -> App : await metadata + content + all in-flight mutations

alt every required commit succeeds
  App -> Gateway : closeDocument()
  Gateway --> App : resolved
  App -> App : setView(null); clear state
  App -> Rich : unmount cleanup (nothing pending)
  App --> User : Welcome
else a commit fails
  App -> App : cancel close; closing = false
  App --> User : remain in Workspace and show actionable error
end
@enduml
```

**Recommendation:** the implementation should serialize lifecycle and mutation commands, make editor flush awaitable, and define whether Close may proceed after a failed save. A `beforeunload` strategy for the standalone artifact is a separate browser-lifecycle concern and cannot replace explicit in-app ordering.

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
