# Query-first historical views — decision record

**Status:** standalone implementation is complete through WP-1, WP-2, WP-3, WP-5 and WP-7. Native revision materialization and exact contribution-group queries remain WP-10.

## Adopted command/query separation

Historical inspection is not restoration.

- **View/materialize** is a read-only query that returns a detached historical state and does not change revision, contributions, snapshots or live state.
- **Restore** is an explicit compensating command that creates a new live revision while retaining later history.

The shared application models live/historical state with a discriminated `WorkspaceProjection`; it does not rely only on `DocumentView.readOnly`.

## Query contract

A revision materialization query must:

- accept only a valid nonnegative revision;
- locate exactly that stored snapshot;
- deserialize/validate it as untrusted document state;
- verify its stored hash using the host/schema-appropriate algorithm;
- return detached data marked as verified;
- never replace the current live state;
- never increment revision or append contributions/snapshots;
- never alter current contributor/session attribution;
- never emulate a query through restore, temporary live-state replacement or export.

A capability that is not implemented is represented as `host-deferred`; shared UI must not receive a method whose only behavior is to throw.

## Standalone implementation

`MemoryDocumentGateway` exposes an available `RevisionQueryCapability`. Materialization:

- requires a valid revision;
- clones/detaches stored state;
- validates the tree;
- recomputes and compares the stored state hash;
- returns `MaterializedRevision` without mutating current state or ledger.

The controller drains pending live drafts before issuing the query, retains the exact live origin, rejects stale responses, and renders the accepted result through the shared read-only `DocumentCanvas`.

**Back to current** restores the retained live projection locally and makes no gateway call. **Restore as new revision** remains separately confirmed.

## Workspace/request invariants

The following are application contracts rather than incidental implementation detail:

1. document mutations require a live workspace;
2. `currentRevision` always refers to retained live state even while an older snapshot is displayed;
3. entering historical mode never overwrites retained live state;
4. a loading request retains the exact origin projection from which it started;
5. a failed/canceled request returns to that exact origin unless a newer workspace/request superseded it;
6. viewing B supersedes an in-flight request for A;
7. close/open/create invalidate prior historical requests;
8. **Back to current** during loading invalidates the request and cannot later be overwritten by its result;
9. stale query results are ignored rather than replacing newer live/historical intent;
10. historical mode has zero editor owner and no mutation callbacks even if a control is invoked indirectly;
11. live and historical canvas/Navigator contexts are distinct and presentation-only;
12. each transition into historical mode derives a fresh one-shot resume-editor candidate from actual current ownership;
13. Back/Restore validate and consume that candidate; ordinary live state never retains a stale resume target.

## Entering historical mode

The required ordering is:

1. user requests **View revision R**;
2. controller begins the existing controlled transition and synchronously freezes live drafts;
3. pending title/tag/body work is flushed and awaited;
4. if draft persistence fails, remain live and issue no revision query;
5. capture the now-current live origin plus workspace/request epoch and fresh resume candidate;
6. issue `materializeRevision(R)`;
7. accept only a response whose workspace/request identity is still current;
8. on success, enter historical mode with detached state and no editor owner;
9. initialize/prune historical canvas/Navigator state against that snapshot;
10. on failure, restore the recorded live/historical origin and surface the query error.

Saving drafts before the query may legitimately append live contributions because those edits predate the View request. The **materialization itself** must remain non-mutating.

## Historical UI invariants

- historical mode always identifies viewed and current revisions;
- historical content uses the same sanitizer-backed canvas as live previews;
- no title/tag/body editor, draft participant or structural mutation surface is mounted;
- Back is the primary safe exit;
- Restore requires confirmation and explains that a new revision will be appended while later history is retained;
- historical disclosure/selection/scroll are local presentation state;
- presentation state such as History filters/group expansion/canvas/Navigator disclosure is not persisted document state;
- exporting the retained live document while a historical snapshot is visibly displayed must not happen accidentally; any historical export behavior requires its own explicit query-side design.

## Back to current

Back is intentionally local application state restoration:

1. invalidate any pending historical request;
2. restore the retained live projection;
3. validate the retained one-shot resume candidate against authoritative live state;
4. remount/focus it only if still active/visible;
5. discard the retained wrapper/candidate;
6. perform no gateway mutation and append no contribution.

Back must not depend on re-materializing the current revision.

## Restore from historical mode

Restore remains a command, not a query.

Required behavior:

1. require explicit confirmation of source revision and append-only consequence;
2. issue exactly one `restoreRevision` command with current contribution context;
3. on success, use the returned authoritative live `DocumentView` as the new current state;
4. append exactly one compensating revision and retain all intervening ledger history;
5. rebuild live canvas/Navigator context against that returned state rather than copying historical UI context;
6. if the retained resume ID survives under changed ancestry, expand every required canvas ancestor before mounting it;
7. if the target is absent/deleted/cannot be made visible, clear it and choose a visible fallback;
8. discard the retained historical wrapper/candidate;
9. if restore fails, remain in the historical projection with retained live state unchanged.

The controller must not first mutate to “view” the snapshot, restore twice, or append a separate “viewed revision” contribution.

## Grouped History interaction

WP-5 adds semantic grouping without weakening query separation.

A collapsed body-edit group uses its newest/final checkpoint as the canonical View target. Expanding the group exposes exact checkpoint revisions, each of which can be viewed independently on a capable host.

