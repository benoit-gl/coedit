# Packed-record H5000 storage-only completion

The post-review fixed packed storage primitive completed this bounded H5000 experiment at the unchanged
default heap. It retains **35,011 exact logical records, 5,002 command groups and 5,003 native changes**;
all 5,001 historical non-genesis root text/Origin projections passed independent reference validation after reopen.
This is a packed **record-storage** result, not a full packed carrier lifecycle or production qualification.
The [package manifest](package-manifest.json) binds this compact text archive.

## Genuine source and unchanged command identities

The runtime source is the 64-file snapshot at revision `7618ee8939f305260a3d2a54b30a482093826fe4`,
with Automerge 3.4.1, Node v24.19.0 and an unchanged 2,348,810,240-byte heap limit.
The [executed binding](bindings/binding.json.txt) covers 102 source, native, input and harness files.
The [fixed candidate](candidate/packed-store.mjs.txt) includes the width validation and physical-slot reader;
its [14-case correctness result](candidate/correctness16-with-extractor.json.txt) predates this H5000 run.
These code bytes differ from the historical H500 measured implementation.

The source builder loads the exact preserved original H500 carrier encoding, verifies its visible material,
then uses real public carrier calls for `edit-500` through `edit-4999`.
The existing H500 record UUIDs, Refs and effects remain the exact first 502 command groups.
The workload starts from 1024 ASCII `a` units and alternates insertion of `x` at offset 1 with deletion [1,2],
with human Origin `o0`, actor `packed-author` and separate stable effect IDs.
Loaded continuation uses a fresh native author/source replica; newly authored continuation identities are retained exactly.

A diagnostic wrapper captures prepared canonical entries while delegating the original source-native publication unchanged.
It does not replace native publication, command preparation or source-index replay.
A tape row is written only after the enclosing carrier call succeeds and public text/Origin checks pass.
Every group is checked against its manifest's exact member Refs, batch/effect identity and preceding root;
UUID coverage is unique and exhaustive. Final source text/Origin and the native canonical index match the tape.
Source generation, save and its supervised exit completed successfully in about 176.6 seconds.
The full original source encoding is 6,734,779 bytes; its hash is preserved in the
[input manifest](inputs-manifest.json). Source construction is not full lifecycle qualification.

## Packed storage result

The separate packed worker streams those exact groups into immutable native byte scalars.
Each original command keeps its own transaction and immutable unit; records are never combined across commands.
Logical Refs retain record UUID plus canonical-record commitment, independently of physical unit/slot locations.

| H5000 packed storage observation                       |                    Result |
| ------------------------------------------------------ | ------------------------: |
| Exact logical records                                  |                    35,011 |
| Original command groups / physical units               |                     5,002 |
| Native changes, including separate primitive bootstrap |                     5,003 |
| Native operations                                      |                     5,005 |
| Native maps                                            |                         1 |
| Final command operations                               |                         1 |
| Encoded bytes                                          |                 3,178,096 |
| Post-GC build heapUsed / baseline-adjusted delta (B)   |  100,069,464 / 83,374,680 |
| Post-GC build RSS / baseline-adjusted delta (B)        | 378,249,216 / 262,635,520 |

The [completed summary](raw/packed-summary.json.txt), [build checkpoint](raw/packed-build-checkpoint.json.txt)
and [phase journal](raw/packed.phases.jsonl.txt) preserve the observations.
The [transaction audit](raw/transaction-audit.json.txt) independently decodes every native change against the tape:
all 5,002 exact command groups remain separate and linear, with all native-head receipts present.
The primitive's separate bootstrap adds one native change to the original command groups.
No logical edit, record, erased source or historical reference was truncated.

All 35,011 exact Refs pass physical unit/slot reads before and after reopen.
Six sampled historical native views match their exact prefix record sets.
Independent protocol reference validation and every one of the 5,001 historical root text/Origin projections pass.
Final synchronous completion is at `2026-11-24T04:35:26.152Z` with
`complete: true, semanticsVerified: true`.

