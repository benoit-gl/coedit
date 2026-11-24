# Compact validated provenance: bounded H500 evidence

Compact validated native command provenance reduces the retained process JS heap in the isolated H500 diagnostic.
The separate phase-traced H500 lifecycle also completes with verified semantics before and after the change.
These are bounded diagnostic observations, not mandatory eligibility or carrier selection.

## Fresh fixture workers

The exact same scratch worker builds a separate source-bound fixture, then fresh workers load one or two carriers.
Samples invoke explicit GC twice; snapshots follow the one, two and release-A samples.
These are process `heapUsed` values in bytes, not dominator retained sizes or native/WASM allocation sizes.
Adjusted values subtract the same worker's own baseline.

| Worker / phase        | Before heapUsed | After heapUsed | Before adjusted | After adjusted | Adjusted reduction |
| --------------------- | --------------: | -------------: | --------------: | -------------: | -----------------: |
| Load / baseline       |      30,443,296 |     30,491,896 |               0 |              0 |                  — |
| Load / one            |     110,755,232 |     73,765,512 |      80,311,936 |     43,273,616 |             46.12% |
| Load / release all    |      33,481,264 |     33,464,536 |       3,037,968 |      2,972,640 |              2.15% |
| Overlap / baseline    |      30,439,464 |     30,494,008 |               0 |              0 |                  — |
| Overlap / one         |     110,762,768 |     73,768,096 |      80,323,304 |     43,274,088 |             46.13% |
| Overlap / two         |     184,178,896 |    110,200,072 |     153,739,432 |     79,706,064 |             48.16% |
| Overlap / release A   |     110,078,216 |     72,983,400 |      79,638,752 |     42,489,392 |             46.65% |
| Overlap / release all |      33,583,472 |     33,527,288 |       3,144,008 |      3,033,280 |              3.52% |

Absolute one-carrier load heapUsed fell 36,989,720 B (33.40%); its baseline-adjusted delta fell
37,038,320 B (46.12%). Absolute two-carrier overlap heapUsed fell 73,978,824 B (40.17%);
its baseline-adjusted delta fell 74,033,368 B (48.16%). The incremental second-carrier delta
(`two - one`) fell from 73,416,128 to 36,431,976 B (50.38%), after the first snapshot.

Both versions have 3511 records/carrier entries, one source index and a NativeProvider per loaded carrier.
Tag counts match: live 1003, context 501, erase 250, payload-effect-v2 501, run 252, envelope 501,
manifest 502, generation 1. The independent snapshot oracle requires 1024 ASCII `a` characters,
all spans with human/o0 Origin, and span text concatenating to payload text. It passes on fixture creation,
A load, both A and B after B load, and remaining B after releasing A.
Release-all returns near 33.5 MB in both versions. Compact snapshots remain in scratch;
no new object-ID or dominator verification is claimed here.

## Phase-traced lifecycle

The separately executed diagnostic harness uses the original warm command counts and lifecycle ordering,
with synchronous primitive-only sidecar markers around operations. It adds no explicit GC or heap snapshots.
Both main journals end with `complete: true` and `semanticsVerified: true`; each sidecar has 42 ordered rows.
Save, load, capture, materialize, restore, peer load/edit, merge, following edits and retained-material checks complete.
The exact executed harness is [preserved here](step3-immutable-runs-phase-trace.mjs.txt).

The highest **sampled** sidecar heapUsed fell from 955,744,392 B (merge end) to 727,063,552 B
(all-cases-emitted checkpoint): 228,680,840 B / 23.93%. These maxima occur at different phases;
markers do not measure continuous peaks or post-GC retention. Initial-load journal heapUsed actually rises
from 280,422,104 to 312,797,208 B, illustrating why individual uncollected samples are not retained-size estimates.
Final lifecycle journal heapUsed is 911,922,120 before and 727,029,312 B after.
Synchronous instrumentation, GC scheduling and shared CPU resources preclude controlled timing claims.
This single H500 lifecycle case does not settle the H5000 failure or the remaining qualification dimensions.

## Source and artifact provenance

- Before fixtures and lifecycle: clean `7926007230e6a7244ad76596bf67bf5334bbaaeb`.
- After fixture/build/load: clean `3bedabde9db40a73a8ead69148e4059997073a67`.
  After overlap records a dirty `qualification/step3/immutableRuns/nativeProvenance.test.ts` only.
  Tests are excluded by the worker's runtime source manifest; all 98 recorded source entries match that revision.
