# History, replacement and lifecycle evidence

This is bounded comparative evidence for Merge 8, not a Gate B policy or a product History implementation. The
fixtures and observations below supplement the existing [causal payload history](../integrated/CAUSAL_PAYLOAD_HISTORY.md)
and [replacement fan-in](REPLACEMENT_FANIN.md) evidence. The local measurements used PR 48 head
`6f7b86baefade1bf26a12817d99e1cf65ade63c4` (tree
`e0e614a012d16061057125d932b6da7272426324`) plus the exact [source patch](evidence/history-source.patch), SHA-256
`39b2dc1f338f6f1f12925fb2e1e8963ab7df62d4cb06d418b216b1e61a9fa3a9`. Apply that patch to the stated head to
reproduce the source used for the runs; changes to raw evidence and prose do not affect the runners. The local Git HEAD
`77dd049c6897078bf5ebd3415e10c21013b37f0d` was a synthetic commit of the same head tree. The null GitHub revision in
the mixed runner denotes a local run. Raw samples are committed alongside this record. The Actions job reruns these
probes and uploads its own revision-bound raw evidence, including partial output on failure.

The probes ran sequentially on a shared Linux x64 cloud host with Node 24.19.0, Yjs 13.6.32 and Automerge 3.4.1.
They are experimental observations, not limits or tail-latency claims. Three samples without warmup support a
median only; they do not establish p95, independent-process variability, or performance on other devices.

## Mixed histories

`node scripts/step3-mixed-history.mjs` emits [raw samples](mixed-history-raw.json). Each fresh carrier executes
12, 40 or 100 attributed operations: text insert and delete, whole-text replacement, and opaque replacement combined
with a Block placement change. At complete operation cycles visible text is eight UTF-16 units and opaque content is
four bytes; insertion briefly raises the text length to nine. A midpoint capture is checked after subsequent changes,
materialization, encoding/reopen, restore, a further edit and another reopen.
The snapshots are detached qualification values; they do not prove a product Version or indefinite retention.

At 100 effects the three-sample median for Yjs / Automerge was respectively 16.72 / 172.96 ms for the first 48 edits,
15.12 / 192.37 ms for the remaining 52, 0.29 / 2.40 ms for capture, 0.034 / 0.057 ms for materialization,
1.06 / 2.81 ms for encoding, 3.48 / 63.96 ms for reopening, 0.38 / 31.05 ms for restore, and 0.62 / 3.03 ms for
the subsequent edit. Encoded sizes before restore were 84,419 / 18,807 bytes. These phases have different boundaries;
materialization reads the captured snapshot, so its timing is not a general history reconstruction cost. In particular,
the measurement cannot attribute carrier history, liveness tokens and replacement metadata individually.

## Repeated reload and retained growth

The [lifecycle probe](evidence/lifecycle/README.md) alternates insertion and deletion, captures every ten effects,
reloads at 20, 100 and 200 effects, checks all retained captures, and continues from each reopened state. Both encoded
states grow with history despite constant visible content. Memory and process-peak observations include setup, native
state and retained snapshots; they cannot establish per-document memory or identify the cause of growth. Yjs exposes
automatic garbage collection; the pinned Automerge adapter exposes no native compaction. Save/load is not a substitute
for compaction, and neither observation proves reclamation or perpetual retention.

## Concurrent alternatives

The [fan-in record](REPLACEMENT_FANIN.md) describes two through 32 mixed-type concurrent replacements, transitive
ancestry, ordered and duplicate deliveries, retained effects, branch captures, reload and restore. Existing common
suites cover text/text, opaque/opaque, mixed replacements and concurrent insertion, deletion and fine-grained
replacement. These tests establish the observed bounded cases, not all delivery schedules. The recorded effect DAG
provides stable lowest/highest frontier alternatives and identifies edits on other branches. It does not implement
arbitrary losing-branch replay or establish how edits should be transformed onto a chosen winner. Captured full states
can reconstruct the exercised branches, at the cost of retaining those snapshots. Gate B must choose the winner and
mixed-operation policy; no alternative here is selected or silently treated as a production History design.

The workloads are intentionally bounded and tiny. They do not characterize unbounded frontiers, large payloads,
compaction after long histories, or application-level historical retention. The resource and final comparative work
still owned by Merge 8 must use its final consistent profile and reconcile these observations with the other workloads.
