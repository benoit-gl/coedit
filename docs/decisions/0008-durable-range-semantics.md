# ADR 0008: Durable Range semantics and staged implementation

**Status:** Accepted behavior; Step 6 representation decision unresolved

**Date:** 2026-09-02

**Amended:** 2026-09-03

## Context

The earlier attributed-text contract modeled a durable target as one pair of
stable positions inside one InlineContent. That shape cannot preserve the
required behavior across structural split, merge, movement, and multi-span
references.

The design must also avoid making ordinary document edits proportional to the
number of retained links, comments, or other Range holders. Carrier
qualification must prove feasibility without forcing Step 3 to select and
implement the complete Range-tracking representation.

## Decision

Define Range as a document-relative durable value and engine service. Range is
not a canonical entity, has no independent product identity, and creates no
document-wide registry.

Each Range records its document-scoped creation `VersionToken`. Each source
member records its original Block, InlineContent, and boundaries. No globally
unique Version identifier is required because the caller supplies the document
context.

Direct creation is atomic against the current visible Version. It fails if any
supplied member cannot resolve. Span creation otherwise accepts the caller's
members without sorting, merging, deduplication, or semantic validation. Members
can overlap, repeat, be sparse or adjacent, have zero length, and use arbitrary
creation order.

A zero-length Span remains a greedy Span. A Positional Range remains a distinct,
non-greedy, preceding-sticky position.

Resolution returns surviving spans in creation order and descendant lineage
order. It omits unresolved, ambiguous, or deleted members. Text resolution
concatenates their exact text without adding separators. Overlap and duplication
therefore produce duplicate text.

Movement, split, and merge preserve Range lineage. Copy, clone, duplication,
import, and paste do not. Deleting a source container without a
lineage-preserving merge makes its member absent from later resolution. A split
exactly at a Span boundary creates no zero-length descendant on the other side.

The application can explicitly rationalize a Range. Rationalization can merge
only consecutive, exactly adjacent spans whose adjacency resulted from a
lineage-preserving merge of adjacent content. It returns a new Range rebased to
the selected Version and never runs implicitly.

Parsing a serialized Range is best-effort. It omits unresolved or ambiguous
members and returns a new Range rebased to the selected Version. Ordinary direct
creation remains all-or-none.

A Range serialization is a self-contained document-relative description or URI
fragment. The application owns the enclosing document URI and scheme. Internal
links resolve against their current document. External deep links use the
document selected by the URI. The Range service performs no cross-document
reconciliation.

Every Version remains exactly materializable for the lifetime of its retained
document. Private physical materialization snapshots can accelerate access but
do not create product Versions. Permanent Version materialization lets the
engine resolve Ranges lazily without a Range ledger.

Implementation remains staged:

1. Step 3 qualifies Yjs and Automerge, including Range feasibility, and selects
   the collaborative carrier.
2. Step 4 implements the selected attributed-content and structural core.
3. Step 5 establishes permanent exact History and Version materialization.
4. Step 6 implements the durable Range service and selects the Range-tracking
   lineage representation.

The exact lineage representation is **not selected** by this ADR. Persistent
lineage, piece-oriented structures, derivation graphs, carrier-native identity,
and hybrid approaches remain candidates.

## Consequences

- `RANGE_MODEL.md` is the direct authority for durable Range behavior.
- A bare Range needs document context but no global Version identifier.
- Range creation preserves input order and multiplicity without normalization.
- Resolution can be partial but never rebinds an omitted member speculatively.
- A Span never becomes positional because it has zero length.
- Range lineage follows movement, split, and merge but not copying.
- Rationalization is explicit and limited to adjacency caused by a lineage merge.
- Internal and external document selection remain application concerns.
- All Versions and required lineage remain materializable while the document is
  retained.
- Ordinary edits do not scan or rewrite retained Range values.
- Comment records and repair UX remain post-MVP consumers of the reusable
  headless Range service.

## Step 6 decisions

Step 6 must still close:

- the lineage representation and its carrier integration;
- exact carrier-neutral API names and result wrappers;
- the all-members-omitted parse result and optional parse diagnostics;
- the zero-length Span tie-break at an exact structural split;
- Positional Range behavior for split, merge, deletion, and replacement;
- the fragment grammar, encoding, versioning, escaping, and size limits;
- source-member and serialized-size resource limits; and
- the final internal-link serialized shape.

Detailed comment repair policy remains a separate post-MVP decision.

## Authority

[`../RANGE_MODEL.md`](../RANGE_MODEL.md) owns the detailed behavioral and staged
qualification contract. [`../TEXT_POSITION_MODEL.md`](../TEXT_POSITION_MODEL.md)
owns editor and carrier position boundaries.
[`../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md)
owns formatting, Origin, link, and comment-holder behavior outside the Range
contract. [`../../SCAFFOLDING_PLAN.md`](../../SCAFFOLDING_PLAN.md) owns step and
gate order.
