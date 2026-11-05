# Structure, allocator and Range comparison results

These are bounded experimental observations for Merge 8, not a Gate B or Gate C decision. The
[profile](STRUCTURE_ALLOCATOR_RANGE_PROFILE.md) defines the workloads, intervals and method. The three local probes
completed sequentially on a shared Linux x64 host (kernel 6.18.57, Node 24.19.0, Intel Xeon Platinum 8573C, three
reported CPUs and 10,452,459,520 bytes host-reported memory). Installed versions were Yjs 13.6.32, Automerge 3.4.1,
fractional-indexing 4.0.0, Fugue 3.0.0 and Vite 7.3.6.

The source was PR 49 head `f81d5a53a59d100f4efec5a79de25bdeca3c6a41` plus the exact
[source patch](evidence/structure-allocator-range/source.patch), SHA-256
`7b4d24a62a37d1029869a66433f875d8ab77fba46c92c1a220f1836e39ea6bbb`.
Apply the patch with `git apply --unidiff-zero` to that head to reproduce the runner and workflow source used. The raw
files and this summary were added afterward. The local raw metadata records the actual dirty tree and installed
dependencies. The workflow also uploads revision-bound outputs; the initial source
head's [Actions run](https://github.com/benoit-gl/coedit/actions/runs/41528051998) passed all three probes and produced
[an artifact](https://github.com/benoit-gl/coedit/actions/runs/41528051998/artifacts/13180516982). That earlier run used
the source head without the metadata patch and is distinct from the local numbers below.

Each timing is a median of three observations after one warmup. Timings are descriptive, not reliable tail estimates,
capacity limits or correctness thresholds. Candidates share one process per runner, and runtime warming, garbage
collection and other host activity can influence results. The checked-in raw samples retain each observation and
execution order: [structure](evidence/structure-allocator-range/structure.json),
[allocators](evidence/structure-allocator-range/allocators.json) and
[Ranges](evidence/structure-allocator-range/range.json).

## Structural operations

Both carriers completed every profile with fixture-derived placements, liveness, parentage, payload and Origin
checks. Each also rejected an invalid mixed transaction without changing encoded state or effect records. Distinct
concurrent Block moves converged in both delivery orders and after reload. These cases use one local dense allocator,
two concurrent moves and complete-state delivery; they do not establish behavior for every concurrency schedule or
instrument native library internals.

The table shows milliseconds and bytes for the combined 64-sibling, 16-Block subtree, depth-8, 16-repeat shape.
Mutation intervals cover their named `applyChange`; encode, reload and merge are separate and do not include the
fixture's later verification. The merge column is the first of two directional merges, not their sum.

| Carrier   | Create ms | Subtree move ms | Mixed transaction ms | Encode ms | Reload ms | First merge ms | Encoded bytes |
| --------- | --------: | --------------: | -------------------: | --------: | --------: | -------------: | ------------: |
| Yjs       |      0.92 |            0.96 |                 1.99 |      1.27 |      4.27 |          13.46 |       107,961 |
| Automerge |      2.50 |           12.17 |                 9.02 |      2.51 |     91.05 |         106.51 |        19,809 |

The other profiles independently vary sibling count, subtree size, depth and repeated move history; their complete
samples, operation outcomes and encoded growth are in the raw record. The observed growth combines native state,
liveness and retained effects and cannot attribute bytes to one component.

## Allocators

All three completed the bounded 4,096-member ordered run and the specified 16/128/512 narrow-gap and codec cases.
Invalid counts, nonces, bounds and malformed encodings produced explicit failures. Local dense refused the tested
65,536-member request with `CapacityExceeded`; the corresponding request was not exercised for the other candidates.
These are observations of this fixture, not exhaustion thresholds for all inputs. The synthetic collision-normalization
probe checks a planner, not a replicated repair protocol.

At 512 narrow-gap insertions the following are median elapsed milliseconds. Position byte sizes are per-position
length distributions from the fixture, not memory usage. All 512 size samples observed zero complete collisions.

| Allocator           | Allocate run ms | Compare ms | Sort ms | Narrow loop ms | Narrow position bytes, median / max |
| ------------------- | --------------: | ---------: | ------: | -------------: | ----------------------------------: |
| Fractional indexing |            0.29 |      0.009 |   0.015 |           2.95 |                           120 / 171 |
| Fugue               |            0.11 |      0.010 |   0.018 |          17.97 |                           131 / 221 |
| Local dense         |            0.11 |      0.014 |   0.024 |           3.00 |                           218 / 356 |

In the eight concurrent two-member runs, fractional indexing produced 14 adjacent primary collisions in two collision groups,
15 run transitions and seven projected parentage mismatches; Fugue and local dense produced no primary or complete
collisions, seven run transitions and no parentage mismatch in this fixture. The fractional candidate's known
parentage violation remains disqualifying without a separately exercised repair or protection mechanism. Normalizing
the two observed primary-collision groups rewrote 14 positions, with a 0.032 ms median planner interval, but retained
all seven parentage mismatches. This order-preserving planner is not a parentage repair; replication cost for a repair
was not measured because this probe does not implement one. This record makes no allocator selection.

## Range feasibility and holder scaling

Both carriers completed the paired fixtures for all holder counts and all specified member, unrelated-Block and prior
move shapes. Fixture-derived resolved identities, offsets and text were checked through insert/delete, move, split,
merge, reload, historical materialization, replacement with equal text and restore. The fixture supplies lineage and
retained-state tokens; it does not establish a production lineage representation, permanent Versions, or support for
an Automerge compaction operation. Yjs exposes automatic collection; this is not evidence of a shared compaction policy.

The table shows median construction and one initial lazy resolution in milliseconds for one-member holders, with no
unrelated Blocks or prior moves. Construction creates every listed holder; resolution supplies one Range. Serialized
external-holder JSON grew from 210 bytes for one holder to 214,017 bytes for 1,024 holders in this fixture.

| Holders | Yjs construction | Yjs resolve one | Automerge construction | Automerge resolve one |
| ------: | ---------------: | --------------: | ---------------------: | --------------------: |
|       1 |            0.078 |           0.016 |                  0.048 |                 0.015 |
|      64 |            1.245 |           0.013 |                  0.667 |                 0.009 |
|     256 |            3.328 |           0.009 |                  2.541 |                 0.013 |
|   1,024 |            9.443 |           0.009 |                 11.289 |                 0.009 |

The fixture also measures a source member crossing the split into two ordered descendant spans. In the 64-holder,
one-member baseline, median deletion / crossing-split / invalidating-replacement resolution was 0.113 / 0.149 /
0.425 ms for Yjs and 0.078 / 0.066 / 0.167 ms for Automerge. The replacement case omits invalidated members rather
than attaching them to equal content. These intervals cover resolution and its native materialization, not a complete
product History operation.

The retained-lineage cases add 0, 8 or 32 move-and-capture transitions with other dimensions fixed. In the following
table, carrier bytes are encoded after those moves and captures, before the later split/merge lifecycle. External
lineage bytes are the JSON encoding of the supplied transition path, including token strings. Resolution follows that
path for one selected Range. Values include both native changes and retained snapshots; they do not isolate per-token
storage cost.

| Extra edges | Yjs carrier bytes | Yjs path resolve ms | Automerge carrier bytes | Automerge path resolve ms | External lineage bytes |
| ----------: | ----------------: | ------------------: | ----------------------: | ------------------------: | ---------------------: |
|           0 |             1,866 |               0.025 |                   1,060 |                     0.020 |                      2 |
|           8 |             7,928 |               0.153 |                   1,941 |                     0.352 |                    737 |
|          32 |            26,096 |               0.789 |                   3,603 |                     0.606 |                  2,945 |

The edit/move fixture driver receives an instrumented external holder store and completes with zero accesses. A
separate deliberately scanning driver triggers the guard in the automated test. The carrier and probe have no
registered-holder API, so this demonstrates only the supplied fixture driver boundary; it does not prove that a future
registered holder system or candidate-native internals avoid scans. Production Range-holder behavior and the final
representation remain to be verified at their owning later gate.
