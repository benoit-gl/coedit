# Runtime sequence realizations

This document captures the important current use-case flows without duplicating implementation detail already owned by architecture/design documents.

## Apply a document mutation

```text
User
 -> component/App
 -> useDocumentController
 -> DraftTransitionCoordinator.freeze + flush
 -> SerializedTaskQueue
 -> DocumentGateway.applyOperation
 -> Memory adapter OR Tauri/Rust store
 <- complete updated DocumentView
 <- controller accepts current-epoch/non-older result
 -> refresh History first page if open, otherwise mark it stale
 -> unfreeze drafts
```

Desktop mutation commits materialized state, revision metadata, contribution/hash and snapshot in one SQLite transaction. Standalone applies the equivalent domain mutation in memory.

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

The coordinator bounds pending checkpoints and visibly blocks/retries on failure. Structural/lifecycle transitions freeze and drain this pipeline before the editor can be hidden or replaced.

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
 -> RevisionQueryCapability.materializeRevision(R)
 -> memory gateway validates revision/tree/hash and returns detached state
 -> controller rejects stale request if workspace/request epoch changed
 -> WorkspaceProjection becomes historical
 -> DocumentCanvas renders read-only snapshot
 -> banner shows viewed/current revisions
```

No contribution/snapshot is appended by materialization.

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
 -> controller accepts authoritative view and exits historical mode
```

Restore preserves later ledger history; it never rewinds/deletes revisions.

## Create/open/close

Create/open run through the appropriate storage capability and install a new authoritative live workspace. Desktop path selection is outside shared persistence via `DocumentFileDialogs`.

Close freezes/drains drafts, calls `DocumentGateway.closeDocument`, then clears application workspace state only after success. Forced process/browser termination cannot await this Promise and remains a known limitation.

## Stale-response rule

History/revision reads can race with newer user intent. Requests therefore carry controller/workspace generation information. An old response must never replace a newer document, newer filter result, newer revision selection, restored workspace, or closed workspace.
