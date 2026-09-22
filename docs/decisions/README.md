# Architecture decision records

This directory preserves the context, alternatives, evidence, and consequences
behind accepted architectural decisions.

Decision records are durable rationale, not a second normative specification.
The authoritative document listed in each record controls product, architecture,
implementation, format, verification, and planning behavior.

## Lifecycle policy

Treat an accepted ADR as a historical record of the decision that was made. Do
not rewrite its context, decision, alternatives, rationale, evidence, or
consequences to make the record agree with a later design.

Maintenance metadata can change after acceptance. This includes the ADR status,
supersession relationships, and the index in this file. Keep those updates
separate from the historical decision text.

When a later decision invalidates all or part of an accepted ADR:

- retain the older ADR;
- mark its status clearly as fully or partly superseded;
- add a `Superseded by` reference near the ADR metadata that links to each ADR
  that replaces it;
- state the affected scope when supersession is partial; and
- update this index to show the same current status.

A later ADR can refine, extend, or build on an accepted ADR without invalidating
it. In that case, the older ADR remains accepted and does not have to be amended
only to add a backward reference. The newer ADR must identify the earlier
decision that it refines or extends when that relationship is material to
understanding the new decision.

References inside the historical decision text remain part of that historical
record. They do not require obsolete documents to remain on `main`, and they do
not justify rewriting the accepted decision only to keep old links current. A
supersession notice must provide the current path forward when the old decision
is no longer authoritative.

## Automated enforcement

For every ADR already present on the target branch, all content beginning with
the first level-two heading (`##`) is immutable. Maintenance changes belong in
the header before that heading. The `adr-integrity` pull-request check rejects
historical-body edits, deletion of existing ADRs, invalid supersession metadata,
broken links in mutable ADR headers, and disagreement between ADR lifecycle
classes in the metadata and this index. It deliberately ignores links in
immutable historical bodies.

## Index

| ADR                                                                                                                | Status                                                  | Subject                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`0001-collaborative-content-provenance-history.md`](0001-collaborative-content-provenance-history.md)             | Superseded in part by ADR 0010                          | Intrinsic rich-text metadata, provenance, comments, causal History, persistence, and technology direction                  |
| [`0002-global-durable-identity-and-empty-genesis-root.md`](0002-global-durable-identity-and-empty-genesis-root.md) | Accepted                                                | Global durable UUID namespace and completely empty engine-level genesis root                                               |
| [`0003-flat-structural-placement.md`](0003-flat-structural-placement.md)                                           | Accepted                                                | Flat Block placement, recoverable structural convergence, and position-allocation qualification                            |
| [`0004-intrinsic-link-targets.md`](0004-intrinsic-link-targets.md)                                                 | Superseded in part by ADR 0010                          | Opaque link metadata, document-local Block targets, and optional Range refinement                                          |
| [`0005-semantic-interpretation-boundaries.md`](0005-semantic-interpretation-boundaries.md)                         | Superseded in part by ADR 0010                          | Durable semantic boundaries, contextual judgments, and implementation-capacity limits                                      |
| [`0006-text-position-ownership.md`](0006-text-position-ownership.md)                                               | Superseded in part by ADR 0010                          | Editor-native transient positions, carrier-position boundaries, and Unicode coordinate ownership                           |
| [`0007-structural-position-allocator-abstraction.md`](0007-structural-position-allocator-abstraction.md)           | Accepted                                                | Production allocator abstraction, collision tolerance, and reusable qualification                                          |
| [`0008-capacity-contract-maturity.md`](0008-capacity-contract-maturity.md)                                         | Accepted                                                | Capacity maturity, ownership, experimental evidence, and promotion gates                                                   |
| [`0009-durable-range-semantics.md`](0009-durable-range-semantics.md)                                               | Superseded in part by ADR 0010                          | Document-relative multi-span Range semantics, permanent Version basis, and staged qualification                            |
| [`0010-typed-inline-content-payloads.md`](0010-typed-inline-content-payloads.md)                                   | Accepted direction; mixed-operation semantics at Gate B | Media-Type-labelled InlineContent payloads, universal replacement, deterministic convergence, and application syntax split |
