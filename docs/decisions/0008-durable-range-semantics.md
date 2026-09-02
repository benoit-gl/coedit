# ADR 0008: Durable Range semantics

**Status:** Accepted behavior; representation unresolved

**Date:** 2026-09-02

## Context

The earlier attributed-text contract modeled a durable text target as one pair of
stable positions inside one InlineContent. That shape is sufficient for a simple
passage target, but it cannot express the behavior required after structural
split, merge, and move operations.

A long-lived reference can need to preserve semantic text even when its current
material becomes discontiguous, moves into several Blocks, or later returns to
one InlineContent with excluded material between included parts.

The design must also avoid making normal document edits proportional to the
number of comments, links, or other retained references.

## Decision

Define Range as an external durable reference contract. Range is not a canonical
document entity and the document has no Range registry.

A Range has an immutable kind:

- a Span Range is greedy at both boundaries and can resolve to zero, one, or
  several current spans; and
- a Positional Range is explicitly zero-length, non-greedy, and sticky toward
  preceding content in logical text order within its current content container.

A Range can be created directly from several spans. Resolved spans can cross
Blocks and InlineContents, and several resolved spans can exist in one
InlineContent.

Structural tree order does not define Range semantic order. Moving Blocks does
not reorder the semantic parts of an existing Range.

Each current resolved span is independently queryable.

A Range can be serialized to a self-contained versioned representation suitable
for a URI or URI suffix. Serialization rebases the Range against the selected
Version and can remove obsolete tracking references. Ordinary edits do not scan
or rewrite all retained Range values.

The exact lineage representation is **not selected**. Persistent lineage,
piece-oriented structures, derivation graphs, carrier-native identity, and hybrid
approaches remain implementation/design candidates. No candidate is accepted by
this ADR.

## Consequences

- Older single-InlineContent range wording is superseded by `RANGE_MODEL.md`.
- Range behavior is distinct from the storage shape used by comments and links.
- A Span Range does not become positional when deletion makes it empty.
- Replacement semantics cannot depend on one editor-specific transaction shape.
- Split and merge can change the number and structural location of resolved
  spans without changing their semantic order.
- Range tracking must not make cheap Block movement depend on rewriting all
  references.
- Qualification must compare lineage representations against the accepted
  behavior before one is frozen.

## Open decisions

The following decisions remain open:

- the lineage representation and its carrier integration;
- Block and InlineContent identity rules for split and merge;
- the result of splitting exactly at a Positional Range;
- the serialized URI grammar, encoding, versioning, and size limits;
- the final internal-link serialized shape; and
- detailed comment repair policy for multi-span ambiguous or orphaned results.

## Authority

[`../RANGE_MODEL.md`](../RANGE_MODEL.md) owns the detailed behavioral contract.
[`../TEXT_POSITION_MODEL.md`](../TEXT_POSITION_MODEL.md) owns editor and carrier
position boundaries. [`../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md)
continues to own formatting, Origin, link, and comment lifecycle behavior outside
this Range contract.
