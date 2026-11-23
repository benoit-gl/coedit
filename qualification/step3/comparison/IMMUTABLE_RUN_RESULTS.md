# Immutable-run implementation observations

## Disposition

The public-API immutable-run implementation adds an Automerge qualification layout,
its closed record/command validation, a local weighted source index, retained derivation fixtures,
and editor integration.
The [profile](IMMUTABLE_RUN_PROFILE.md) defines the new headless measurement method.
The implementation does not select the production carrier, allocator, Range representation or resource policy.

The unrestricted old-layout failures in [the ordinary-edit result](ORDINARY_EDIT_RESULT.md) remain failures.
The new Yjs scalar-record route also retains a direct native-client sweep;
`immutableRecordWork.test.ts` fixes 128 prior records while varying retained clients 1/8/32/128 and
observes 3/24/96/384 direct client iteration visits.
The one-client record-count control remains at three visits.
That route is rejected before full adapter integration.

The Automerge route has completed the bounded observations below.
The full mandatory eligibility disposition remains open until native-work growth, all required workload dimensions,
current semantic verification and review are reconciled.
Fast samples or zero selected JavaScript counters alone do not establish a pass.

## Recorded headless runs

These observations ran on Linux 6.18.57, Node v24.19.0, pinned Automerge 3.4.1,
an Intel Xeon Platinum 8573C host reporting three logical CPUs and 10,452,459,520 bytes RAM.
The files record the uncommitted runtime-source hashes and base revision `7876cc034077a29cd665e7647b978b659ad88761`.
They are not claims about the base commit alone or about every deployment environment.

| Point                                              | Completion                                              | Bare canonical median / maximum of five | Incremental editor median / maximum of five | Initial load |
| -------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- | ------------------------------------------- | ------------ |
| 1,024-unit baseline                                | Complete; exact text/Origin and lifecycle checks passed | 33.57 / 41.37 ms                        | 33.22 / 37.54 ms                            | 179.31 ms    |
| 100,000-unit text, separate from History growth    | Complete; exact text/Origin and lifecycle checks passed | 32.95 / 47.35 ms                        | 34.19 / 56.03 ms                            | 2,920.23 ms  |
| 5,000 attributed History commands, 1,024-unit text | Interrupted after setup; reload incomplete              | Pending                                 | Pending                                     | Pending      |

The five-sample maximum is also the nearest-rank p95 and has no reliable tail interpretation.
No value is a product guarantee or a correctness threshold.
The 512-unit source setting partitions inputs; it does not reject a longer logical payload.

The [baseline raw record](evidence/immutable-runs/baseline.jsonl) and
[100,000-unit raw record](evidence/immutable-runs/text-100k.jsonl) include raw samples,
source manifests, phase checkpoints and final `complete: true` records.
For the 100,000-unit point, the separately observed bare/editor edits visited 168/169 source-index paths,
allocated one source-unit leaf and built a largest subtree of one unit.
They serialized 16,441/16,601 JSON UTF-16 units and supplied 6,066/6,102 units to the UTF-8 encoder.
Observed native activation, reference generation projection, public snapshot, full target projection,
effect inspection, recovery and position-decoder calls were zero in those edits.
The corresponding baseline path-visit counts were 105/98.
These are selected implementation observations, with the blind spots in the profile.

Transition costs remain substantial.
The 100,000-unit lifecycle sequence measured a 19.63-second later load, 1.42-second restore and
52.58-second one-peer merge, followed by 57.15/78.44 ms first/following edits.
Encoded state before that sequence occupied 75,768 bytes; process RSS after the sequence was about 1.23 GB.
These are single samples and process-wide memory observations, not isolated index or native allocation measurements.
The baseline later load/restore/merge samples were 2.24 seconds / 77.24 ms / 2.54 seconds.

## Native diagnostic and remaining reconciliation

A separate fixed-startup V8 function-trace diagnostic observes the real native publication method,
with its prepared seven-record ordinary command, while excluding preparation and activation from the counted interval.
A same-source pair with four and 32 unrelated commands observed 2,271,681 and 2,216,244
WASM function entries respectively. Each fixture used the same seven-record edit shape, and the normal loader
verified the resulting snapshot. These two observations do not show growth over that interval; they do not bound
larger states, conflicting prefixes or memory operations. The earlier 2,303,496 and 2,039,810 observations used
different source snapshots and are not a matched comparison.
The normal loader verified the measured publication's exact text and Origin after the trace.
Native counters are invasive diagnostics; their wall times are not latency measurements.