A page-spanning group is labeled partial until exact group data is known. Standalone uses `ContributionGroupQueryCapability` to fetch all physical members of the `groupId`; this is another read-only query and does not inherit ordinary History search/node filters.

Exact group-query invariants:

- filter by one exact non-empty `groupId`;
- return immutable raw contributions newest-first;
- page with an exclusive revision cursor;
- permit callers to continue until the complete group is known;
- deduplicate by contribution identity in the caller;
- perform no document/ledger/snapshot mutation;
- ignore ordinary History search/node/contributor filters for this explicit expansion request.

## History visibility/stale-response contract

The remaining shell work must preserve query correctness when History is hidden by layout/Navigator state:

- first effective reveal with no valid page issues one guarded contribution query;
- hiding/revealing a valid non-stale page issues no redundant query;
- relevant accepted live changes while hidden mark History stale and advance a monotonic data generation;
- an older in-flight response cannot clear that newer stale state;
- next effective reveal performs exactly one current guarded refresh;
- responsive changes do not rewrite History’s requested-visible preference merely to match effective visibility.

This is a contribution-list query rule, not a document mutation rule.

## Current native gap

Tauri advertises both revision materialization and exact contribution-group querying as host-deferred. The shared UI therefore:

- does not expose fake View actions that would throw;
- temporarily retains row-level Restore;
- labels a partial group's loaded checkpoints honestly;
- states that full exact expansion is unavailable in the current host.

## WP-10 requirements

Native parity must add narrow read-only Tauri/Rust queries for:

1. exact snapshot materialization by revision;
2. exact contribution-group paging by `groupId`;
3. scalable indexed raw History paging/filtering beyond the current newest-100,000 pre-window.

### Native materialization requirements

The Rust/Tauri query must:

- read the requested snapshot without beginning a mutation transaction;
- verify that the returned state identifies the requested revision;
- deserialize/validate tree/typed data as untrusted input;
- recompute and compare the stored host/schema state hash before returning;
- preserve the currently open live store and all materialized rows;
- return detached data through a narrow typed IPC result;
- expose a typed not-found/invalid-snapshot failure;
- make no file timestamp/content/ledger change through the query itself where the platform permits that to be asserted.

Do not emulate native View by calling restore, exporting JSON, replacing the store temporarily, or broadening a mutable command.

### Native exact-group requirements

The Rust/Tauri group query must:

- query exact `group_id` at the store layer rather than depending on the ordinary 100,000-row broad history pre-window;
- page newest-first by exclusive revision cursor;
- return only immutable contribution rows;
- ignore ordinary History filters;
- preserve complete revision/attribution/payload data required for exact checkpoint actions;
- perform no mutation or snapshot creation.

### Native shared-contract evidence

WP-10 is not complete merely because an IPC method exists. Qualify at least:

- known/missing/invalid revision materialization;
- hash mismatch/corrupt snapshot failure;
- no live-state/revision/ledger/snapshot mutation before versus after View;
- subsequent live edit continuing from the unchanged current state;
- exact group spanning more than one query page;
- group query deduplication/order/cursor completion;
- ordinary History filters not affecting exact expansion;
- stale request cancellation/ignoring through the controller;
- row-level Restore fallback removed only after View is actually reachable;
- Tauri capability advertises `available` only after the real query path and evidence exist.

## Error behavior

| Failure | Required result |
|---|---|
| pending live draft cannot save | remain live; issue no historical query |
| revision unavailable | return to exact recorded origin; show not-found error |
| snapshot invalid/hash mismatch | fail closed; render no partial historical state |
| stale response | ignore it; do not replace newer intent |
| Back during loading | invalidate request and restore retained live projection |
| Close/open/create during loading | invalidate old request so it cannot reinstall stale state |
| Restore failure | remain historical; retained live state unchanged |
| stale Navigator/canvas target | prune by stable ID and choose a valid fallback; no live command from historical mode |

## Acceptance criteria retained for future work

The query-first design remains accepted only while these criteria hold:

1. Viewing an available revision does not change live revision/state, contribution count or snapshot count through the materialization query itself.
2. Returned state is detached, structurally valid and hash-verified before rendering.
3. Historical mode is explicit and has no reachable mutation path except separately confirmed restore.
4. Back returns to retained live state without a gateway mutation.
5. Restore appends exactly one new compensating revision and preserves later history.
6. Rapid revision selection cannot display a stale result; failure/cancel restores the exact origin projection.
7. Back/Close/open/create invalidate pending responses that would otherwise overwrite newer state.
8. The same continuous canvas renders live and historical states, with zero live editor in historical mode.
9. Group collapsed View targets the final checkpoint and exact expanded revisions remain individually viewable on capable hosts.
10. Navigator/history presentation state never enters persisted document state or causes a materialization mutation.
11. Restore rebuilds live UI context against the returned compensating view and never mounts an editor in a hidden/invalid block.
12. Each historical entry derives a fresh resume candidate; Back/Restore validate and consume it.
13. History first-reveal/stale-refresh behavior remains generation-guarded across Navigator/responsive hiding.
14. Standalone must pass this contract before native parity is claimed; WP-10 must make Tauri pass the same semantic contract for the capabilities it advertises.

## Remaining qualification

Browser/accessibility behavior belongs to WP-8, standalone artifact qualification to WP-9, and native query parity to WP-10. The fundamental query/command design is already implemented and should not be described as future work.
