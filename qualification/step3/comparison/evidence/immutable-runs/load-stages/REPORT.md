# Instrumented cold-load substage diagnostic

The H5000 process fatally exhausted V8 heap during **lifecycle-load → native activation → namespace collection**.
This source-bound diagnostic refines the original uninstrumented second-load interval; it is not a lifecycle pass.
The [partial stage journal](history5000-stages.jsonl), [phase journal](history5000-phase.jsonl),
[main journal](history5000-main.jsonl), [fatal log](history5000.log) and
[shell resource record](history5000-resource.txt) preserve original journal bytes.
The copied fatal log removes trailing line whitespace only;
its original hash is recorded in the manifest. There is no final `complete: true`.
The shell reports abort and 556.585 seconds wall time; V8 reports JavaScript heap out of memory.

## Recovered interval

Second-load `native-A.load` ended at stage sequence 164 after 14,146.430 ms.
Native activation then began; namespace collection started at sequence 166 (497,510.312 ms) and never ended.
The last phase marker is `start lifecycle-load`, with no subsequent lifecycle check.
The final persisted stage marker, sequence 235 at 552,469.334 ms, reports:

- 690,000 distinct native objects in the namespace-depth map;
- 23,894 decoded semantic records and 8 pending traversal entries;
- heapUsed 2,132,621,280 B, RSS 2,844,971,008 B and external memory 568,610,906 B;
- V8 heap limit 2,348,810,240 B and reported process maxRSS 2,779,112 KiB.

The last progress count is a lower bound, not total fixture size or an exact failure threshold.
The native stack identifies no exact source allocation. Final GC messages report about 2,038 MB live JS heap.
These are process/GC samples, not retained-size attribution or continuous failure-time peaks.

Initial load completed in 326,434.382 ms. Its namespace collection completed in 48,745.992 ms with
1,011,161 distinct native objects and 35,011 records. Initial A.load took 77,887.349 ms,
provider construction 6,962.455 ms and semantic command validation 189,204.495 ms.
Thus semantic validation dominates the completed initial-load timing; namespace collection is the localized
second-load fatal interval. Warm edits have `semanticsVerified: true`; later lifecycle and merge checks did not complete.

## Same-instrumentation H500 comparison

The [H500 main journal](history500-main.jsonl), [phase journal](history500-phase.jsonl) and
[stage journal](history500-stages.jsonl) use the identical 99-file source manifest and harness.
H500 completed the full lifecycle with `complete: true, semanticsVerified: true`.
Its initial/second-load namespace collections took 4,469.994/4,596.876 ms and visited
104,336/108,027 distinct native objects for 3,511/3,637 semantic records.
Initial and second carrier loads took 7,249.3/7,545.1 ms.
Highest sampled heapUsed across H500 stage/phase logs was 862,266,744 B;
highest reported maxRSS was 1,087,260 KiB. No explicit GC was performed.
These counts describe the one-hex-digit-per-level layout, not memory per semantic record or a scaling guarantee.

## Exact binding and reproduction inputs

The clean base revision is `4e0857f1619cd4b32e515a458455fb6434f147fb`.
[Source comparison](source-comparison.json) binds all 99 runtime-manifest files back to that base:
only nativeDocument.ts and automergeCarrier.ts differ, plus the added helper.
The [patch](instrumentation.patch) reconstructs both changed files byte-for-byte from Git base;
only trailing spaces on blank context lines were removed from the copied patch.
the [helper](loadStageDiagnostic.ts.txt) is copied byte-for-byte.
Packaging verified all 99 header hashes against the isolated source and H500/H5000 manifest equality.
The exact executed [harness](stage-harness.mjs.txt) SHA256 is
`f2bdb3fb9494b19d1cd0f198dff6ba3339e348abf09b1a54405b124334db8d4c`.
The `.txt` suffixes keep evidence separate from active source. No complete source-tree copy is needed.

[Launch binding](history5000-run-binding.json) records the command, clean original tree, isolated overlay and case.
The [instrumentation script](instrument.py) preserves its original absolute scratch target; retarget it before reuse
and do not apply it to an already instrumented tree.
[Runtime binding](runtime-binding.json) and [installed package hashes](installed-automerge-manifest.json)
record Node v24.19.0 and Automerge 3.4.1, including installed JS/WASM bytes.
[Package manifest](manifest.json) records original artifact paths, byte sizes and SHA256 hashes, excluding itself.
The launch header retains original absolute harness paths; archive/repository placement does not rewrite that history.
The installed runtime binaries and node_modules are not bundled.

## Limits

The logger writes primitive counts and process statistics synchronously; it does not collect traversal objects.
However callback frames, closures, temporary JSON/stat allocations and writes may alter lifetime, allocation, GC and timing.
This localizes the **instrumented** fatal interval; original uninstrumented H5000 evidence establishes only lifecycle-load.
It does not prove that the original failed on an identical allocation or at the same count.
The full harness retains setup/first-carrier state through warm commands and the second load, so these samples cannot
isolate individual carrier sizes, namespace-map bytes, native/WASM caches or the retaining graph.
No heap override, explicit GC, heap snapshots or new recovery workload were used.
Shared-resource timings are diagnostic, not controlled acceptance measurements.
This failed run does not establish larger-history completion, production readiness, mandatory eligibility or carrier selection.
