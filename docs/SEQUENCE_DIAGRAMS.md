# Runtime sequence realizations

This document captures the important current use-case flows without duplicating implementation detail already owned by architecture/design documents. It keeps explicit ordering where changing that order could lose accepted work, install unvalidated state, expose a partial output, or make materialized state/history/snapshots disagree.

## Desktop create/open installation boundary

Desktop lifecycle commands do not install a new authoritative workspace until native persistence has completed the checks that make the returned view safe to accept.

### Create

```text
User chooses new .coedit destination
 -> controller serializes create
 -> TauriDocumentGateway.createDocument
 -> Rust DocumentStore::create
 -> validate unused .coedit path and parent
 -> create unique temporary sibling database
 -> initialize schema/PRAGMAs
 -> transaction:
      insert document metadata + initial contributor
      calculate revision-0 state hash
      insert createDocument contribution + snapshot
      commit
 -> optimize/close temporary database
 -> rename temporary database to destination
 -> reopen destination through normal DocumentStore::open validation
 -> create command installs validated DocumentStore in AppState
 <- complete DocumentView
 <- controller accepts authoritative workspace/reset
```

A failure before installation must not expose a partially initialized store as current. Creation attempts to remove its temporary database on failure; destination replacement and directory-durability limits remain documented in the persistence/security artifacts.

### Open

```text
User chooses existing document
 -> controller serializes open
 -> TauriDocumentGateway.openDocument
 -> Rust DocumentStore::open
 -> require ordinary file; note pre-existing rollback journal
 -> read-only probe of application_id + user_version
 -> choose read/write or newer-format read-only mode
 -> open connection; busy timeout + foreign keys
 -> PRAGMA integrity_check
 -> validate magic/version agreement
 -> load/decode typed metadata, contributors, sessions, nodes
 -> validate hierarchy/parent relationships/cycles
 -> construct validated DocumentView
 -> only then replace AppState.document
 <- controller accepts authoritative workspace/reset
```

Cancel or any validation/I/O failure installs no new document view. The ordering requirement is **validate before installation**, including future-format read-only selection and recovery-warning derivation.

## Apply a document mutation

```text
User
 -> component/App
 -> useDocumentController
 -> DraftTransitionCoordinator.begin
 -> freeze registered drafts synchronously
 -> flush registered drafts
    if flush fails: cancel requested action; retain retryable drafts; do not enqueue mutation
 -> SerializedTaskQueue
 -> DocumentGateway.applyOperation
 -> Memory adapter OR Tauri/Rust store
```

The desktop branch has an additional atomicity contract:

```text
DocumentStore.apply
 -> load current state; require writable document + known contributor
 -> BEGIN transaction
 -> optional writing-session insertion
 -> apply validated materialized mutation
 -> update current revision/timestamp
 -> reload + validate resulting state
 -> calculate resulting hash
 -> insert attributed contribution
 -> insert full snapshot for the same revision
 -> COMMIT
 <- complete updated DocumentView
```

Only after the gateway resolves does the controller accept a current-epoch/non-older view, refresh the first History page when open (otherwise mark it stale), and unfreeze drafts. A native failure before commit rolls back the transaction; a gateway failure leaves the previously accepted application view authoritative. Rejection does not poison the serialized queue, so retry/later commands remain possible.

## Semantic rich-text checkpoint

```text
User edits Tiptap
 -> transaction/input classifier
 -> BodyEditBatchCoordinator
 -> accept local editor transaction
 -> on semantic/threshold/idle boundary:
      synchronously capture sanitized HTML
      merge pending Yjs update
      encode complete Yjs state
      retain semantic groupId
      enqueue immutable checkpoint
 -> controller.applyOperation(updateBody, groupId)
 -> serialized gateway persistence
```

The coordinator bounds pending checkpoints and visibly blocks/retries on failure. Structural/lifecycle transitions freeze and drain this pipeline before the editor can be hidden or replaced; failed checkpoint persistence retains the exact FIFO head/group identity instead of permitting later work to overtake it.

## Open and page History

```text
User opens History
 -> controller.listContributions(filters, limit)
 -> gateway returns raw ContributionPage
 -> controller stores raw newest-first rows/cursor
 -> HistoryPanel projectHistory(rawRows, hasMore)
 -> render raw-loaded count + visible grouped-row count
```

