# Continuous workspace change package — decision record

**Product direction:** approved.

**Current implementation status:** WP-1 through WP-7 are implemented, including WP-5 grouped History. This package now records the decisions that produced the current architecture plus the remaining staged work; it is no longer a description of an unimplemented continuous-canvas redesign.

## Implemented work packages

| WP | Outcome |
|---|---|
| WP-1 | Standalone verified, non-mutating revision materialization capability |
| WP-2 | Explicit live/historical workspace projection and command guards |
| WP-3 | Reachable standalone View/Back/Restore historical workflow |
| WP-4 | Semantic body-checkpoint policy/coordinator and application contract |
| WP-5 | Grouped History projection, page-boundary coalescing, partial labeling, exact standalone group expansion |
| WP-6 | Pure visible-node projection |
| WP-7 | Reachable continuous live/historical `DocumentCanvas`, inline metadata/structure controls, one-editor ownership, retirement of master/detail |

The current implementation is documented in the as-built files under `docs/`. Those documents and code take precedence over historical proposal wording.

## Remaining work

### WP-7A — optional navigation-only sidebar

Add an auxiliary hierarchy view over the active live/historical projection without creating a second editing surface. It must keep navigator selection/expansion separate from canvas context, actual focus and editor ownership.

### WP-8 — browser/focus/accessibility qualification

Qualify continuous-canvas and future navigator behavior across real browser focus, keyboard, pointer/touch, IME and assistive-technology paths. Complete responsive auxiliary-panel behavior belongs here with WP-7A integration.

### WP-9 — standalone qualification

Exercise the generated self-contained artifact through real `file://` flows, long documents/history, recovery export and failure cases. This is qualification, not a new persistence design.

### WP-10 — native/Tauri parity

Implement and qualify:

- native non-mutating revision materialization;
- native exact contribution-group queries;
- store-side scalable History paging/filtering;
- shared Rust/TypeScript protocol/hash/sanitizer evidence;
- broader native hardening called out by the risk register.

WP-10 should add narrow read-only query commands/capabilities rather than emulate queries through restore or broad mutable workflows.

## Adopted decisions that remain binding

1. `DocumentCanvas` is the sole document editing surface; master/detail is retired.
2. Persisted hierarchy stays `parentId`/`position`; visible depth/order is a projection.
3. At most one live block owns Tiptap/Yjs in this architecture.
4. Live/historical mode is a discriminated application state, not only `readOnly: boolean`.
5. Viewing history is a non-mutating query; restoring is a compensating command.
6. Body safety checkpoints are physical revisions; semantic edit groups are human-visible presentation units.
7. Threshold checkpoints in one semantic episode reuse one `groupId`.
8. Controlled operations drain pending body/metadata/title work before hiding/replacing it.
9. History collapses only contiguous body contributions with the same non-null group ID.
10. A collapsed group uses its newest/final checkpoint as the canonical revision.
11. Page-spanning groups must be labeled partial until exact group data proves completeness.
12. Exact group expansion is a dedicated read-only query and ignores ordinary History filters.
13. Host capability absence is explicit (`host-deferred`), not a throwing fake implementation.
14. Optional navigator state is presentation state and must never become document data or another editor.
15. Browser preferences/session UI state must not enter hashes, snapshots, contributions, recovery or exports.

## Requirement status

| Requirement | Status |
|---|---|
| FR-PW-01 visible pre-order projection | Implemented |
| FR-PW-02 one live editor owner | Implemented |
| FR-PW-03 non-mutating revision materialization | Standalone implemented; native pending |
| FR-PW-04 historical read-only workspace | Standalone implemented |
| FR-PW-05 explicit compensating restore | Implemented |
| FR-PW-06/07 semantic configurable checkpoints | Implemented |
| FR-PW-08 grouped/exact History | Standalone implemented; native exact query pending |
| FR-PW-09 drain before structure/lifecycle changes | Implemented |
| FR-PW-10 bounded ordered checkpoint persistence | Implemented |
| FR-PW-11 canvas interaction breadth | Implemented core; qualification pending |
| FR-PW-12/13 optional navigator/responsive shell | Proposed |

## Resume checklist

Before starting the next WP:

1. read the relevant as-built docs, not old conversation history;
2. confirm `main` has not changed the capability/state boundaries;
3. keep the work package narrow;
4. add acceptance evidence at the owning seam;
5. update as-built docs and this status table in the same PR;
6. leave unavailable host behavior explicit rather than widening scope silently.

See [Continuous block-outline](./CONTINUOUS_BLOCK_OUTLINE.md), [Query-first historical views](./QUERY_FIRST_HISTORY.md), and [Body checkpoint/group strategy](./BODY_CHECKPOINT_STRATEGY.md) for the remaining constraints and historical rationale.
