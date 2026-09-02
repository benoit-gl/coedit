# ADR 0008: Durable Range semantics and staged implementation

**Status:** Accepted behavior; Step 6 representation decision unresolved

**Date:** 2026-09-02

## Context

The earlier attributed-text contract modeled a durable text target as one pair of
stable positions inside one InlineContent. That shape cannot express the required
behavior after structural split, merge, and move operations.

A long-lived reference can need to preserve semantic text when its current
material becomes discontiguous, moves into several Blocks, or returns to one
InlineContent with excluded material between included parts.

The design must avoid making normal document edits proportional to the number of
comments, links, or other retained references. The implementation plan must also
let Range feasibility affect carrier selection without forcing Step 3 to select
and implement the complete Range-tracking representation.

## Decision

Define Range as a durable reference value and engine service contract. Range is
not a canonical entity, has no independent product identity, and creates no
document-wide registry. A holder can store it externally or embed it as a value
in canonical internal-link metadata.

A Range has an immutable kind:

- a Span Range is greedy at both boundaries and can resolve to zero, one, or
  several current spans; and
- a Positional Range is explicitly zero-length, non-greedy, and sticky toward
  preceding content in logical text order within its current Block and
  InlineContent.

A Range can be created directly from several spans. Resolved spans can cross
Blocks and InlineContents, and several resolved spans can exist in one
InlineContent.

Structural tree order does not define Range semantic order. Moving Blocks does
not reorder the semantic parts of an existing Range. Each current resolved span
is independently queryable.

A Range can be serialized to a self-contained versioned representation suitable
for an absolute URI or document-relative URI suffix. Serialization rebases the
Range against the selected Version and can remove obsolete tracking references.
Ordinary edits do not scan or rewrite all retained Range values.

Implementation is distributed across separate steps:

1. Step 3 qualifies Yjs and Automerge, including Range feasibility, and selects
   the collaborative carrier.
2. Step 4 implements the selected attributed-content and structural core.
3. Step 5 establishes exact History and Version materialization.
4. Step 6 finalizes and implements the durable Range service and selects the
   Range-tracking lineage representation.

The exact lineage representation is **not selected** by this ADR. Persistent
lineage, piece-oriented structures, derivation graphs, carrier-native identity,
and hybrid approaches remain candidates.

## Consequences

- `RANGE_MODEL.md` is the direct authority for durable Range behavior.
- Older single-InlineContent range shapes are replaced with the shared Range
  value contract.
- Range behavior is distinct from the storage and lifecycle of each Range holder.
- A Span Range does not become positional when deletion makes it empty.
- Replacement semantics cannot depend on one editor-specific transaction shape.
- Split and merge can change the number and structural location of resolved spans
  without changing their semantic order.
- Range tracking must not make cheap Block movement depend on rewriting all
  references.
- Carrier qualification must prove Range feasibility before one carrier wins.
- The later Range gate must compare and select lineage representations before
  `.coedit` version 1 or internal-link Range encoding is frozen.
- Comment records and repair UX remain post-MVP; the reusable headless Range
  service remains part of the document-engine MVP.

## Step 6 decisions

Step 6 must close:

- the lineage representation and its carrier integration;
- the carrier-neutral API and resolution-result taxonomy;
- direct multi-span ordering, overlap, adjacency, duplicate, empty, stale, and
  cross-Version validation;
- Block and InlineContent identity rules for split and merge;
- the result of splitting exactly at a Positional Range;
- behavior when an owning container is deleted, copied, replaced, or merged;
- document and Version scope in absolute URI and URI-suffix forms;
- the serialized URI grammar, encoding, versioning, escaping, and size limits;
- the final internal-link serialized shape; and
- reusable evidence for empty-result, uncertainty, and unresolved-target
  distinctions.

Detailed comment repair policy remains a separate post-MVP decision.

## Authority

[`../RANGE_MODEL.md`](../RANGE_MODEL.md) owns the detailed behavioral and staged
qualification contract. [`../TEXT_POSITION_MODEL.md`](../TEXT_POSITION_MODEL.md)
owns editor and carrier position boundaries.
[`../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md)
owns formatting, Origin, link, and comment-holder behavior outside the Range
contract. [`../../SCAFFOLDING_PLAN.md`](../../SCAFFOLDING_PLAN.md) owns step and
gate order.
