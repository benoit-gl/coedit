# Reload and retained-state growth probe

Run from the repository root with installed dependencies:

```sh
STEP3_LIFECYCLE_CANDIDATE=yjs node scripts/step3-lifecycle-growth.mjs > yjs.json 2> yjs.jsonl
STEP3_LIFECYCLE_CANDIDATE=automerge node scripts/step3-lifecycle-growth.mjs > automerge.json 2> automerge.jsonl
```

The raw files are one execution per candidate, in that order, on the same host and runtime recorded in each JSON
file. Each completed checkpoint is also emitted to standard error as JSONL so partial results survive failure.
The profile creates a four-unit text payload and alternates insertion of a four-character sequence number and
deletion of the previous four characters with unique attributed effects. Each pair leaves four visible UTF-16 units;
the intermediate insertion briefly has eight. Captures occur every ten effects and contain distinct text. At 20,
100 and 200 effects the runner encodes and reloads, compares the full live snapshot and effect count, and compares
each historical snapshot with the full detached snapshot saved at capture. The next interval continues editing the
reloaded carrier. This checks repeated reload and retained-state accessibility while holding checkpoint text size
constant. Native lifecycle capability is reported as exposed by each adapter; the experiment does not synthesize
compaction. The JSON records Git HEAD, dirty status, and `GITHUB_SHA` when supplied; dirty state includes all tracked
and untracked worktree changes at the time of reporting.

At 20/100/200 effects, encoded sizes were 15,302/73,098/146,043 bytes for Yjs and 4,204/14,994/27,096 bytes
for Automerge. Both grew while checkpoint text size remained constant. Encoded sizes include retained effects,
captured snapshots, native state, and framing; they do not attribute bytes to
individual components. The raw data contains edit-and-capture interval times, encode and load times, total
materialization time, process memory snapshots and process-lifetime peak RSS. Edit intervals have different counts;
materialization covers an increasing number of states. RSS includes loader and setup, is not per-document memory,
and heap readings depend on garbage collection. The candidates ran sequentially on a shared cloud host, so timings are
noisy single observations, not latency distributions, thresholds, capacity limits, or causal performance estimates.

This probe covers a small, single-text linear history and detached qualification snapshots. It does not establish a
portable Version, permanent retention, causal restore, behavior after compaction, or resource bounds for larger and
concurrent histories. Other comparison evidence covers replacement and branching. The runner checks reload and
continuation invariants for both candidates; it does not enforce performance numbers.