Memory is a single-process, explicit-GC **build** observation, before save/audit/reopen/reference allocations.
This streaming H5000 baseline does not preload the detached tape; its retained state includes command metadata,
native-head receipts and a logical-key audit map. H500 preloaded its tape before baseline.
Consequently the H500/H5000 memory figures do not establish a scaling ratio.
This is neither fresh-process load memory, allocation attribution, complete carrier memory nor an application estimate.
Setup/build/verification durations include instrumentation and are not controlled latency results.

## Supervisor loss and recovered successful termination

The original [supervisor journal](raw/supervisor.jsonl.txt) stops after packed elapsed 180.3549 seconds,
at `04:33:22.691Z`, without a packed exit or final supervisor row.
The supervisor was later found zombie under PID 1 with raw wait status 0; the cause is unestablished.
The recorded supervisor implements no elapsed timeout. This gap does not establish a timeout or workload failure.

The orphaned packed worker continued running and writing synchronous phase/stdout journals.
Inspection found it actively checking historical projections. A separate
[recovery monitor](harness/recover-monitor.py.txt) was launched without signalling, restarting or changing the workload.
By its attachment at `04:35:54.970Z`, the child had exited; the
[recovery journal](raw/recovery-monitor.jsonl.txt) records zombie raw wait status 0, confirming exit 0,
and the complete semantic summary. It is not an invented original-supervisor exit record.

The original packed RSS samples therefore cover only a **partial interval**.
Their observed maximum of 1,117,072 KiB is not a complete run peak; recovery collected no live RSS samples.
Later child process counters do not repair that gap. No complete packed peak-RSS figure is claimed.
Source supervision and its 1,654 RSS samples are complete, with observed peak 1,305,724 KiB.
Workload completion is established; original supervision completion and full packed peak-RSS are not.
No worker was killed or retried, and no heap limit was increased.

## Scope and reproduction limits

This packed-only run has no matched H5000 trie or scalar-per-record control.
Its original full source encoding includes native carrier metadata that the primitive does not implement;
the two encoded sizes are not a matched carrier comparison.
There is no packed semantic-root/descriptor/ownership publication, full native closed-command provenance,
capture/restore integration, merge lifecycle or production eligibility result.
The earlier full-carrier H5000 merge/heap failures remain distinct unresolved evidence.
Flat-map growth, cold history scans, byte size of large records and complete carrier overlap remain open.

The [archive map](archive-map.json) contains exact original paths, byte sizes and SHA256 values.
Raw evidence and executable sources use `.txt` suffixes to preserve their bytes; restore scripts outside the repository
by removing only that suffix. The [input manifest](inputs-manifest.json) hashes omitted large native binaries and
the exact command tape. They remain at the listed scratch paths and are **not included in this compact package**.
Hashes identify those inputs but do not reconstruct them. Exact replay requires those retained bytes;
workload regeneration authors fresh identities and requires a new binding.
The sibling [H500 package](../packed-prototype/REPORT.md) contains its detached prefix tape,
not the omitted source native encoding.

Original launch, cwd `/workspace/work/merge10-packed-prototype/h5000-v1`:

```sh
python3 -u /workspace/work/merge10-packed-prototype/h5000-v1/run.py
```

The [runner](harness/run.py.txt), [source builder](harness/build-source.mjs.txt),
[packed worker](harness/measure-packed.mjs.txt) and [finalizer](harness/finalize.py.txt) retain exact commands and checks.
Restore the bound source/dependencies and verify all hashes before a new run; original paths and exclusive output names
require a new destination or explicitly recorded path adaptation.
The historical supervision gap is preserved, so the original runner is evidence, not a claim of reliable detached supervision.
For future long runs, arrange durable supervision separately.
Packaging rechecked all 102 bindings and all 120 historical H500 artifact hashes without rerunning workloads.
Run `python3 verify-package.py.txt` for this package's local integrity check.
