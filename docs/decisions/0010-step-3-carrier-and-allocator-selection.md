# ADR 0010: Step 3 carrier and structural allocator selection

**Status:** Accepted at Gate B

**Date:** 2026-09-07

## Context

Step 3 must select one collaborative carrier and one structural position
allocator before Step 4 makes either choice part of the production collaborative
core. The comparison uses carrier-neutral interfaces and common functional,
structural, concurrency, editor, clipboard, Range-feasibility, growth, and
atomicity fixtures.

Candidate versions are pinned in `qualification/step3/README.md`. The Actions
artifact named `step3-qualification-evidence` preserves exact runner metadata,
sample distributions, fixture descriptions, package versions, browser evidence,
and encoded-size measurements for the deciding run.

## Decision

Select Yjs 13.6.32 as the Step 4 collaborative carrier and `fugue` 3.0.0 as
the structural position allocator behind the accepted carrier-neutral
abstractions.

Freeze the current qualification implementation guards at these boundaries:

- untrusted encoded carrier update or snapshot: 16 MiB before candidate decode;
- private clipboard UTF-8 payload: 4 MiB before JSON decode;
- private clipboard decoded object/array nodes: 250,000;
- private clipboard nesting depth: 32; and
- private clipboard attributed items and Origins: 100,000 each.

These are implementation resource guards, not document semantics, portable
format limits, or performance guarantees. Exceeding one reports a resource
failure before publication. Step 4 must put the carrier guard on every
untrusted load and merge boundary; the clipboard adapter must retain ordinary
sanitized HTML and plain-text fallback when the private representation fails.

This decision does not select the durable Range lineage representation, Range
fragment encoding, carrier codec, History effect encoding, portable format, or
compaction strategy. Those choices remain with their later gates.

## Evidence and rationale

Both adapters pass the common attributed-content, protected-Origin, structural,
convergence, atomic logical-document, reload, clipboard, and editor-shaped
fixtures. Yjs also provides the two required native insertion affinities: a
cursor created before a boundary remains before a concurrent insertion and a
cursor created after it remains after. Automerge 3.4.1 resolves both tested
cursor modes after the inserted character; its cursor movement option controls
deletion behavior and does not supply the missing insertion affinity. The
qualification records this mandatory Range-feasibility limitation without
inventing the Step 6 lineage design.

In the equivalent local 100,000-code-point fixture, Yjs local edit plus
projection measured 1.56 ms median and 2.75 ms p95. Automerge measured 102.28 ms
median and 138.35 ms p95. The logical change containing one placement, two
actual InlineContents, and 5,000 Contribution metadata records measured 9.58 ms
median for Yjs and 2,768.13 ms for Automerge. These figures are characterization
evidence rather than acceptance thresholds, but their scale reinforces the
mandatory cursor result for an editor hot path.

Automerge has meaningful advantages: the 100,000-code-point state encoded to
2,710 bytes rather than Yjs's 163,647 bytes, and its measured adapter surface was
1,319 nonblank lines rather than 1,565. Those benefits do not offset the missing
cursor behavior and substantially slower projection path for this architecture.

For structural allocation, Fugue preserved concurrent runs without
interleaving, produced no primary collision in the common fixture, and held
each repeatedly allocated position to 26 encoded bytes. The fractional-indexing
candidate was faster in the microbenchmark but interleaved concurrent runs and
produced 16 primary collisions. The local dense candidate avoided those
failures but grew to 614 encoded bytes in the narrow-gap fixture and is a local
design rather than established dependency. Fugue's roughly 8 ms p95 for 1,000
repeated allocations remains well outside the single-editor-operation hot path.

The largest selected-carrier state in the local representative fixtures was
531,795 bytes, and the representative private fragment was 163,593 bytes. The
selected byte guards therefore retain substantial measured headroom while
bounding hostile allocation and decode work. Depth and decoded-collection
guards bound adversarial JSON shapes far beyond the shallow representative
fragment. Exact evidence is retained in the generated Actions artifact rather
than committed as machine-specific build output.

## Rejected candidates

- Automerge 3.4.1 is rejected for Step 4 because it cannot represent both
  required insertion affinities through its native cursor API and has materially
  slower editor-facing projection in the common fixtures. It remains useful
  comparison evidence, not a public or domain dependency.
- `fractional-indexing` 4.0.0 is rejected because concurrent ordered runs
  interleave and share primary positions in the common fixture.
- `local-dense-v1` is rejected because repeated narrow-gap insertion produces
  much larger encodings and the local design supplies no compensating semantic
  advantage over Fugue.
- The reviewed TypeScript LSEQ package is not admitted because its AGPL-3.0
  license is unsuitable for the product dependency set.

## Consequences

- Step 4 implements only Yjs and Fugue behind carrier-neutral production APIs.
- Rejected-candidate types must not enter public or domain interfaces.
- The common winner fixtures become Step 4 regression tests.
- Structural collision tolerance remains required even though Fugue avoided
  normal-operation collisions in the qualification fixture.
- A future candidate or guard change requires new comparable evidence and a
  recorded amendment; it does not alter document semantics by itself.

## Authority

[`../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md)
owns the carrier, clipboard, and resource-guard contract.
[`../STRUCTURAL_POSITION_ALLOCATOR.md`](../STRUCTURAL_POSITION_ALLOCATOR.md) owns
the allocator contract. [`../../SCAFFOLDING_PLAN.md`](../../SCAFFOLDING_PLAN.md)
owns Gate B and the transition to Step 4. [`../RANGE_MODEL.md`](../RANGE_MODEL.md)
continues to reserve Range lineage selection for Step 6 and Gate C.
