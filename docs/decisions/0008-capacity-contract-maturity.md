# ADR 0008 — Capacity contract maturity

**Status:** Accepted

**Date:** 2026-09-05

**Authority:** [`../CAPACITY_AND_PERFORMANCE_TARGETS.md`](../CAPACITY_AND_PERFORMANCE_TARGETS.md)
controls capacity classification, maturity, ownership, verification, and
promotion. Focused specifications own current subsystem behavior and candidate
values. [`../../SCAFFOLDING_PLAN.md`](../../SCAFFOLDING_PLAN.md) owns the
selection gates.

## Context

Early MVP planning assigned finite limits to tags, structural depth and counts,
Contributor display names, Markdown input, portable artifacts, carrier
workloads, and browser behavior. Most values were useful as implementation
starting points, but they were selected before the relevant parser, carrier,
codec, storage path, qualification harness, or target-device evidence existed.

Treating all of those values as accepted contracts created three risks:

1. an implementation convenience could become document invalidity;
2. a preliminary workload could become a product or performance guarantee; and
3. later implementation evidence could require changing a supposedly settled
   contract before the affected subsystem had shipped.

Deleting the values entirely would lose useful starting points and obscure why
later measurements differ. Git history alone is insufficient repository
traceability because pull requests are squash-merged and branch history can be
rewritten.

ADR 0005 already establishes that implementation capacity is not durable
document meaning. This decision adds a lifecycle for capacity and performance
statements; it does not supersede ADR 0005.

## Decision

Capacity and performance statements use four maturity levels:

1. **Accepted invariant** — stable semantic, safety, or architectural behavior
   required now.
2. **Pending selection** — the concern, owner, evidence, and milestone are
   known, but the value or mechanism is not selected.
3. **Experimental target** — a candidate value or workload seeds measurement;
   it does not reject otherwise valid input, define compatibility, or fail
   correctness CI.
4. **Frozen contract** — evidence supports an exact implementation or
   interoperability boundary, tests enforce it, and changes require recorded
   evidence plus any necessary compatibility work.

Every current finite capacity, resource, or performance number that affects
acceptance, rejection, compatibility, protection, or evaluation has one direct
owner. Pending, experimental, and frozen statements identify their owner and
promotion gate.

An implementation step cannot close while a hostile-input boundary introduced
by that step still lacks a selected and tested protection mechanism. This
requirement does not select the mechanism or value in advance.

## Reclassified planning values

The values below are historical traceability only. Their direct owning
specifications control current behavior.

| Concern                           | Earlier planning value                                                                                                                                                                                                                      | Classification after this decision                                                              | Owner and promotion gate                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Step 2 tags                       | 20 tags per owner; 64 Unicode code points and 256 UTF-8 bytes per tag                                                                                                                                                                       | Former hard limits, superseded by the accepted invariant that Step 2 has no finite semantic cap | `MVP_IMPLEMENTATION_SPEC.md`; revisit only from measured implementation evidence      |
| Step 2 structure                  | 50,000 Blocks, 50,000 InlineContents, and depth 1,000                                                                                                                                                                                       | Former hard limits, superseded by the accepted invariant that Step 2 has no finite semantic cap | `MVP_IMPLEMENTATION_SPEC.md`; revisit only from measured implementation evidence      |
| Contributor display name          | 128 Unicode code points and 512 UTF-8 bytes                                                                                                                                                                                                 | Former hard limits; no finite Contributor semantic cap, with any boundary guard pending         | `MVP_IMPLEMENTATION_SPEC.md`; relevant UI, codec, or storage step                     |
| Markdown import                   | 10 MiB UTF-8 source, 200,000 AST nodes, depth 100, and 1 KiB source-name metadata                                                                                                                                                           | Experimental guard candidates                                                                   | `MARKDOWN_INTERCHANGE.md`; Step 7                                                     |
| Portable `.coedit` processing     | 64 MiB UTF-8 JSON, depth 128, 64 parent/frontier references, 250,000 operations per Contribution, 1,000,000 operations per archive, 8 MiB per decoded chunk, 48 MiB decoded chunks per archive, and 1,000,000 code points per InlineContent | Experimental guard candidates                                                                   | `PORTABLE_DOCUMENT_FORMAT.md`; Step 8 and version-1 freeze                            |
| Carrier and storage qualification | 100,000 code points, 5,000 Contributions, and 50 ms local-update latency                                                                                                                                                                    | Experimental workload and latency candidates                                                    | `MVP_VERIFICATION_PLAN.md`; Step 3, with later browser reuse evaluated in Steps 13-14 |
| Preserved editor grouping         | 20 graphemes, 30 seconds, and two pending captures                                                                                                                                                                                          | Experimental comparison fixtures inherited from the preserved branch, not normative settings    | `MVP_IMPLEMENTATION_SPEC.md`; Step 11 measurements                                    |

No empirical rationale is currently recorded for promoting these exact values
to frozen contracts. Their units, intended concerns, and provenance are
preserved here so later qualification can confirm, replace, or retire them
without reconstructing the planning history.

## Consequences

- The semantic/capacity distinction remains accepted immediately.
- Exact subsystem guards are selected when their implementation and evidence
  exist, not during unrelated domain design.
- Experimental targets produce comparable evidence only after a run-specific
  fixture and measurement method are recorded.
- Correctness CI does not fail merely because an experimental target is missed.
- A focused specification can freeze an implementation guard without making it
  a document-validity or interoperability maximum.
- Wire-visible limits need a separate rationale and may require a format or
  protocol version when changed.
- Reviews reject unclassified finite capacity, resource, or performance
  numbers.

## Rejected alternatives

### Keep every early value as an accepted contract

Rejected because the relevant implementations and measurements do not yet
exist. Normative precision without evidence would create arbitrary compatibility
and product commitments.

### Delete every earlier value

Rejected because the values remain useful experimental starting points and
historical context. This ADR preserves them without giving them normative force.

### Defer the semantic/capacity distinction as well

Rejected because allowing implementation limits to become document semantics is
already a cross-cutting design error. The principle is stable even when exact
boundary mechanisms remain pending.

### Specify every future error type and retry protocol now

Rejected because error categories and atomic failure behavior can be accepted
without freezing subsystem API shapes or post-MVP protocol mechanics before
their implementation steps.
