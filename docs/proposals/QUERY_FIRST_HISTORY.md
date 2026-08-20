# Query-first historical views — decision record

**Status:** standalone implementation is complete through WP-1, WP-2, WP-3, WP-5 and WP-7. Native revision materialization and exact contribution-group queries remain WP-10.

## Adopted command/query separation

Historical inspection is not restoration.

- **View/materialize** is a read-only query that returns a detached historical state and does not change revision, contributions, snapshots or live state.
- **Restore** is an explicit compensating command that creates a new live revision while retaining later history.

The shared application models live/historical state with a discriminated `WorkspaceProjection`; it does not rely only on `DocumentView.readOnly`.

## Standalone implementation

`MemoryDocumentGateway` exposes an available `RevisionQueryCapability`. Materialization:

- requires a valid revision;
- clones/detaches stored state;
- validates the tree;
- recomputes and compares the stored state hash;
- returns `MaterializedRevision` without mutating current state or ledger.

The controller drains pending live drafts before issuing the query, retains the exact live origin, rejects stale responses, and renders the accepted result through the shared read-only `DocumentCanvas`.

**Back to current** restores the retained live projection locally and makes no gateway call. **Restore as new revision** remains separately confirmed.

## Grouped History interaction

WP-5 adds semantic grouping without weakening query separation.

A collapsed body-edit group uses its newest/final checkpoint as the canonical View target. Expanding the group exposes exact checkpoint revisions, each of which can be viewed independently on a capable host.

A page-spanning group is labeled partial until exact group data is known. Standalone uses `ContributionGroupQueryCapability` to fetch all physical members of the `groupId`; this is another read-only query and does not inherit ordinary History search/node filters.

## Current native gap

Tauri advertises both revision materialization and exact contribution-group querying as host-deferred. The shared UI therefore:

- does not expose fake View actions that would throw;
- temporarily retains row-level Restore;
- labels a partial group's loaded checkpoints honestly;
- states that full exact expansion is unavailable in the current host.

## WP-10 requirements

Native parity should add narrow read-only Tauri/Rust queries for:

1. exact snapshot materialization by revision;
2. exact contribution-group paging by `groupId`;
3. scalable indexed raw History paging/filtering.

Native materialization must validate/deserialize state, verify the stored host/schema hash, preserve the open live store, and return detached data without a mutation transaction.

Native group queries must return immutable contribution rows only, page by an exclusive revision cursor, and ignore ordinary UI filters when explicitly expanding a group.

Do not emulate either query through restore, temporary replacement of live state, JSON export, or broad mutable commands.

## Historical UI invariants

- historical mode always identifies viewed and current revisions;
- historical content uses the same sanitizer-backed canvas as live previews;
- no title/tag/body editor or structural mutation surface is mounted;
- Back is the primary safe exit;
- Restore requires confirmation and explains that a new revision will be appended;
- stale query responses cannot replace a newer workspace/revision selection;
- presentation state such as History filters/group expansion/canvas disclosure is not persisted document state.

## Remaining qualification

Browser/accessibility behavior belongs to WP-8, standalone artifact qualification to WP-9, and native query parity to WP-10. The fundamental query/command design is already implemented and should not be described as future work.
