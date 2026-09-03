# Architecture decision records

This directory preserves the context, alternatives, evidence, and consequences
behind accepted architectural decisions.

Decision records are durable rationale, not a second normative specification.
The authoritative document listed in each record controls product, architecture,
implementation, format, verification, and planning behavior. When a decision is
superseded, retain its record and add the replacement relationship instead of
rewriting history.

## Index

| ADR                                                                                                                | Status                                              | Subject                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`0001-collaborative-content-provenance-history.md`](0001-collaborative-content-provenance-history.md)             | Accepted                                            | Intrinsic rich-text metadata, provenance, comments, causal History, persistence, and technology direction |
| [`0002-global-durable-identity-and-empty-genesis-root.md`](0002-global-durable-identity-and-empty-genesis-root.md) | Accepted                                            | Global durable UUID namespace and completely empty engine-level genesis root                              |
| [`0003-flat-structural-placement.md`](0003-flat-structural-placement.md)                                           | Accepted                                            | Flat Block placement, recoverable structural convergence, and position-allocation qualification           |
| [`0004-intrinsic-link-targets.md`](0004-intrinsic-link-targets.md)                                                 | Accepted                                            | Opaque link metadata, document-local Block targets, and optional range refinement                         |
| [`0005-semantic-interpretation-boundaries.md`](0005-semantic-interpretation-boundaries.md)                         | Accepted                                            | Durable semantic boundaries, contextual judgments, and implementation-capacity limits                     |
| [`0006-text-position-ownership.md`](0006-text-position-ownership.md)                                               | Accepted                                            | Editor-native transient positions, carrier-stable durable positions, and Unicode coordinate ownership     |
| [`0007-structural-position-allocator-abstraction.md`](0007-structural-position-allocator-abstraction.md)           | Accepted                                            | Production allocator abstraction, collision tolerance, and reusable qualification                         |
| [`0008-durable-range-semantics.md`](0008-durable-range-semantics.md)                                               | Accepted behavior; Step 6 representation unresolved | Document-relative multi-span Range semantics, permanent Version basis, and staged qualification           |