- After lifecycle: clean `175c0146a08b60e81ea7657621ad7aab50ded8c6`.
  Its complete 98-entry runtime source manifest exactly equals the compact fixture worker's source manifest.
  Every source entry in all six fixture manifests and both lifecycle headers was checked against its bound Git revision.
- The two executed fixture workers are byte-identical, SHA256
  `cbc7fb89807881c43fcc7ac01355fd73435c721a9690ec6585fc773de7816bb4`.
  Both lifecycle headers bind the preserved harness SHA256
  `f2bdb3fb9494b19d1cd0f198dff6ba3339e348abf09b1a54405b124334db8d4c`.
- The before fixture is 679,604 B, SHA256
  `7c402de3a226ad5599233614212423973e1f6eea4b69af9f0b0d9a34cfcdaff6`;
  the after fixture is 679,460 B, SHA256
  `18d95ebb74a61ece229e27e7dd337fbfad843ba746627deebf7dd1a2519421bb`.
  Actual fixture hashes, metadata and worker log bindings match.
  These are separately built source-bound fixtures, not byte-identical cross-revision input.
  The small encoded-size difference is not attributed to this retained-provenance change.
- Both use Node v24.19.0 and default 2,348,810,240 B V8 heap limits; package and lockfile hashes match.
  Lifecycle headers record Automerge 3.4.1. Fixture worker `nativePin` was omitted because it reads
  `dependencies` while Automerge is in `devDependencies`; the existing
  [baseline supplement](../heap-attribution/runtime-binding-supplement.json) records pin/installed version 3.4.1.
  No independent compact installed-binary hash is claimed.

[manifest.json](manifest.json) records original/copied hashes and sizes for preserved worker JSONL,
stdout/stderr logs, manifests, fixture metadata, lifecycle main journals/trace sidecars/logs, and exact scripts.
JSONL, logs and scripts are byte-for-byte copies. JSON metadata/manifests receive whitespace formatting only.
No binary fixtures or heap snapshots are committed with this checkpoint.

Native/WASM allocation remains outside JS heap attribution. The first one-carrier sample precedes snapshots;
later overlap/release samples and diagnostic RSS/timing are affected by snapshot allocations and pauses.
There is one load and one overlap worker per revision, without repeated-trial uncertainty estimates.
Do not extrapolate these H500 results to 5000 or characterize them as resolving its fatal phase/root cause.

## Compact H5000 lifecycle-load failure

A subsequent phase-traced H5000 diagnostic at clean source revision
`175c0146a08b60e81ea7657621ad7aab50ded8c6` exited with shell status 134 and a fatal
JavaScript heap out-of-memory error. The [main journal](history-5000-main.jsonl),
[phase sidecar](history-5000-trace.jsonl) and [fatal log](history-5000-heap-oom.log) preserve this failed run.
The journal has five rows and no lifecycle result or final `complete: true`; the warm row verifies semantics.

Setup completed in 164.30 seconds with 6,714,004 encoded bytes; initial load completed in 388.26 seconds.
After the verified warm checkpoint, save completed. The last sidecar row is sequence 5, `start lifecycle-load`,
with no matching end row. This localizes the fatal interval to the second load, performed while the existing
carrier is live, before the subsequent lifecycle checks. It does not identify an internal load substage,
retaining structure or precise allocation that exhausted the heap. Compact provenance did not make this
H5000 lifecycle complete under these diagnostic conditions.

The header records Node v24.19.0, Automerge 3.4.1, a clean worktree and 98 source entries.
All entries were independently checked against the recorded revision; the full runtime source manifest equals
that of the compact H500 fixture workers. The exact phase-trace script is already preserved above;
its bytes match the recorded SHA256 `f2bdb3fb9494b19d1cd0f198dff6ba3339e348abf09b1a54405b124334db8d4c`.
All six sidecar rows record the default 2,348,810,240 B V8 heap limit. No explicit GC or snapshots were added.
The main journal and sidecar are copied byte-for-byte; only trailing line whitespace is removed from the fatal log.
Original and copied hashes are recorded in the manifest; originals remain in scratch.

The lifecycle-load start sample records heapUsed 1,424,972,304 B and RSS 2,203,488,256 B.
These are pre-operation samples, not failure-time live bytes or memory limits. The last recorded process peak RSS
is 2,627,856 KiB; the fatal interval could have a higher unrecorded RSS peak. Native/WASM allocation is not
isolated by these samples. Timings are diagnostic observations with shared resources, not controlled comparisons.
This failed run is distinct from prior H5000 failures and the successful H500 cases; it leaves the H5000 lifecycle
unfinished and does not by itself settle all mandatory eligibility or carrier-selection obligations.
