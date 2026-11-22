# Immutable-run qualification profile

## Status and ownership

This profile characterizes the qualification-private `step3-immutable-runs-v1` Automerge layout.
The [representation design](ORDINARY_EDIT_REPRESENTATION_DESIGN.md) owns the mechanism;
[verification sections 6.5–6.6](../../../docs/MVP_VERIFICATION_PLAN.md#65-convergence-atomicity-range-feasibility-and-growth)
own the experimental workloads and mandatory ordinary-edit criterion.
The profile supplies observations, not a carrier selection or a waiver of that criterion.
Existing unrestricted-layout failures in [the ordinary-edit result](ORDINARY_EDIT_RESULT.md) retain their status.

The saved bootstrap uses an experimental run-source setting of 512 UTF-16 units.
The private representation owns this implementation parameter; a future characterization can change it and must
record the persisted setting and resulting costs.
It partitions longer inputs and is not a logical payload-size limit or a selected production resource guard.

## Reproduction

From the repository root, run:

```text
npm run step3:immutable-runs -- --small --out step3-evidence/immutable-smoke.jsonl
npm run step3:immutable-runs -- --case text-100k --out step3-evidence/immutable-100k.jsonl
npm run step3:immutable-runs -- --case same-gap-history-5000 --out step3-evidence/immutable-history.jsonl
```

Without `--small` or `--case`, the runner exercises the baseline, 10,000/100,000-unit content points,
20 unrelated Blocks, 20 unrelated text payloads, one/20 opaque payloads, Origin/source boundaries,
and 500 prior same-gap insert/delete commands.
`--full-history` adds the separate 5,000-command History characterization.
The History target remains 1,024 units; content and History points are separate, not combined maxima.
The runner refuses an existing output path and creates its parent directory.
`--note TEXT` records run-specific circumstances such as contention.

All source text in this headless profile is ASCII.
Unicode, IME, clipboard and attributed browser semantics are exercised separately by the qualification suites;
these headless timings do not substitute for them.
Opaque values contain 256 bytes each, with `application/octet-stream` and a human Origin.
Unrelated text values contain 17 UTF-16 units each.
Twenty Origin spans and source boundaries are authored in one seed command; their extra retained source records
are an intrinsic part of that dimension and are not hidden from the observation.

## Intervals and completion

Each case seeds one actual carrier instance, encodes it, then records one initial load.
It reuses the loaded instance for bare canonical publication followed by the incremental editor.
Each mode has three unreported warm-up insertions, five reported insertion samples, and one additional observed edit.
History therefore grows during each series; the output records the prior warm-command count.
The editor activation interval is separate from warm dispatch.
The five-value nearest-rank p95 is the maximum, not a reliable estimate of tail latency.
No timing drives a correctness assertion or a resource rejection.

A separate single-sample lifecycle sequence records save, load, capture, materialization, restore and one-peer merge,
then first and following incremental-editor edits.
The output reports encoded bytes and process memory, including retained native and derived state.
These lifecycle intervals include validation/reconstruction moved to transitions.
An independent per-unit text/Origin oracle checks ordinary and following edits outside their timing intervals.
Retained material is compared by text and Origin values rather than JavaScript property insertion order.

The JSONL header records the base revision, working-tree state, runtime-source SHA-256 manifest, harness hash,
OS, CPU, reported RAM, Node version, pinned Automerge version and effective configuration.
The source manifest includes uncommitted runtime source and excludes tests, screenshots and evidence artifacts.
A dirty-tree observation is bound to those file hashes, not to the base commit alone.
The header and phase checkpoints carry `complete: false`; only the final completion row declares the requested
run complete.
A failure row or missing completion row preserves partial progress and must be reported as incomplete.

## Work observations

Timing samples run with diagnostic wrappers absent.
A separate additional edit observes source-index path visits, leaf allocations, range reads and subtree construction;
JSON output units; UTF-8 encoder input/output; object enumeration widths; and `Object.assign` source widths.
An insertion can legitimately build a one-unit local subtree: `indexBuildCalls` alone is not a full-rebuild counter.
`indexLargestBuildRange` distinguishes the observed subtree size.

The same observation counts actual activation, cold reference projection, public snapshot/full-target projection,
effect inspection, recovery and position-decoder calls.
The profile opts into the pure, lifetime-stable decoder path.
The general stateful decoder path retains full preflight and remains ineligible for the bounded ordinary path.

Prototype and global-method instrumentation is implementation-sensitive and restored in `finally`.
Counts cover the stated JavaScript paths, not every possible copy or native instruction.
They must be combined with native publication diagnostics, source review and semantic qualification;
zero selected counters and green timings alone do not prove eligibility.
N-way fan-in is covered separately by semantic suites; this runner's lifecycle merge has one peer.
