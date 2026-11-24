# Scratch two-digit trie H5000 lifecycle failure

## Result and scope

The isolated two-digit (hex2) full-carrier H5000 run **failed under the default V8 heap** during the original
inbound merge. Node aborted with return code `-6` (SIGABRT) after 1,240.3165 seconds, without timeout.
The [fatal stderr](chunk2-lifecycle.stderr.log) records:

```text
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

The [partial main journal](chunk2-lifecycle.jsonl) has setup and verified warm records, but no case/lifecycle
result or final `complete: true`. The last [synchronous phase entry](chunk2-lifecycle.phases.jsonl) is sequence 25,
`start merge`, at process performance time 1,153,824.810022 ms, with no matching end.
Fatal V8 abort bypassed the JavaScript catch/finally; no caught JavaScript failure row exists.
This identifies the observed failing interval, without identifying a merge substage, allocation or retaining graph.
This scratch candidate remains unapplied to repository runtime source and does not qualify production use.

## Exact source and execution binding

The run binds historical source revision `4e0857f1619cd4b32e515a458455fb6434f147fb` plus the isolated
[prototype patch](prototype.patch). The [runtime manifest](chunk2-manifest.json) binds 89 runtime source entries,
28 installed native JavaScript entries and the actual Node-bound Automerge WASM.
Its SHA256 is `8fff3f255eb3e6c378f70451f26d80159379515f8859248211501f2e9f8b0fa1`.
The [original source binding](source-binding.json) records the clean historical revision and source hashes;
exact changed [native document](nativeDocument.ts.txt) and [record store](nativeRecordStore.ts.txt) bytes are archived.
The candidate uses new private layout markers and rejects old-format input; this is not a compatible format migration.

The [binder](binding.mjs.txt) permits only exact isolated prototype roots and verifies each runtime/native hash
before loading application modules. The measured root was
`/workspace/work/merge10-implementation/trie-prototype/chunk2`.
The installed dependency is pinned Automerge 3.4.1 through the existing shared node_modules symlink;
its native bytes are verified, including WASM SHA256
`304ea6e230898ed66af3c29ac554a36c15bbe03f5c8816b5310fddb88f7f5d78`.
Post-run read-only binding verification rechecked that exact root and every runtime/native hash.
The source/native manifest is identical to the candidate in the prior [H500 comparison](../trie-h500/REPORT.md).

The exact [lifecycle harness](lifecycle.mjs.txt) and binder are byte-identical to the H500 harness.
Lifecycle SHA256 is `25384a467289d6d76c8620c8fba44023e599c3f6db5c8475dcb69d0c7cc61785`;
binder SHA256 is `e1a30336134052dab059dcba47c05f3982a2d46a00d4d2c1e88e943f66d6adf1`.
Only the fixed case selector changes to `same-gap-history-5000`.
The [supervisor](run.py.txt) preserves the exact command, cwd, environment option observation and exit in
[its journal](supervisor.jsonl). It launched with `python3 -u run.py` from the original `h5000-v1` directory:

```sh
node /workspace/work/merge10-implementation/trie-prototype/h5000-v1/lifecycle.mjs \
  --root /workspace/work/merge10-implementation/trie-prototype/chunk2 \
  --case same-gap-history-5000 \
  --out /workspace/work/merge10-implementation/trie-prototype/h5000-v1/chunk2-lifecycle.jsonl \
  --phase-trace /workspace/work/merge10-implementation/trie-prototype/h5000-v1/chunk2-lifecycle.phases.jsonl \
  --note 'isolated hex2 full-carrier H5000 exact lifecycle; verified byte manifests; default heap; no forced GC; unchanged H500 lifecycle harness'