Loading older History repeats the raw query with an exclusive `beforeRevision` cursor. The controller appends/deduplicates raw rows; `projectHistory` runs over the accumulated list, allowing one semantic group to merge across an ordinary raw-page boundary.

## Expand a body-edit group

For a fully loaded group:

```text
User Expand
 -> HistoryPanel shows exact loaded physical checkpoints
```

For a partial oldest group on standalone:

```text
User Expand
 -> App narrows ContributionGroupQueryCapability = available
 -> listContributionGroup(groupId, limit)
 -> follow nextBeforeRevision until hasMore = false
 -> deduplicate/sort exact group contributions
 -> HistoryPanel replaces partial expansion data
 -> exact checkpoint count and revision range become visible
```

The exact group query ignores ordinary History search/node filters because it is an explicit request for all physical members of one known group.

On Tauri, `ContributionGroupQueryCapability` is host-deferred. Expansion shows loaded checkpoints plus an explicit message that full expansion is unavailable; no throwing fake query is invoked.

## View historical revision — standalone

```text
User clicks View on contribution/checkpoint
 -> controller begins draft transition
 -> freeze + flush live drafts
    if flush fails: retain exact live origin; issue no revision query
 -> capture exact origin + workspace/request generation
 -> RevisionQueryCapability.materializeRevision(R)
 -> memory gateway validates revision/tree/hash and returns detached state
 -> controller rejects response if request/workspace generation changed
 -> WorkspaceProjection becomes historical
 -> DocumentCanvas renders read-only snapshot
 -> banner shows viewed/current revisions
```

No contribution/snapshot is appended by materialization. A missing/invalid/hash-mismatched snapshot fails closed and leaves the current projection authoritative.

## Back to current

```text
User clicks Back to current
 -> invalidate pending historical request
 -> restore retained live WorkspaceProjection locally
 -> no gateway call
 -> no contribution
```

## Restore historical revision

```text
User confirms Restore as new revision
 -> controller drains drafts as applicable
 -> DocumentGateway.restoreRevision(R, contribution context)
 -> adapter materializes historical state
 -> append one new compensating current revision
 -> return complete authoritative DocumentView
 -> controller accepts view and exits historical mode
```

Restore preserves later ledger history; it never rewinds/deletes revisions. If the restore command fails, the prior live/historical projection remains authoritative rather than partially advancing application state.

## Export/backup output boundary

Export and backup externalize accepted live state, so draft draining and destination replacement order are part of the correctness contract.

```text
User chooses Export or Backup
 -> controller begins draft transition
 -> freeze + flush registered drafts
    if flush fails: cancel output; keep document/drafts available
 -> native host chooses destination (when applicable)
    if dialog cancels: perform no write
 -> serialize output command after required draft commits
 -> produce content/copy into unique temporary sibling
 -> sync temporary file contents
 -> replace destination using rename/rollback helper
 <- report ExportResult only after replacement succeeds
```

Standalone export substitutes browser Blob/download behavior for the native destination steps. A successful export/backup never advances document revision. Desktop parent-directory metadata is not explicitly fsynced and replacement fault coverage remains a documented limitation; those limits must not be upgraded by this sequence description.

## Create/open/close

Create/open run through the appropriate storage capability and install a new authoritative live workspace only after their host operation succeeds. Desktop path selection is outside shared persistence via `DocumentFileDialogs`.

Close freezes/drains drafts, calls `DocumentGateway.closeDocument`, then clears application workspace state only after success. Failed drain/close retains the workspace and retryable local state. Forced process/browser termination cannot await this Promise and remains a known limitation.

## Stale-response rule

History/revision reads can race with newer user intent. Requests therefore carry controller/workspace generation information. An old response must never replace a newer document, newer filter result, newer revision selection, restored workspace, or closed workspace.

## Maintenance rule

Keep a sequence explicit here when reordering two steps could change durability, validation-before-installation, attribution/history atomicity, immutable checkpoint ordering, or output replacement semantics. Implementation-only call details that do not affect those contracts belong in source/design documents instead.
