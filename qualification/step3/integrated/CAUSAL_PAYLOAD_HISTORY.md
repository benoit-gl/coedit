# Compact payload causal evidence experiment

This is a Step 3 qualification-only representation experiment for both candidate adapters.
It changes neither the product History contract nor the Gate B selection of a carrier, replacement winner,
mixed replacement/edit policy, resource guard, or production encoding.
The retained historical-state tokens remain snapshot probes, not product Versions or causal Contribution frontiers.

## Motivation and representation

Previously every contextual payload effect stored all previously observed payload-effect identities in `observed`.
A sequential chain of N effects therefore retained N(N−1)/2 causal references.
The apply envelope also embedded that entire encoded payload effect, duplicating operations and their causal references.

Each payload effect now stores `parents`: the maximal payload-effect identities visible at authoring time.
All earlier observations remain reachable transitively through immutable retained parent links.
A sequential chain stores N−1 references; a change following a merge records each concurrent head.
Frontier width remains dependent on actual concurrency and is not capped by this experiment.
The graph covers contextual payload effects only, exactly the observations retained by the earlier representation.
Context-only, structural-only, and restore envelopes do not add payload graph vertices.
They retain their existing actor/effect evidence and do not erase the observed payload frontier.
Unattributed payload changes continue to have no payload-effect evidence.

Each adapter caches only the current payload heads in memory.
After a successful local payload publication, the newly authored effect is the sole head.
Failed preparation or native publication does not advance this cache.
There is no per-insertion traversal, transitive-closure materialization, or enumeration of retained payload records.
Authoring causal metadata costs O(F) references for frontier width F, including canonical sorting;
this is not a claim about total command cost.

Reload and staged merge derive heads from the complete retained payload DAG, independently of enumeration or delivery order.
Iterative topological validation rejects missing parents, duplicate identities or edges, and cycles.
Validation and reconstruction cost O(V+E), plus frontier sorting, for V vertices and E parent references.
The merge publishes the reconstructed cache only after the native merge succeeds.
Duplicate and stale complete-state deliveries therefore cannot restore an ancestor as a head.
As before, these adapters exchange complete native states; this is not a missing-dependency transport inbox.

Replacement probes traverse parent ancestry through all intermediate payload effects, including fine-grained edits and
operations on other InlineContents.
Checking only immediate replacement parents would incorrectly preserve superseded replacements.
The traversal marks ancestors from all replacement parents together and visits each reachable vertex once.
The complete alternatives and the fine-edit base replacement references remain retained.
No replacement winner or mixed replacement/edit policy is selected.

## Removing the duplicate payload copy

An apply envelope now stores `payloadEffectId`, or null for a change without payload evidence.
Its same-key payload record contains the operations and parents exactly once in this qualification evidence layer.
The envelope, context, payload effect, and native semantic state are still published in one candidate-native change.
The immutable authoring nonce and structural semantics remain in the envelope.
Restore envelopes continue retaining their existing target snapshot.

Merge preflight still independently compares the context, envelope, and payload record bytes for every shared identity.
Thus two independently authored effects with the same actor/effect pair remain conflicting even when operations match,
and altered payload evidence is rejected even if the referenced envelope is unchanged.
This reference is qualification-private and depends on atomic same-document publication and retained record comparison.
It is not a cryptographic digest, authenticated reference, portable chunk format, or general hostile-input validator.
Native carrier history and visible payload state naturally retain their own material; removing this redundant evidence copy
is not a claim that the entire document stores each payload byte once.

## Compatibility and remaining costs

The qualification-private payload record changes from `observed` to `parents` and the apply envelope changes from an
embedded `payloadEffect` to `payloadEffectId`.
Retained evidence encoded by the former adapters is deliberately not migrated; loading old payload-effect records fails.
Fresh fixtures must be created for matched comparisons.
This is not a production portable-format compatibility commitment.
The `recordedPayloadEffects` and replacement-alternative probe results expose immediate parents instead of closures;
consumers needing ancestry must retain the complete graph.

Liveness tokens, their update-over-delete semantics, snapshot scans, text projection, native carrier changes,
complete-state serialization/merge, and retained historical snapshots are unchanged.
These can still dominate time or growth after the causal evidence reduction.
A wide concurrent frontier can still require many references, and ancestry queries still traverse retained evidence.
The experiment does not establish permanent exact Version materialization, causal restore, compaction, selected capacity
limits, or performance guarantees.
The existing History measurement script measures contextual append-and-encode work, not those deferred capabilities.

## Verification and evaluation

`causalPayloadHistory.test.ts` checks the following against both native candidates:

- one parent per sequential effect, including continuation after reload;
- native envelope records referencing payload evidence without an embedded payload copy;
- three concurrent replacement branches, edits, duplicate/stale/reordered complete-state delivery, and reload;
- transitive replacement precedence across unrelated payload effects, context-only changes, and restore;
- failed writes and conflicting identities leaving the subsequent frontier intact;
- independent payload conflict detection when an envelope is unchanged; and
- missing DAG dependencies rejecting load and staged merge without publishing remote state.

Helper tests reject cycles and duplicate graph identities/edges and traverse a long reversed chain iteratively.
Fixture sizes are test construction choices, not acceptance limits or experimental product capacity targets.
The existing integrated and retained-Range suites retain update-over-delete, complete replacement alternatives,
fine-edit branch bases, actor/effect identity conflicts, historical materialization, and repeated delivery assertions.
The handcrafted unattributed Automerge fixture now includes an empty payload-evidence namespace so it continues reaching
its intended missing-Origin assertion after DAG validation was added to load.

Use the unchanged `scripts/step3-history.mjs` on the baseline and this experiment with the same runtime, host, effect
counts, and sample method for cost evidence.
Record local modifications and timing scope separately from the base revision.
Any resulting timings and encoded sizes are experimental observations owned by Step 3 comparative qualification;
Gate B owns promotion or carrier selection.
They must not become correctness thresholds or substitute for the remaining comparison coverage.
