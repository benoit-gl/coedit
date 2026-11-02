# Replacement and fan-in qualification

This experiment compares the pinned Yjs and Automerge integrated qualification
carriers. It does not select a carrier or replacement policy at Gate B.

`replacementFanIn.test.ts` forks a shared native genesis into 2, 4 and 8
concurrent alternatives. Even-numbered branches replace with text and then edit
that branch; odd-numbered branches replace with opaque bytes. Forward and reverse
fan-in converge, and each explicitly captured branch state materializes exactly
on both merged replicas and after reload. A later replacement observes and
supersedes all alternatives in the frontier, while captured states still
materialize; restoring a captured state preserves those other captures across a
further reload. Restore is exercised at 2, 4 and 8 branches, not at 16 or 32.
A separate case checks transitive precedence through an effect
on another InlineContent, concurrent alternatives and duplicate delivery.

The focused payload suite covers text/text, opaque/opaque and text/opaque
replacement pairs and three-way mixed replacement. The retained Range/effect
suite covers concurrent same- and cross-type replacement, branch insert, delete
and fine-grained delete-plus-insert, Origin and effect attribution, delayed,
reordered and duplicate full-state delivery, reconnect and reload. These are
bounded examples, not all possible delivery schedules.

| Alternative                                   | Evidence and contract implications                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lexically lowest or highest concurrent effect | The retained causal DAG derives the same ordered replacement frontier on converged replicas and reports both stable choices. Either can resolve a tie without wall-clock or arrival order; this fixture does not install either as the integrated current winner. A later observed replacement must supersede its predecessors under either choice.                   |
| Preserve edits on a nonwinning branch         | Effect records retain insert/delete operation, Origin where applicable, causal parents and the candidate-derived replacement base. They identify edits relative to either winner. Their presence alone does not implement branch replay, resolve offsets against a different branch, or establish a mixed-operation policy.                                           |
| Materialize a losing branch                   | Explicitly captured full qualification snapshots reproduce the fixture branches including their edits after merge and reload. The records expose the complete replacement values, but do not by themselves provide a general historical Version reconstruction algorithm. Captures are qualification-only snapshots, not product Contributions or permanent Versions. |

The two winner probes use the same compact parent DAG. Frontier derivation first
validates that DAG, then traverses replacement ancestry, including intervening
edits and unrelated payload effects. The work is proportional to retained
records and reachable ancestry; it is not a constant-time lookup. Retaining a
full captured snapshot per branch costs additional space and is not evidence
that a production History implementation has the same cost or permanence.

## Measurement

Run `STEP3_REVISION=$(git rev-parse HEAD) STEP3_DIRTY=true node
scripts/step3-replacement-fanin.mjs > qualification/step3/comparison/replacement-fanin-raw.json`
from the repository root. The script creates fresh replicas at 2, 4, 8, 16 and
32 concurrent mixed-type branches, with three sequential samples per candidate
and size. It measures complete-state merges individually (including adapter
staging and validation), current projection, evidence retrieval, frontier and
alternative reconstruction, materialization of all explicitly captured
branches, encoding, reopen and encoded size. Outside timed intervals, every row
checks each captured snapshot on forward, reverse and reopened replicas, and compares the forward-merged current projection,
effect contexts, payload effects and alternatives with reverse-order fan-in and
with reload. These full-state deliveries cover two orders, not arbitrary network
schedules. Verification work contributes to cumulative process RSS. The raw
file retains every completed sample and individual merge time. The process maximum RSS is cumulative across the
whole run and
cannot be assigned to an individual row. There are no warmups or tail-latency
claims; snapshots and tiny payloads here do not represent realistic large
payloads. Candidate runs are sequential, so order and runtime warming may
influence results. Timings include unrelated system load, and cannot separate
native merge cost from adapter validation or claim production performance.

The recorded run executed after the other local probes finished. At 32 branches, the median of three samples was
43.3 ms for Yjs and 228.7 ms for Automerge for the sum of complete-state merges; median encoded sizes were 39,299
and 10,162 bytes respectively. These are descriptive measurements on one cloud host; correctness does not depend
on a timing threshold. Neither pinned Automerge save/load nor Yjs
automatic collection constitutes a shared production compaction policy.
