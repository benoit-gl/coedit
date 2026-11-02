# Reload and retained-state growth probe

Run from the repository root with installed dependencies:

```sh
STEP3_LIFECYCLE_CANDIDATE=yjs node scripts/step3-lifecycle-growth.mjs > yjs.json
STEP3_LIFECYCLE_CANDIDATE=automerge node scripts/step3-lifecycle-growth.mjs > automerge.json
```

The committed raw files are one execution per candidate, in that order, on the same host and runtime recorded in each
JSON file. The profile creates a four-unit text payload and alternates one-character insertions and deletions with
unique attributed effects. It captures a detached state after every ten effects and, at 20, 100 and 200 effects,
encodes, reloads, checks the live payload and effect count, and materializes every captured state. The next interval
continues from the reloaded carrier. Each captured state contains `base`; all are checked after each reload. This
exercises repeated lifecycle transitions and retained-state accessibility while holding visible text size constant.
Native lifecycle capability is reported as exposed by each adapter; the experiment does not synthesize compaction.

At 20/100/200 effects, encoded sizes were 15,269/72,939/145,728 bytes for Yjs and 4,081/14,400/26,228 bytes for
Automerge. Thus both encodings grew in this bounded retained-history workload despite constant visible text. The
measurements include retained effects, captured snapshots, native state, and framing; they do not attribute bytes to
individual components. The raw data contains edit-and-capture interval times, encode and load times, total
materialization time, process memory snapshots and process-lifetime peak RSS. Edit intervals have different counts;
materialization covers an increasing number of states. RSS includes loader and setup, is not per-document memory,
and heap readings depend on garbage collection. The candidates ran sequentially on a shared cloud host, so timings are
noisy single observations, not latency distributions, thresholds, capacity limits, or causal performance estimates.

This probe covers a small, single-text linear history and detached qualification snapshots. It does not establish a
portable Version, permanent retention, causal restore, behavior after compaction, or resource bounds for larger and
concurrent histories. Other comparison evidence covers replacement and branching. The runner checks reload and continuation invariants for both candidates; it does not enforce performance numbers.
