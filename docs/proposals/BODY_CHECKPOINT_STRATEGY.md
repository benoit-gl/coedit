# Body checkpoint and semantic-group strategy — decision record

**Status:** implemented through WP-4, WP-5 and WP-7 integration. Browser/native qualification and storage-growth work remain separate concerns.

This document preserves the design decisions behind the current rich-text checkpoint system. Current implementation detail belongs in [Frontend design](../FRONTEND_DESIGN.md), [Architecture](../ARCHITECTURE.md), [Testing](../TESTING.md), and source.

## Problem solved

A fixed short debounce produced save behavior that was difficult to reason about, tied persistence to idle timing, and created noisy History. The current design separates:

- **physical safety checkpoints** — immutable `updateBody` revisions/snapshots; and
- **semantic edit groups** — human-visible writing episodes containing one or more checkpoints that share a `groupId`.

## Adopted policy

`BodyCheckpointPolicy` owns two centralized injectable values:

- `batchCharacterThreshold`;
- `idleTimeoutMs`.

Production defaults live in one module; tests inject smaller values. Values are positive safe integers and the idle timeout stays within the portable browser timer ceiling.

## Adopted coordinator behavior

`BodyEditBatchCoordinator` owns semantic edit mode/group identity, threshold-segment counting, idle timing, synchronous capture, ordered bounded persistence, retry/backpressure, and controlled-transition drains.

Important boundaries include:

- insertion/deletion mode changes;
- explicit selection/cursor movement after dirty work;
- focus departure;
- idle expiry;
- paste/drop/cut/format/undo/redo atomic edits;
- IME composition completion;
- controlled tree/lifecycle transitions.

The coordinator retains at most a bounded number of detached checkpoints and freezes further body edits when safe progress cannot be guaranteed.

## Group identity

Threshold checkpoints in one uninterrupted semantic episode reuse one `groupId`. A semantic boundary seals that episode; the next edit gets a new group.

The controller/persistence layer must preserve the producer-supplied `groupId`. Adapters do not invent or regroup semantic episodes.

## WP-5 History projection

History now implements the presentation side of this design:

- contiguous `updateBody` contributions sharing one non-null `groupId` collapse;
- non-body operations and null/different groups break contiguity;
- the newest/final checkpoint is the collapsed row's canonical revision;
- expansion exposes exact physical checkpoints;
- raw contribution count and visible grouped-row count are distinct;
- groups coalesce when an older raw History page is appended;
- a possibly incomplete oldest group reports `at least N`;
- standalone can fetch the complete group through an exact paged `groupId` query;
- Tauri exact group querying remains host-deferred until WP-10.

This closes the earlier “group IDs exist but History does not collapse them” gap.

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
7. Changing checkpoint/group semantics requires coordinated editor, History, persistence and test review.

## Remaining work related to this design

- real-browser IME/focus/accessibility qualification (WP-8);
- standalone long-edit/history qualification (WP-9);
- native exact group-query parity (WP-10);
- measuring full-snapshot growth and designing compaction only if evidence justifies it;
- stronger Rust verification that HTML/Yjs representations describe a consistent accepted edit.
