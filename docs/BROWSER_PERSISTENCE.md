# Browser persistence specification

**Status:** Accepted browser persistence target; exact physical chunk schema and
checkpoint cadence are selected during implementation and measurement.

## 1. Purpose and authority

This document defines crash-safe browser persistence, multi-tab conflict
behavior, quota and recovery UX, and the separation between the internal
IndexedDB repository and the portable `.coedit` artifact.

[`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) controls engine and adapter
authority. [`PORTABLE_DOCUMENT_FORMAT.md`](PORTABLE_DOCUMENT_FORMAT.md) controls
portable Save/Open. This document controls browser repository behavior.
[`MVP_VERIFICATION_PLAN.md`](MVP_VERIFICATION_PLAN.md) controls qualification
evidence.

## 2. Authority boundary

The `DocumentEngine` is the only document authority. It commits through a
repository port supplied by the browser composition root. The repository stores
and retrieves opaque engine records; it does not interpret Blocks, formatting,
Origins, History semantics, or CRDT effects independently.

The UX can list local document descriptors, display durability status, request
retry/export, and select a document to open. It cannot rewrite repository rows,
advance a head, reconstruct History, or treat a browser-storage record as a
domain object.

The in-memory and IndexedDB repositories implement the same commit and recovery
contract. Core engine tests can use the in-memory implementation without browser
APIs.

## 3. Logical records

The physical schema is private, but it must support these logical records:

```text
LocalDocumentDescriptor
RepositoryHead
  documentId
  storageGeneration
  currentVersionToken
  currentFrontier/private head reference
  recoveryCheckpoint reference

ImmutableContributionRecord
ImmutableEffectOrUpdateChunk
PhysicalRecoveryCheckpoint
SuccessfulCommandReceipt / idempotency record
optional content-address and reachability indexes
```

A semantic History Checkpoint is a user-authored Contribution. A physical
recovery checkpoint is a storage optimization. They are never the same concept
or vocabulary.

Effect and checkpoint chunks can be content-addressed. SHA-256 detects
corruption and supports deduplication; it is not authentication.

## 4. Commit protocol

For an engine with a durable repository, a successful command is not published
until its durable commit succeeds.

1. Validate the attributed request and build a detached candidate state.
2. Produce and encode immutable Contribution, effect/update, Origin, receipt,
   and optional checkpoint records before opening the IndexedDB transaction.
3. Open one short read-write transaction covering the required stores.
4. Read the document head and compare its generation and Version with the
   command's expected repository base.
5. Insert immutable records. A content-addressed chunk with the same hash and
   canonical bytes can be reused. Reuse of another record ID is accepted only
   under the command-idempotency rules; a same hash/ID with different bytes is
   corruption.
6. Store the successful CommandId receipt.
7. Advance the compare-and-swap head to the resulting Version and generation.
8. Commit the IndexedDB transaction.
9. Only after commit, publish the candidate as current in memory, return the
   receipt, and emit invalidation.

Any failure before transaction commit changes neither durable head nor visible
engine state. A transaction abort cannot leave a published partial Contribution.
Implementations must not await unrelated work or perform expensive encoding
inside the short IndexedDB transaction.

An engine configured explicitly with an ephemeral in-memory repository can
publish after its atomic in-memory commit. The UX must label that session as not
durably stored.

## 5. Editor journal and History grouping

Every accepted engine command produces one immutable Contribution and Version.
Its repository record is the crash journal; there is no second set of unsealed
document mutations that later becomes History.

The editor can combine transient ProseMirror transactions before it submits a
command, subject to controlled-transition and resource rules. Once submitted,
the command is immutable. Several prompt editor Contributions can share a
`semanticGroupId`, and History presentation can group them without changing
their identities or Versions.

IME composition is not split mid-composition. Paste, cut, selection
replacement, formatting, undo, and redo are submitted as atomic editor actions.
Idle, focus/owner transfer, change of edit mode, and controlled transitions seal
the current semantic group. Exact time and character thresholds are
tunable UX parameters, not durable semantics.

A failed commit retains the exact detached command/draft needed for retry and
surfaces degraded durability. Typing is not blocked merely because two complete
artifact serializations are pending; ordinary autosave does not serialize a
complete artifact. Resource-limit enforcement can reject the operation that
would exceed an accepted bound, but a hidden queue threshold must not silently
discard work.

## 6. Open and recovery

Opening a local document:

1. reads one stable RepositoryHead;
2. validates the referenced physical checkpoint and its hashes;
3. replays subsequent reachable immutable Contributions/effects in the private
   order required by the selected carrier;
4. verifies command receipts, contributor/origin references, document
   invariants, and the resulting Version/frontier; and
5. publishes a candidate engine only after complete success.

Malformed, missing, mis-hashed, incompatible, or over-limit records produce a
typed recovery error. They do not partially open or replace another active
engine. Recovery diagnostics offer export of recoverable raw evidence where
safe; they do not improvise a repaired document silently.

Prepared maintenance/checkpoint chunks or records left unreachable by a
superseded head are not current document state. A later bounded garbage collector
may remove verified unreachable records after accounting for active heads,
every product Version, required Range lineage, concurrent tabs, and recovery
checkpoints.

## 7. Checkpoint and compaction rules

Create physical recovery checkpoints periodically according to measured update
growth and recovery latency. Checkpoint creation must not create a product
Contribution or Version.

Compaction can replace private replay paths only after a new checkpoint is fully
written and validated. It cannot make any VersionToken, semantic Checkpoint,
Origin, required Range lineage, durable Range behavior, or future comment-holder
behavior unavailable. Every Version remains exactly materializable for the
lifetime of the retained document.

Complete snapshots per Contribution are permitted in bounded in-memory tests or
an explicitly identified early prototype. They are not the Step 13 target and
must not become the public History or portable-format abstraction.

## 8. Multi-tab behavior

The compare-and-swap head is the authority for competing writers. Two tabs that
commit against the same head cannot both advance it under a local single-writer
policy.

`BroadcastChannel` can notify other tabs that a local document changed. It is an
invalidation hint, not a commit log and not an authority. A stale tab reopens or
re-queries and either rebases through accepted engine behavior or presents an
explicit conflict. It never overwrites the newer head silently.

When networked CRDT replication is implemented, local repository commits still
obey the same atomic record/head protocol; the replication adapter, not
BroadcastChannel ordering, determines causal integration.

## 9. Quota, persistence, and backup UX

Use `navigator.storage.estimate()` where supported to report usage and quota.
Use `navigator.storage.persisted()` and, after an appropriate user interaction,
`navigator.storage.persist()` to request persistent storage. Denial is not a
fatal error, but the UX must accurately report that eviction remains possible.

Quota exhaustion, transaction abort, browser-private mode limitations, and
storage unavailability return typed errors. A failed commit does not report
success. The application preserves retryable work and offers explicit `.coedit`
export/backup while sufficient committed state remains available.

The UX should warn before measured usage approaches a browser-specific safe
margin. The exact warning threshold is a Step 14 measurement outcome, not a
portable document limit.

## 10. `.coedit` separation

The IndexedDB repository is optimized for incremental local commit and recovery.
The `.coedit` artifact is optimized for explicit portable Save/Open, backup, and
interchange between Coedit installations.

An explicit Save asks the engine to assemble the current Version and complete
History into `.coedit` bytes under
[`PORTABLE_DOCUMENT_FORMAT.md`](PORTABLE_DOCUMENT_FORMAT.md). Normal autosave
does not repeatedly assemble or rewrite those bytes.

Opening `.coedit` first validates a candidate engine. Persisting that candidate
then uses the ordinary repository protocol; the file's physical layout never
becomes the IndexedDB schema by implication.

## 11. Limits and measurements

Before freezing checkpoint cadence, chunk size, compaction, or a new storage
engine, measure at least:

- 100,000-character InlineContent editing and recovery;
- 5,000 Contributions and representative formatting/Origin density;
- cold open, warm open, ordinary commit, checkpoint, History materialization,
  and `.coedit` assembly latency;
- peak encoded and decoded memory;
- write amplification and database growth; and
- quota behavior in supported browsers and private modes.

Record target devices and pass budgets before performance qualification begins.
Correctness, atomicity, and no-data-loss requirements are not tradeable for a
faster candidate.

## 12. Required verification

The repository contract suite must cover:

- save, reopen, browser reload, and document isolation;
- exact CommandId retry and conflicting reuse;
- stale head and competing-tab compare-and-swap behavior;
- injected failure before each commit-protocol boundary;
- transaction abort without partial publication;
- corrupt, missing, duplicate, mis-hashed, unreachable, and incompatible chunks;
- recovery from a physical checkpoint plus later effects;
- quota denial/exhaustion and persistent-storage denial;
- visible degraded durability plus exact retry;
- safe unreachable-record cleanup;
- explicit `.coedit` assembly and reopen; and
- the same public engine contract against in-memory and IndexedDB repositories.

## 13. Deferred alternatives

Keep native IndexedDB as the initial implementation. A small reviewed Promise
wrapper such as `idb` is an implementation convenience, not an authority.

Defer OPFS, SQLite-WASM, and a native database until measurements show a
browser-inadequate requirement. Do not adopt PGlite, RxDB, Dexie, or
`y-indexeddb` as the document authority merely to avoid implementing Coedit's
Contribution/checkpoint transaction. A future Tauri shell supplies adapters to
the same engine and repository ports; it does not introduce a second Rust domain
model or revive the preserved SQLite schema by default.
