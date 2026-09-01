# ADR 0007: Structural position allocator abstraction

**Status:** Accepted

**Date:** 2026-09-01

## Context

ADR 0003 selected flat `Placement = { position, depth }` but deliberately left
the dense position algorithm open. Step 3 must characterize established ordering
approaches before it selects one.

A test-only qualification adapter would duplicate the boundary that the
production structural engine already needs. It could also let qualification and
production exercise different semantics.

The structural model must remain deterministic if primary positions collide,
even when the selected allocator normally prevents collisions.

## Decision

Make the structural position allocator an internal production abstraction of the
document engine. Qualification uses that same abstraction.

The abstraction provides behavior equivalent to primary-position comparison,
deterministic position comparison, and ordered run allocation between optional
bounds. The structural engine does not inspect candidate-specific position
representation.

The structural engine owns collision policy and normalization. The allocator owns
position generation and its private algorithm. Stable `BlockId` remains an
available final projection tie-break.

The engine must tolerate primary-position collisions. An allocator can prevent
them during normal allocation, but collision freedom is not a tree-projection
precondition.

Step 3 must run one common behavioral and characterization suite against viable
algorithm families through the production abstraction. Candidate-specific unit
tests remain separate.

Qualification evidence and the final selection decision must be persisted in the
repository. An experiment that is not recorded is not qualification evidence.

## Rationale

One production abstraction prevents the qualification harness from becoming a
parallel design. It also keeps tree semantics independent from LSEQ, fractional
indexing, Fugue-family algorithms, or another future position representation.

Keeping collision policy in the structural engine preserves one recoverable tree
model across allocators. Keeping allocation mechanics behind the abstraction
allows algorithms with different uniqueness and encoding strategies to compete
on the same required behavior.

## Consequences

- The common qualification suite can be reused for future allocator changes.
- A locally developed allocator is one candidate, not an implicit selection.
- Candidate-specific representation metrics become characterization data rather
  than common representation assertions.
- Concrete allocator selection remains open until persisted evidence supports it.

## Authority

[`../STRUCTURAL_POSITION_ALLOCATOR.md`](../STRUCTURAL_POSITION_ALLOCATOR.md) owns
the allocator abstraction and qualification contract.
[`../STRUCTURAL_CARRIER_MODEL.md`](../STRUCTURAL_CARRIER_MODEL.md) continues to own
flat placement, tree projection, and structural concurrency semantics.
