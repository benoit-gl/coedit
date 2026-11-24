# Full-carrier H500 old/two-digit trie comparison

## Scope and source binding

All six sequential workers exited 0 without timeout or errors. Both exact lifecycle journals finish with
`complete: true` and `semanticsVerified: true`. This is bounded scratch evidence for historical source
`4e0857f1619cd4b32e515a458455fb6434f147fb`, not a change to the repository runtime or a production selection.
The [old](old-manifest.json) and [two-digit](chunk2-manifest.json) manifests each bind 89 runtime source files,
28 native JavaScript files and the Node-bound WASM. Only `nativeDocument.ts` and `nativeRecordStore.ts` differ.
The [source binding](source-binding.json) and earlier
[prototype patch](../trie-prototype/prototype.patch) reconstruct the isolated variants.
The candidate uses explicit new private layout markers and rejects old-format input.

The [executed binder](binding.mjs.txt) refuses roots outside the two exact isolated variant paths relative to its
experiment directory and verifies every source/native hash before Vite loads application modules.
Both variants share pinned installed Automerge 3.4.1 through existing node_modules symlinks; this dependency resolves
under `/workspace/coedit/node_modules`, while application modules load from the explicit scratch roots.
The actual shared native bytes are verified, including WASM SHA256
`304ea6e230898ed66af3c29ac554a36c15bbe03f5c8816b5310fddb88f7f5d78`.
Final read-only verification rechecked all runtime/native hashes after measurements.
Node was v24.19.0; the default V8 heap limit was 2,348,810,240 bytes in both variants.

## Identical semantic workload and completed checks

The [executed fixture worker](fixture-worker.mjs.txt) reproduces the authoritative profile's 1024-unit ASCII seed
with Origin `{kind: "human", id: "o0"}`, followed by 500 alternating insert/delete commands at the same gap,
preserving command contexts and returned revision receipts. Exact text and Origin are checked before encoding.
Each variant has 3511 canonical records: 502 manifests, 250 erases, 1003 live records, 501 envelopes,
501 payload effects, 501 contexts, 252 runs and one generation. Public root/target IDs, expected text/Origin,
history count and record-tag counts agree. Each load hash-checks its separately built fixture and runtime binding.

Fresh overlap workers load A, validate it, load B while A remains live, validate both, release A, validate B,
and release B. Double explicit-GC memory samples follow baseline/one/two/released-A/released-all boundaries.
The fixture builder runs in a different process from overlap measurement, so no setup carrier coexists with A/B.
These are process counters, not snapshot dominator sizes or isolated native allocation measurements.
No heap snapshots or backend patches were used.

The exact [lifecycle harness](lifecycle.mjs.txt) preserves the existing profile's three warmups and five samples
in each bare-canonical and incremental-editor mode, its separate observed extra commands, independent text/Origin
oracle, save, lifecycle load, capture, materialize, restore, peer load/edit, inbound merge, two following editor edits,
and retained captured-material comparison. Every original check passed for both variants.
The prior synchronous phase-sidecar harness is unchanged apart from replacing Git-dependent provenance discovery
with verified scratch source/native manifests; that adaptation is preserved in
[lifecycle-provenance.patch](lifecycle-provenance.patch).
Full lifecycle runs have no explicit GC or altered carrier-lifetime topology.
Both sidecars have 20 balanced operation start/end pairs and end at `all-cases-emitted`.
The separately observed extra warm edits report zero native activation and zero public snapshot calls in both variants.

## Process-memory observations

The [summary](summary.json.txt) preserves exact source-bound rows and completion checks.
Old and candidate execute separately in that fixed order; each table cell is one exploratory observation.

| Post-explicit-GC heapUsed (bytes) | Old one-digit |  Two-digit |
| --------------------------------- | ------------: | ---------: |
| Baseline                          |    19,859,760 | 19,860,376 |
| A live                            |    63,218,848 | 58,198,984 |
| A+B live                          |   100,498,568 | 91,696,864 |
| Released A, B live                |    63,386,856 | 58,450,400 |
| Released both                     |    23,783,032 | 22,628,080 |

| Resource                                     | Old one-digit |  Two-digit |
| -------------------------------------------- | ------------: | ---------: |
| Fixture encoded bytes                        |       679,533 |    540,304 |
| Baseline-adjusted heapUsed, A live (bytes)   |    43,359,088 | 38,338,608 |
| Baseline-adjusted heapUsed, A+B live (bytes) |    80,638,808 | 71,836,488 |
| Fresh overlap sampled peak RSS (KiB)         |       447,728 |    367,472 |
| Exact lifecycle sampled peak RSS (KiB)       |       973,972 |    806,924 |