The final record still needs a current-source native growth comparison and reconciliation of its blind spots,
completed History characterization including reload, and the remaining independent unrelated-state,
Origin/source-boundary and fragmentation observations.
The headless lifecycle method has one peer; it does not replace the separate N-way fan-in semantic suite.
The current profile uses ASCII source and does not measure browser paint, OS IME/clipboard, real persistence,
network delivery, device diversity or production History services.
Current full repository checks, required review and remote CI must be reported separately.
These gaps remain explicit evidence obligations rather than waived mandatory requirements.

## Refresh after cold metadata optimization

The [baseline refresh](evidence/immutable-runs/baseline-edbc.jsonl) and
[100,000-unit refresh](evidence/immutable-runs/text-100k-edbc.jsonl) completed their semantic and lifecycle checks
against the source manifest recorded in each file. Both ran while a separate 5,000-command characterization was active;
CPU and memory contention affect their timings. They are not a controlled comparison with the earlier runs.
The baseline and 100,000-unit initial loads were 190 ms and 1,498 ms; their bare-edit medians were 80.87 ms and
36.19 ms, and their incremental-editor medians were 28.79 ms and 26.67 ms. Each median uses five samples.
The 100,000-unit later load, restore and one-peer merge took 14.33 s, 2.58 s and 63.12 s respectively;
process RSS after the lifecycle sequence was approximately 1.31 GB. These are single transition observations,
not resource limits or guarantees. The source-index path counts were 168 and 169 for the observed bare and editor
edits; selected activation, projection and position-decoder counters remained zero. Native work and the longer
History reload remain separate evidence obligations.

## Interrupted 5,000-command lifecycle run

The [partial record](evidence/immutable-runs/history-5000-edbc-partial.jsonl) preserves the completed setup,
initial reload and warm-edit phases of a 5,000-command run against the recorded earlier source manifest.
Setup took 218.88 seconds and produced 6,713,974 encoded bytes. Initial reload took 1,474.95 seconds
(about 24.6 minutes), with process RSS of approximately 2.65 GB afterward. Subsequent bare and incremental-editor
warm edit medians were 54.86 ms and 44.05 ms across five samples; the output records exact text and Origin checks.
The run shared CPU and memory with other work, and RSS is process-wide rather than a measured peak.
The lifecycle sequence after those phases was interrupted, so the record remains explicitly incomplete.

The observation predates the later placement, failure-recovery, and cold-protocol changes in this PR.
It exposes a substantial reload cost; it does not establish the current implementation's final performance or
waive the remaining lifecycle and native-work evidence obligations.

## Source-bound native publication checkpoint

The [four-command journal](evidence/immutable-runs/native-publication-calls-4.jsonl) and
[32-command journal](evidence/immutable-runs/native-publication-calls-32.jsonl) record the new portable runner's
same-source call diagnostic. Both preserve identical complete source manifests, including the installed
Automerge JavaScript bindings and actual Node-bound WASM binary. Each completed build, real native publication,
and normal factory-load verification of exact target text/Origin and the complete carrier snapshot.
The selected publication intervals contained 2,248,842 and 2,039,179 WASM function entries respectively,
with the same seven-record ASCII ordinary insertion shape after four and 32 genuine unrelated commands.

These are only two points for one workload, with one observation per point. They do not show increasing call
counts over this interval and do not establish a growth bound. The runs shared CPU resources with other work;
CPU contention prevents interpreting their elapsed execution as controlled timing evidence. V8 function tracing
is invasive and is unsuitable for latency measurement in any case. Call mode did not collect native memory
operations; its zero load/store fields are not observations of zero memory work.

The counted interval excludes command preparation, source-index replay, cold activation, native load/save
and verification; the harness uses diagnostic reconstruction and a no-op source-index replay receipt as
described in the [profile](IMMUTABLE_RUN_PROFILE.md#native-publication-diagnostic). Larger states, other workload
dimensions, conflicting prefixes and native memory work remain unmeasured by this pair. This checkpoint does
not establish bounded publication work, mandatory eligibility or carrier selection. Existing negative
diagnostics and outstanding evidence obligations remain applicable.
