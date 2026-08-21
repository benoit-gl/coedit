# Body checkpoint and semantic-group strategy — decision record

**Status:** implemented through WP-4, WP-5 and WP-7 integration. Browser/native qualification and storage-growth work remain separate concerns.

This document preserves the design decisions behind the current rich-text checkpoint system. Current implementation ownership belongs in [Frontend design](../FRONTEND_DESIGN.md), [Architecture](../ARCHITECTURE.md), [Testing](../TESTING.md), and source; the normative behavior below remains a contract even when implementation detail moves.

## Problem solved

A fixed short debounce produced save behavior that was difficult to reason about, tied persistence to idle timing, and created noisy History. The current design separates:

- **physical safety checkpoints** — immutable `updateBody` revisions/snapshots; and
- **semantic edit groups** — human-visible writing episodes containing one or more checkpoints that share a `groupId`.

## Adopted policy

`BodyCheckpointPolicy` owns two centralized injectable values:

- `batchCharacterThreshold`;
- `idleTimeoutMs`.

The production defaults are `batchCharacterThreshold = 20` and `idleTimeoutMs = 30_000`. They live in one exported policy module; components/adapters do not duplicate them. Tests inject smaller values.

Both values are positive safe integers. `idleTimeoutMs` must not exceed the portable signed 32-bit browser timer ceiling (`2_147_483_647`). Changing a default is a policy change, not a document-format change, but it can materially change ledger/snapshot growth and therefore requires updated measurements/expectations.

### Exact threshold meaning

The insertion threshold is deliberately pre-input. With the default threshold `20`, nineteen inserted grapheme clusters may remain in the current threshold segment. Immediately before accepting the twentieth grapheme, the coordinator synchronously captures the preceding nineteen as a checkpoint; the twentieth begins the next threshold segment **with the same semantic `groupId`**.

Count user-visible grapheme clusters, not UTF-16 code units or raw key events. Paste/IME/other atomic input must not be split into synthetic partial editor transactions merely to satisfy the threshold.

This off-by-one rule is normative and must remain explicitly tested.

## Terminology

- **Body-changing transaction** — a Tiptap/ProseMirror transaction that changes persisted body content/formatting.
- **Edit mode** — clean, inserting, deleting, or an atomic edit boundary.
- **Threshold segment** — inserted graphemes since the most recent threshold checkpoint inside one semantic group.
- **Checkpoint** — immutable capture of node ID, group ID/reason, sanitized HTML, merged incremental Yjs update and complete Yjs state; persistence yields one `updateBody` revision.
- **Edit group** — one human-meaningful continuous episode. It may contain multiple physical checkpoints sharing one `groupId`.
- **Seal** — end the current semantic group; if dirty, capture/checkpoint it, otherwise create no revision.
- **Controlled transition** — an application action that may hide/replace the editor or externalize state and therefore must await required checkpoint work.

## Input classification contract

Classification belongs at the ProseMirror/Tiptap transaction plus relevant `beforeinput`/composition boundary, not raw `keydown` and not Yjs byte length.

### Insertions

- A normal insertion starts/continues `inserting` mode.
- Inserted grapheme clusters count toward the current threshold segment.
- Before the threshold-triggering grapheme is accepted, capture the prior dirty segment and retain the same group ID.
- IME composition is not checkpointed mid-composition; capacity/threshold handling must preserve the composition as one accepted semantic unit.
- Replacement/autocorrect input is treated atomically rather than reconstructed as artificial key events.

### Deletions

- Backspace/Delete/cut/replacement removal are deletion-class changes.
- First deletion after dirty insertion/atomic work captures and seals that prior group before the deletion is accepted.
- Consecutive deletions remain one deletion group rather than one revision per repeated key.
- First insertion after dirty deletion captures/seals deletion first, then starts a new insertion group.
- Starting deletion while clean does not create a duplicate pre-delete checkpoint.

### Selection and focus

- Only a selection-only transaction with a real selection change is a cursor boundary.
- Selection movement caused by the same doc-changing typing/format transaction is not an independent boundary.
- The first qualifying selection move after dirty work captures/seals once; subsequent navigation while clean is silent.
- Leaving a dirty body for another block, metadata control, History, header, Navigator, or outside the app seals that body group once.
- Merely opening/closing an auxiliary panel while focus stays in the body is not a checkpoint event.
- Once focus has left a dirty body and the group is sealed, browsing Navigator/History or responsive handoff between those panels does not create further body checkpoints unless later body work makes the editor dirty again.