Baseline-adjusted post-GC heapUsed is 11.58% lower for one live carrier and 10.92% lower for two in this pair.
Sampled overlap peak RSS is 17.93% lower and sampled exact-lifecycle peak RSS is 17.15% lower.
Fixture encoding is 20.49% smaller. These measurements do not establish a general memory win or retained-size attribution.
HeapUsed returns near the one-carrier level after releasing A and near baseline after releasing both;
remaining B passes independent checks. This supports collection in this bounded topology, without asserting that
all RSS/native memory is returned. ArrayBuffers is included in external memory and must not be added to it again.

The supervisor samples `/proc/PID/status` about every 50 ms; brief peaks can be missed.
Raw samples are packaged, and each phase sidecar also preserves the OS process-lifetime `peakRssKiB` counter.
Overlap peaks include module setup and both loads. Lifecycle peaks include fixture construction and the original
multiple-carrier topology. Full lifecycle samples are not post-GC retained sizes.

## Execution constraints and limitations

The [supervisor journal](supervisor.jsonl) records exact commands, cwd, timestamps, return codes and peaks.
Order was old build → old overlap/release → old exact lifecycle → candidate build → candidate overlap/release →
candidate exact lifecycle. Each process had a 600-second bound and exclusive new output paths.
No other heavy workload was present at the start, and these six processes did not overlap.
All six stderr logs are empty. No remote operations, runtime edits, heap override, WASM tracing, snapshots or H5000 run
were performed in this comparison. Existing H5000 failures remain failures.

Both variants independently generate legitimate record UUIDs/native actor and lineage IDs. The semantic workload,
public IDs, text/Origins, command contexts and history count match, but actual trie keys and encoded input bytes do not.
Single observations in old-first order provide no repeatability, uncertainty estimate or randomized crossover control.
Cache/JIT state, module setup and diagnostic writes also prevent controlled latency/speedup claims.
Observed full-lifecycle elapsed times were 99.08 and 40.06 seconds; merge intervals were 57.50 and 15.80 seconds.
They remain diagnostic observations rather than established performance improvements.

H500 completion does not establish H5000 behavior, larger-history scaling, native allocation attribution,
concurrent prefix creation/N-way fan-in qualification, old-format migration, production readiness, mandatory eligibility
or carrier selection. The earlier concentrated-tail adverse case remains applicable; this workload does not replace
controlled UUID-distribution tests.

## Package integrity and reproduction

The [package manifest](manifest.json) hashes every packaged file except itself, records original hashes and
normalization, and explicitly lists omitted binaries. Raw JSONL journals, RSS samples, logs, JSON metadata/summary
and executed scripts
retain original bytes. Scripts and raw JSON objects that differ from repository formatting are archived with `.txt`
suffixes so repository format/lint tools do not rewrite measurement evidence. The review patch has trailing line
whitespace removed. Original hashes remain recorded. The
[original scratch artifact manifest](original-artifacts-manifest.json) is historical: it lists two binary fixtures
and the scratch handoff that are not included here. This package's manifest is the authoritative packaged-file list.
No fixture, heap snapshot, native binary or complete production source tree is included.

The [preparation wrapper](prepare-h500.mjs.txt) is new packaging code, not executed measurement source.
It invokes the earlier source-verified prototype preparation wrapper, then restores the exact H500 worker scripts
and manifests into a fresh output directory. The following performs preparation and hash verification only:

```sh
cp qualification/step3/comparison/evidence/immutable-runs/trie-h500/prepare-h500.mjs.txt /tmp/prepare-h500.mjs
node /tmp/prepare-h500.mjs --repository "$PWD" \
  --evidence "$PWD/qualification/step3/comparison/evidence/immutable-runs/trie-h500" \
  --output /tmp/new-trie-h500
```

The output path must not exist. An explicitly requested new measurement can subsequently run
`python3 /tmp/new-trie-h500/h500-v1/run.py`, followed by `summarize.py` there.
The supervisor regenerates fixture binaries locally, uses the same bounds/default heap and preserves fresh outputs.
Actual paths/native randomness cause new fixture/run metadata and results; originals are not overwritten.
The original `finalize.py.txt` is archived provenance for scratch handoff generation, not a portable rerun step.