```

Node was v24.19.0. `NODE_OPTIONS` was unset, the V8 heap limit remained 2,348,810,240 bytes,
and no explicit GC, heap override, snapshot prepass, source/runtime patch, lifetime-topology change or retry was added.
No elapsed-time cancellation was imposed; the fixed original profile bounded the workload.
No other heavy worker was present at preflight.

## Completed and pending checks

The unchanged profile builds a 1024-unit ASCII seed with 5,000 alternating same-gap attributed history commands,
checks exact text/Origin before encoding, performs three warmups and five samples per original bare/editor mode,
and retains separate observed commands and the full original multi-carrier lifecycle.
Setup encoded 5,410,213 bytes. Initial load and both warm modes completed with exact text/Origin checks.
Both separately observed extra warm commands reported zero native activation and zero public snapshot calls.
These selected counters do not bound total edit work or native memory.

Save, lifecycle reload, post-load oracle, capture, materialize, restore, post-restore oracle,
peer save/load, peer edit and peer save-after-edit completed before entry to merge.
Post-merge text/Origin, following editor activation and two edits/checks, retained captured-material checks,
and original case/final completion records were not reached. Earlier verified checkpoints do not establish
full-lifecycle semantic correctness; no semantic mismatch was observed before the fatal resource failure.

## Diagnostic process observations

The [summary](summary.json.txt) and exact [finalizer](finalize.py.txt) preserve assertions for unsuccessful exit,
fatal stderr, only unmatched merge phase, missing completion and earlier warm checks.
The supervisor ran from `2026-11-23T21:50:36Z` to `2026-11-23T22:11:16Z`.

| Observation                          |         Value |
| ------------------------------------ | ------------: |
| Default V8 heap limit (bytes)        | 2,348,810,240 |
| RSS sample count                     |        19,926 |
| Highest externally sampled RSS (KiB) |     2,703,156 |
| Highest sampled VmHWM (KiB)          |     2,703,904 |
| Merge-entry heapUsed (bytes)         | 1,784,669,768 |
| Merge-entry RSS (bytes)              | 2,476,179,456 |
| Merge-entry external (bytes)         |   407,946,168 |

The external sampler reads `/proc/PID/status` approximately every 50 ms; the complete
[RSS journal](chunk2-lifecycle.rss-samples.jsonl.gz.b64) is retained as gzip-compressed base64;
decode with `base64 -d ... | gzip -d` to recover the exact original. Brief peaks may be missed.
The sampled RSS includes fixture setup, native/external memory and the original overlapping carrier topology.
It is not isolated native allocation, a retained-size measurement or an exact fatal-time peak.
Merge-entry counters are entry observations; ArrayBuffers is part of external and must not be added again.
The existing sidecar starts at initial load, after setup; its earlier absence does not indicate a stalled phase.
Single-run setup/initial-load/lifecycle-load/peer-load-with-save durations were about 77.54/223.21/276.46/559.88 s.
Random native identities/key shapes, JIT/GC and diagnostic writes remain uncontrolled; these are not latency comparisons.

## Relationship to prior evidence and retained limits

This candidate reached merge in one H5000 run, while the prior compact-provenance
[uninstrumented failure](../compact-provenance/REPORT.md#compact-h5000-lifecycle-load-failure) stopped during
lifecycle load.
The separate [instrumented old-layout failure](../load-stages/REPORT.md) localized its failure to namespace collection.
Those source/layout/instrumentation conditions differ; they are not a matched H5000 before/after pair.
There is no old-layout H5000 run using this exact harness and matching random native identities/key shapes.
Reaching a later phase does not establish a controlled resource improvement or explain any earlier failure.
The successful H500 old/candidate comparison remains bounded H500 evidence; this H5000 run did not complete.

This single source-bound scratch run identifies a default-heap full-lifecycle resource failure for the candidate.
It does not prove a semantic defect, attribute a dominator or root cause inside merge, establish larger-history scaling,
resolve concurrent-prefix creation or compatibility, or change mandatory eligibility and carrier-selection obligations.
The concentrated-tail adverse case and all prior failures remain applicable.
No production readiness, semantic pass for unfinished work, general memory guarantee or production carrier choice follows.

## Artifact preservation

The [package manifest](manifest.json) hashes every packaged file except itself. The
[packaging provenance](packaging-provenance.json) records original paths/hashes and copied-file normalization.
The [original artifact manifest](original-artifacts-manifest.json) is preserved independently.
Main/phase/RSS/supervisor journals and scripts are byte-identical; only trailing line whitespace is removed where
explicitly disclosed, including the fatal log. Archival `.txt` suffixes protect exact script/summary/source bytes
from automated code/JSON formatting. No measurement was rerun during packaging.
No binary fixtures, heap snapshots, native binaries or compiled Python cache are packaged;
native binary identity remains in the bound manifest. Packaging adds documentation and metadata only.