### Atomic edits

Paste, body drop, cut, formatting an existing selection, undo and redo are semantic atomic edits. Their ordering is normative:

1. if unrelated insertion/deletion work is dirty, capture and seal it **before** accepting the atomic transaction;
2. accept the complete atomic editor transaction as one semantic unit without threshold-fragmenting it;
3. immediately capture the resulting body state as an `atomic-edit` checkpoint and seal that atomic group **before** accepting later ordinary body work.

Thus an atomic edit never inherits an unrelated open group and never leaves its accepted result waiting for an idle/focus boundary before its own checkpoint. Stored-mark changes that do not change the document create no checkpoint by themselves. Programmatic persistence/hydration loads never create user-edit checkpoints.

### Idle timer lifecycle

`idleTimeoutMs` applies only to accepted dirty body work:

- after each accepted body-changing transaction that leaves an open dirty group, start or reset the idle timer from that activity;
- selection/cursor movement by itself does not extend the timer; if it is a qualifying boundary, it seals immediately instead;
- expiry captures and seals the current dirty group exactly once;
- cancel the timer when the coordinator becomes clean, frozen for a controlled transition, disposed/unmounted, or after capture/seal;
- historical mode does not own a live editor/coordinator and therefore has no body idle timer;
- deterministic tests use an injected/fake clock rather than real wall time.

## State-machine contract

| Current state | Event | Required checkpoint/group action | Next state |
|---|---|---|---|
| clean | insertion | allocate group after accepted change; no pre-checkpoint | inserting |
| inserting | insertion below threshold | retain group | inserting |
| inserting | threshold-triggering insertion | capture prior segment **before** input; retain group; reset segment | inserting |
| clean | deletion | no duplicate pre-checkpoint; allocate group after accepted change | deleting |
| inserting | first deletion | capture/seal insertion before deletion; allocate deletion group | deleting |
| deleting | further deletion | retain group | deleting |
| deleting | first insertion | capture/seal deletion before insertion; allocate insertion group | inserting |
| dirty | atomic edit | capture/seal prior group before input; accept atomic transaction; capture/seal atomic result immediately | clean |
| dirty | first qualifying selection/focus boundary | capture/seal once | clean |
| dirty | idle expiry | capture/seal | clean |
| dirty | controlled transition | freeze, capture/seal, await required FIFO prefix | frozen/clean on success |
| clean | selection/focus/idle boundary | no operation | clean |
| any | persistence/capture failure | retain exact work; block unsafe transition | failed/frozen until retry/progress |

“Checkpoint after a tree operation” is implemented as the stronger ordering rule: pending body work is captured and accepted **before** a tree operation that could retarget/hide/remove the editor. The postcondition is that no prior body group remains unsafe after the structural operation.

## Synchronous capture and asynchronous persistence

At a checkpoint boundary, capture is synchronous with respect to accepting later editor state:

1. detach/merge pending Yjs updates;
2. read and sanitize the matching editor HTML;
3. encode the complete Yjs state;
4. create one immutable checkpoint object with the current node/group/reason;
5. enqueue it for serialized persistence;
6. allow later ordinary editing only while the bounded queue remains safe;
7. controlled transitions remain frozen until their required queued work is accepted.

This prevents later text from leaking into an earlier checkpoint while avoiding a gateway round trip for every accepted character.

## Backpressure and resource bound

The current safety high-water mark is **two detached checkpoints** (`MAX_PENDING_BODY_CHECKPOINTS = 2`): at most one in flight and one queued successor.

That number is an integrity/resource policy, not the user-tunable character/idle policy. Changing it requires explicit memory/failure tests.

Required behavior:

- when two detached checkpoints are pending, further body-changing input is visibly blocked/frozen until capacity returns;
- a slow successful gateway exercises the same bound as a failed gateway;
- the threshold-triggering or already-accepted atomic input must not be silently dropped when capacity is reached;
- an oversized/failed capture leaves the mounted editor recoverable/frozen with an actionable error rather than truncating state;
- if a controlled transition arrives at the high-water mark while a later dirty segment still lives in the editor, freeze immediately, wait for one FIFO slot, capture that frozen segment, enqueue it, then drain it before the transition proceeds;
- no implementation may create an unbounded list of full Yjs states merely to keep accepting typing.

## Failure and retry contract

