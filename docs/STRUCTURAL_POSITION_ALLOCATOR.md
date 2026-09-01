# Structural position allocator

**Status:** Accepted Step 3 allocator abstraction and qualification contract;
concrete algorithm selection remains open until persisted qualification evidence
exists.

## 1. Purpose and authority

This document defines the internal abstraction between the structural document
engine and the dense-order position allocator. It supplements
[`STRUCTURAL_CARRIER_MODEL.md`](STRUCTURAL_CARRIER_MODEL.md), which owns flat Block
placement, tree projection, and structural concurrency semantics.

The abstraction is part of the production engine design. It is not a test-only
qualification adapter. Qualification must exercise candidate algorithms through
the same abstraction that production structural operations use.

## 2. Responsibility boundary

The structural engine owns:

- command-to-placement mapping;
- subtree and ordered-run semantics;
- collision detection policy and structural normalization policy;
- deterministic tree projection;
- stable `BlockId` tie-breaking when primary positions collide; and
- structural invariants before and after allocation.

The position allocator owns:

- its private position representation;
- comparison of positions;
- allocation between optional lower and upper bounds;
- allocation of one ordered run;
- algorithm-specific uniqueness or collision-avoidance machinery; and
- algorithm-specific growth behavior.

The structural engine must not inspect an allocator's digits, paths, tree nodes,
site identifiers, random values, or other private representation.

## 3. Production allocator abstraction

The exact programming-language shape is an implementation detail. The production
abstraction must provide behavior equivalent to:

```text
StructuralPositionAllocator<Position>

comparePrimary(left, right) -> before | equal | after
compare(left, right) -> before | equal | after
allocateRun(lower?, upper?, count, allocationContext) -> Position[] | failure
```

`comparePrimary` reports whether two positions occupy the same logical ordering
location for collision handling. Distinct positions can compare equal at this
level.

`compare` provides the allocator's deterministic order for encoded positions.
The structural projection can apply stable `BlockId` as the final tie-break when
required. The combined projection order must be total and deterministic.

`allocateRun` returns `count` fresh positions strictly inside the requested open
interval. Returned positions preserve run order. `allocationContext` can contain
the algorithm-native identity or entropy needed for deterministic replicated
allocation, but the structural engine must not interpret its private fields.

Do not require every algorithm to expose a concept such as `anchor`, `digits`, or
`member`. Those concepts are candidate-specific.

## 4. Collision tolerance

The structural model must tolerate primary-position collisions even when the
selected allocator is designed to prevent them during normal operation.

This rule protects deterministic projection for exceptional carrier states,
migration, reconstruction, older data, and future allocator implementations. It
also prevents tree semantics from depending on a collision-free claim made by
one algorithm.

A primary-position collision does not make a Block unreachable. The structural
engine uses the allocator order and stable `BlockId` tie-breaking to produce one
deterministic projected order.

If insertion is required inside a collision run, the structural engine decides
which minimum later portion must move. It then asks the allocator for a fresh
ordered replacement run in a usable surrounding interval. The allocator does not
need to know that the request is normalization.

An allocator that makes primary collisions impossible for all valid distinct
positions can satisfy this contract without a candidate-specific collision
repair path. The engine-level collision model still remains valid.

## 5. Qualification candidates

Step 3 must characterize established dense-order algorithm families before it
selects the production allocator. Relevant prior art includes fractional
indexing, LSEQ-family approaches, and non-interleaving sequence approaches such
as Fugue/FugueMax.

A locally developed allocator can also be characterized as a candidate. It does
not become the selected design merely because it exists or passes its own unit
tests.

Qualification evidence must be persisted in the repository. Unrecorded
experiments are not qualification evidence and must not justify selection.

## 6. Common qualification suite

Run the same behavioral suite against every viable candidate through the
production allocator abstraction. At minimum verify:

- allocation before the first and after the last position;
- allocation strictly between adjacent positions;
- ordered allocation of runs of one and many positions;
- deterministic comparison and projection;
- concurrent allocation at the same logical destination;
- run non-interleaving, or measured residual interleaving;
- repeated narrow-gap insertion;
- repeated moves with fresh destination allocation;
- deterministic handling of primary-position collisions when the candidate can
  represent them;
- continued insertion around collision runs;
- convergence after duplicate, delayed, reordered, partitioned, and reconnected
  carrier updates; and
- compatibility with structural normalization when normalization is required.

Candidate-specific unit tests remain separate. They can verify private path,
identifier, entropy, tree, or encoding invariants that do not apply to other
algorithms.

## 7. Characterization measurements

Do not convert candidate-specific representation details into common pass/fail
requirements. Record comparable measurements instead.

At minimum record:

- average and maximum serialized position size;
- growth under repeated narrow-gap insertion;
- allocation cost;
- comparison and sort cost;
- ordered-run allocation cost;
- carrier growth under representative structural workloads;
- observed collision rate when collisions are possible; and
- observed concurrent-run interleaving behavior.

Record the hardware, runtime, dependency versions, workload sizes, and other
conditions needed to reproduce performance results.

A candidate can fail a mandatory semantic invariant. Performance and growth
results otherwise inform selection; they are not arbitrary product-level numeric
limits unless a separate requirement establishes such a limit.

## 8. Selection record

The final allocator selection must be a persisted decision based on the common
qualification evidence. Record:

- candidates evaluated;
- evidence and measurements;
- mandatory failures, if any;
- important tradeoffs;
- selected algorithm and dependency or local implementation;
- residual collision or interleaving behavior; and
- reasons for rejecting the other viable candidates.

Do not freeze the concrete position encoding before this selection exists.

## 9. Consequences

- The production structural engine depends on an allocator abstraction, not one
  concrete position representation.
- Qualification does not need a separate test-only adapter.
- The common qualification suite is reusable when a future allocator is
  considered.
- Collision tolerance remains an engine invariant even when normal allocation
  prevents collisions.
- Structural collision normalization remains engine policy; position generation
  remains allocator policy.
- Concrete allocator selection remains open until persisted evidence supports it.
