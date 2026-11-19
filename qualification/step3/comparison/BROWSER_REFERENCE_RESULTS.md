# Browser and reference qualification results

## Disposition and source

This is bounded experimental evidence for Step 3 merge unit 9, under the
[profile and methodology](BROWSER_REFERENCE_PROFILE.md) and [machine-readable fixture profile](browser-reference-profile.json).
The specified browser/reference workload questions have exercised observations and explicit limits. No carrier,
allocator, string domain, admission strategy or replacement policy is selected. The
[ordinary-edit eligibility failure](ORDINARY_EDIT_RESULT.md) remains unresolved by this unit.

The focused `browser-reference` job in
[Actions run 44400078276](https://github.com/benoit-gl/coedit/actions/runs/44400078276) succeeded for PR 53 source
head `5a69aa3812f982804bfa6384c4600396bde0772b`, checked out as test merge
`a84217be3c7eb63bed9cdc7d9710df040ab6e1b7`. Its report recorded a clean working tree. The
[raw artifact](https://github.com/benoit-gl/coedit/actions/runs/44400078276/artifacts/14471594823) publishes
`report.json`, the browser log, `loro-reference.json` and the Loro log. The summaries below were derived from the exact
structured report emitted in the job log through the authenticated connector. The ZIP archive itself was not
independently downloaded or compared; workspace archive downloads were blocked by the network proxy.

- Host: Linux 7.0.0-1019-azure x64, AMD EPYC 9V74, four reported logical CPUs, 16,759,439,360 bytes reported host RAM.
- Runtime/browser: Node 24.22.2, pinned Chromium 156.0.8078.4 through Playwright 1.64.0.
- Packages: Yjs 13.6.32, Automerge 3.4.1, ProseMirror view 1.42.6/state 1.4.4; isolated Loro 1.16.4.
- Sampling: fresh browser fixtures, one warmup and three measured samples per candidate/shape; candidate order
  alternates by iteration. Native Loro uses one warmup and five measured samples per workload.

Artifacts expire. This committed profile, method, source identity, environment and summary are the durable record;
raw archives and logs supplement them. Later documentation-only commits do not relabel these observations as runs
against a different head. A separate clean local rehearsal at `5c55c9d24bf1c5e19c5aff8a3a22aaafd05a8e12` also
completed the manifest; its different-host timings are not pooled into the CI numbers below.

## Browser editing observations

All 36 measured editing rows completed, yielding 108 operation observations. The fixtures check independently
constructed text and Origin expectations after each action, and unchanged unrelated Block structure, ownership,
text/opaque payloads and Origins. Six shapes vary target length, Origin runs and unrelated Block count independently
and in combination. Target-only changes did not alter unrelated state in these cases.

The table gives descriptive medians from three observations. `selection-source` and `unicode-insert` use transaction
construction plus synchronous ProseMirror dispatch; `keyboard-end` uses the awaited synthetic keyboard driver.
Keyboard selection/focus setup is outside the interval. The outer interval includes adapter translation, synchronous
publication and view update; nested publication measures `carrier.applyChange`. The intervals overlap and must not
be added. No number is a tail estimate, product latency guarantee, resource limit or correctness threshold.

| Shape         | Operation        | Yjs outer ms | Yjs publication ms | Automerge outer ms | Automerge publication ms |
| ------------- | ---------------- | -----------: | -----------------: | -----------------: | -----------------------: |
| baseline      | selection-source |        0.600 |              0.400 |              1.900 |                    1.600 |
| baseline      | unicode-insert   |        0.500 |              0.300 |              2.000 |                    1.500 |
| baseline      | keyboard-end     |       17.700 |              0.300 |             18.200 |                    1.500 |
| target-10000  | selection-source |        0.800 |              0.300 |              2.400 |                    1.900 |
| target-10000  | unicode-insert   |        0.900 |              0.200 |              2.600 |                    1.700 |
| target-10000  | keyboard-end     |       23.600 |              0.300 |             34.300 |                    1.600 |
| target-100000 | selection-source |        4.300 |              0.900 |              5.900 |                    2.400 |
| target-100000 | unicode-insert   |        4.700 |              0.700 |              5.100 |                    1.800 |
| target-100000 | keyboard-end     |      169.600 |              0.700 |            160.700 |                    1.800 |
| origins-8     | selection-source |        0.400 |              0.200 |              2.000 |                    1.700 |
| origins-8     | unicode-insert   |        0.600 |              0.300 |              2.100 |                    1.500 |
| origins-8     | keyboard-end     |       15.600 |              0.200 |             17.000 |                    1.800 |
| unrelated-16  | selection-source |        0.400 |              0.200 |              2.800 |                    2.300 |
| unrelated-16  | unicode-insert   |        0.700 |              0.300 |              2.300 |                    1.700 |
| unrelated-16  | keyboard-end     |       16.100 |              0.300 |             15.900 |                    1.600 |
| combined      | selection-source |        0.700 |              0.300 |              2.500 |                    1.900 |
| combined      | unicode-insert   |        0.900 |              0.400 |              2.500 |                    1.500 |
| combined      | keyboard-end     |       26.700 |              0.200 |             26.800 |                    1.500 |

The size and unrelated-state observations characterize the chosen targeted qualification path. They do not prove
constant-time editing, absence of native scans, or feedback independent of slow canonical publication. Origin runs
also change setup history, so their timing differences do not isolate fragmentation cost. Single-host variation,
runtime warming and garbage collection remain confounders. The recorded samples do not rank carriers.

## Lifecycle and scheduling observations

All six measured lifecycle rows completed the ordered phases on both carriers:

| Phase              | Observed outcome                                                                                                                                                                                                                                     | Practical limit                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Pending downstream | Two mounted keyboard edits completed while queued persistence/outbound/inbound gates stayed closed across an explicit timer task boundary. There were zero writes/deliveries and no inbound receipt during those edits.                              | Pending in-memory tasks, not real storage, network, durability or CPU contention.                                            |
| Inbound recovery   | A separately authored remote prefix converged with local edits and exact attributed content. The stale mounted edit was refused with unchanged committed bytes/state/effects, the view reset, and an explicitly reselected following edit succeeded. | This is recovery after a detected stale base, not automatic incoming-view synchronization or uninterrupted caret continuity. |
| Reload             | A serialized state reopened exactly; its position at offset 1 resolved at offset 2 after the remote prefix, including after reload. Remount and following editing succeeded.                                                                         | A controlled reopen and native-position observation, not process crash recovery or product persistence.                      |
| Restore            | The retained original state restored its text/Origins. The old text position became unresolved; stale-view refusal/reset and a following edit succeeded.                                                                                             | Detached qualification captures, not permanent product History or causal restore semantics.                                  |
| Replacement        | Whole-text replacement invalidated the prior position. View recovery, explicit reselection, following editing, final reload and replica convergence succeeded.                                                                                       | No replacement-winner or mixed-operation policy selection.                                                                   |

In all recorded reset/remount observations the transient selection started at offset 0. The fixture explicitly
reselects the end for the next edit. This records existing behavior; it introduces no selected production caret policy.
Failures must not silently attach stale positions to equal content. Broader lineage and production Range service remain
with their existing owners.

## Native-string edge observations

Both candidates atomically refused all three explicit mounted `text/markdown` edge operations:

| Operation                                             | Yjs            | Automerge      |
| ----------------------------------------------------- | -------------- | -------------- |
| Insert isolated high surrogate into `ab`              | Atomic refusal | Atomic refusal |
| Insert isolated low surrogate into `ab`               | Atomic refusal | Atomic refusal |
| Delete UTF-16 `[1,3)` from the two-pair string `😀😁` | Atomic refusal | Atomic refusal |

Refusal was the candidate's explicit non-exact ECMAScript-string `TypeError`, not an arbitrary fixture failure.
Encoded bytes, semantic state, effect contexts and payload-effect records remained unchanged, and mounted text reset
to canonical content; the recorded reset selection was offset 0. The fixture's success branch requires exact text,
Origin and reopen behavior, but none of these six observations exercised acceptance. These cases do not determine
the eventual string support domain or claim that all native strings are unsupported. Existing payload and editor
suites supply other successful native-string and `text/plain` cases.

## Pinned Loro reference

All three native workloads completed their independent text/cursor and tree-parent expectations. These numbers
include the native resolution/projection and checks specified in the method, with setup excluded. The maximum is the
largest of five observations, also the script's nearest-rank p95; it is not a reliable latency-tail estimate.

| Native workload           | Input | Median ms | Maximum observed ms | Checked result                |
| ------------------------- | ----: | --------: | ------------------: | ----------------------------- |
| native-text-cursor-insert |  1024 |     0.050 |               0.064 | Exact text; cursor offset 513 |
| native-movable-tree       |    16 |     0.382 |               0.445 | Child ends under left parent  |
| native-movable-tree       |   128 |     1.509 |               1.806 | Child ends under left parent  |

The native reference omits Coedit protected Origin, semantic publication, effect/liveness metadata, attributed editor
projection and integrated structural, serialization and lifecycle work. Source, input dimensions and timing boundaries
also differ. These are reference feasibility/cost observations only; no speed ratio or equivalent-feature comparison
with either selectable carrier follows from them.

## Requirement disposition and remaining work

| Unit 9 question                                                     | Disposition                                                                                                                                                                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Representative source, size, Origin and unrelated-state workloads   | Exercised by the new paired profile, supplementing the existing short-operation and ordinary-edit browser records. No full Cartesian workload or universal device envelope is claimed.               |
| Asynchronous downstream and inbound/lifecycle/selection behavior    | Exercised under the explicit task/gate, stale-view recovery, remount/reselection and following-edit model above. It is not evidence of real I/O or independently asynchronous canonical publication. |
| Keyboard, transaction, composition, clipboard and paint methodology | Recorded in the profile document, including the limits of existing synthetic composition and `DataTransfer` cases. Real OS IME/clipboard and physical paint are unmeasured.                          |
| Pinned Loro cursor/movable-tree reference                           | Executed with independent expectations, source/environment/method and explicit workload/interval differences. It remains non-selectable and outside production dependencies.                         |

No additional unit 9 mechanism or material policy decision was identified by these observations. Known mandatory
failures remain failures. Unit 10 owns production-compatible ordinary-edit eligibility; unit 11 owns the final
common-revision comparison after units 8-10, including remaining resource/admission evidence, requirement mapping,
licenses and integration tradeoffs; unit 12 selects only already exercised eligible behavior. Step 6/Gate C retains
production Range and lineage ownership. Closing this bounded workload unit does not close any of those gates.
