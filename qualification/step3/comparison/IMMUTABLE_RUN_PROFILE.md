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

## Native publication diagnostic

The separate portable runner captures one actual ordinary insertion after unrelated genuine carrier commands:

```text
npm run step3:native-publication -- --smoke --out step3-evidence/native-smoke
npm run step3:native-publication -- --mode calls --sizes 4,32 --out step3-evidence/native-calls
npm run step3:native-publication -- --mode memory --sizes 4,32 --out step3-evidence/native-memory
```

Create the parent output directory first; each run refuses an existing output directory.
The smoke mode defaults to zero/one unrelated commands and exercises capture, publication and verification without
native tracing.
The call and memory modes default to four/32 unrelated commands, using separate processes with V8's
`--liftoff-only --trace-wasm` or `--liftoff-only --trace-wasm-memory` flags fixed at startup.
Before loading the native module, the traced worker uses Node's private stdout-handle `setBlocking` hook
so native V8 output and synchronous markers cannot lose bytes or fail when the output pipe fills.
This diagnostic-only runtime dependency is checked explicitly; an unsupported runtime fails without a complete result.
The counts are diagnostic instruction events; traced execution is unsuitable for latency measurement.
Run native diagnostics separately from timed profiles to avoid contention.
The numeric fixture points are experimental observations owned by this profile and require source-bound reruns
when the implementation changes; they set no acceptance threshold or production resource limit.

An untraced builder captures native baseline bytes, the canonical-record cache and the actual prepared command
immediately before its real publication, then publishes it normally to establish an expected result.
The traced worker uses public Automerge `load`, reconstructs the qualification-private document wrapper through
reflection, restores the captured cache and invokes the actual `AutomergeImmutableRunDocument.publish` method.
The observed native mutation therefore uses the candidate's real public Automerge `change` path.
Reflection and a no-op source-index replay receipt belong only to this diagnostic harness.
The interval excludes preparation, source-index replay, cold activation, native load/save and verification;
it cannot establish the cost or correctness of those excluded operations.
An untraced verifier then uses normal factory load and compares the target's exact text/Origin and the complete
carrier snapshot, including root, Block liveness, placements, InlineContent ownership and payloads.
The fixture uses ASCII text only.

A streaming counter discards startup and post-publication events, retains aggregate calls or loads/stores by native
function, and rejects missing, mismatched or repeated interval markers.
No full raw trace is retained.
The output directory contains fixtures, resulting native documents, child stderr logs and `results.jsonl`.
Its initial row records runtime/environment, startup flags, pinned Automerge version, the actual Node-bound WASM
binary hash, installed Automerge ESM JavaScript bindings/package metadata, and SHA-256 hashes of runtime sources,
scripts, package metadata and lockfile.
Sources are checked before/after measurement and after every phase.
Phase checkpoints and error rows preserve partial results; only the final `complete: true` row certifies completion.
A zero recognized event count fails a requested trace rather than silently claiming a native observation.
These selected counters, even with exact post-publication verification, do not prove bounded publication work,
carrier eligibility or a carrier-selection decision.
Existing negative diagnostics remain applicable.