A persistence failure is not allowed to reinterpret current editor state.

- The failed checkpoint remains the exact immutable FIFO head, including original group ID/reason/HTML/Yjs payload.
- Any already-captured successor remains behind it in order.
- Retry resubmits that same immutable head; it does not recapture current editor contents or merge group identities.
- A controlled transition stays blocked/canceled until the required prefix succeeds.
- Body editing may resume only when failure/capacity state makes that safe; the current implementation prefers visible freezing over unbounded buffering.
- No rejection may silently clear pending Yjs updates, group identity, timer state, or the editor value.

## Group identity

Threshold checkpoints in one uninterrupted semantic episode reuse one `groupId`. A semantic boundary seals that episode; the next edit gets a new group.

The controller/persistence layer preserves the producer-supplied `groupId`. Adapters do not invent or regroup semantic episodes.

## WP-5 History projection

History implements the presentation side of this design:

- contiguous `updateBody` contributions sharing one non-null `groupId` collapse;
- non-body operations and null/different groups break contiguity;
- the newest/final checkpoint is the collapsed row's canonical revision;
- expansion exposes exact physical checkpoints;
- raw contribution count and visible grouped-row count are distinct;
- groups coalesce when an older raw History page is appended;
- a possibly incomplete oldest group reports `at least N`;
- standalone can fetch the complete group through an exact paged `groupId` query;
- exact expansion ignores ordinary History search/node filters;
- Tauri exact group querying remains host-deferred until WP-10.

Grouping never rewrites/deletes physical history.

## Persistence consequences

Grouping is not compaction. Every physical checkpoint still stores an ordinary contribution and full revision snapshot. Long writing sessions can therefore grow storage substantially even though History shows one semantic row.

Do not reduce physical history merely to make the UI shorter. Any snapshot compaction/retention/replay design needs its own integrity/recovery specification.

## Safety invariants

1. Accepted body content must not be hidden/unmounted before required pending checkpoint work is captured and ordered.
2. Retry preserves the exact immutable failed checkpoint and FIFO order.
3. IME composition is not split arbitrarily.
4. Sanitized HTML, incremental update and full Yjs state are captured together at one boundary.
5. No-op boundaries create no contribution.
6. Grouping is presentation only and never mutates ledger history.
7. A controlled structural/lifecycle operation cannot overtake body work that must precede it.
8. At most two detached checkpoints are retained under the current high-water policy.
9. Changing checkpoint/group semantics requires coordinated editor, History, persistence and test review.

## Deterministic acceptance cases

These are intentionally explicit regression oracles rather than an inventory of current test names:

1. With threshold `20`, nineteen graphemes remain dirty; before the twentieth is accepted, the first nineteen are captured and the twentieth starts a new threshold segment under the same `groupId`.
2. First deletion after insertion captures insertion before deletion; repeated deletion does not create one revision per repeat.
3. First insertion after deletion captures deletion before insertion.
4. First qualifying selection/focus departure after dirty work captures once; later clean navigation is silent.
5. Dirty work left idle for `idleTimeoutMs` captures/seals once; accepted body activity resets that deadline while selection-only movement does not extend it.
6. Paste/cut/format/undo/redo and composition completion obey atomic/IME rules: prior dirty work seals before the accepted atomic transaction, and its resulting checkpoint seals immediately afterward without synthetic threshold fragments.
7. Every controlled create/move/collapse/delete/history/restore/export/backup/Close path drains required body work before invalidating its editor context.
8. A failed checkpoint is retried as the same immutable object and no later checkpoint overtakes it.
9. A slow unresolved head plus one successor reaches the two-checkpoint high-water mark; later body changes are blocked until progress.
10. A controlled transition requested while the queue is full waits for capacity, captures the frozen later segment, then proceeds in FIFO order.
11. Threshold checkpoints in one episode collapse in History while each physical revision remains individually accessible.
12. A group spanning raw History pages coalesces and exact standalone expansion returns the complete deduplicated group.
13. Navigator visibility/browsing itself creates no checkpoint; only a real dirty-body focus departure does, once.

## Remaining work related to this design

- real-browser IME/focus/accessibility qualification (WP-8);
- standalone long-edit/history qualification (WP-9);
- native exact group-query parity (WP-10);
- measuring full-snapshot growth and designing compaction only if evidence justifies it;
- stronger Rust verification that HTML/Yjs representations describe a consistent accepted edit.
