# Ordinary-edit eligibility design assessment

## Disposition and authority

This assessment prepares Step 3 merge unit 10 in the
[scaffolding plan](../../../SCAFFOLDING_PLAN.md). It identifies the design question before implementation;
the subsequent user direction selects supported public APIs without native-library changes or fork maintenance.
The [representation design](ORDINARY_EDIT_REPRESENTATION_DESIGN.md) defines the proposed qualification variant and
its implementation sequence. No production carrier, structural allocator or Gate C representation is selected.
Merge unit 10 remains incomplete.
The [ordinary-edit result](ORDINARY_EDIT_RESULT.md) remains a failure for both current unrestricted representations.
The [unit 9 browser record](BROWSER_REFERENCE_RESULTS.md) adds observations without changing that disposition.

The required outcome is an exercised production-compatible ordinary-edit path. The
[verification plan, section 6.6](../../../docs/MVP_VERIFICATION_PLAN.md#66-performance-qualification) disqualifies
whole-document work on routine typing even when measured latency is small. A limitation, a cache-only improvement,
an unmeasured proposed design, or a favorable timing does not pass that requirement.

Initial readiness before that subsequent direction, at main revision
`c75fdefa2394211819c28f3f0aa354142432ceaa`, which includes PR 53:

| Criterion                       | Assessment                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prerequisites                   | Landed qualification foundation, incremental experiment and unit 9 observations are available.                                                                                |
| Required outcome and exclusions | Clear: establish eligibility without selecting the carrier, waiving the criterion or implementing later product History/Range services.                                       |
| Material design choices         | Unsettled: accepted behavioral contracts do not choose between changing the native dependency and changing the carrier-private representation.                                |
| Verification                    | The existing negative fixtures and required semantic/native-work/lifecycle checks identify the starting evidence; the selected design must supply its own additional oracles. |
| Plan consistency                | Unit 10 explicitly anticipates this design assessment and requires a decision before implementation through an unsettled choice.                                              |
| Coherent implementation scope   | Depends on the design. A physical multi-document coordinator or dependency fork would have different scope from a single-native-document representation change.               |

The native observations below remain bound to that initial revision. The linked design and corresponding work-order
update develop the selected direction; implementation follows their planning merge in a separate PR. This assessment
creates no eligibility exception or additional numbered unit. Units 11 and 12 retain final comparative qualification
and Gate B selection respectively.

## Current native failures

The incremental adapter already has localized attributed slices, staged edits and instance-local revision receipts.
It does not remove work performed inside the candidate libraries. The unchanged
[native-work probe](nativeOrdinaryWork.ts) reproduces the following observations at the revision above, with installed
Yjs 13.6.32 and Automerge 3.4.1. These are untimed work observations, not performance limits.

For Automerge, one integrated incremental attributed insertion copies sources containing the target and every
unrelated InlineContent identity in the constructed flat payload map:

| Unrelated contents | Prior insert/delete edits | Maximum observed copy-source keys | Maximum unrelated IDs in one copy source |
| -----------------: | ------------------------: | --------------------------------: | ---------------------------------------: |
|                  0 |                         0 |                                11 |                                        0 |
|                  0 |                       100 |                               102 |                                        0 |
|                 20 |                         0 |                                21 |                                       20 |
|                 20 |                       100 |                               121 |                                       20 |
|                100 |                         0 |                               101 |                                      100 |
|                100 |                       100 |                               201 |                                      100 |

The maximum-key column and unrelated-ID column need not describe the same copied object. The probe observes
`Object.assign` source keys, not recursively copied values or map identity; history also changes liveness and effect
evidence. It does not establish every source of native work or its cost. The observation is sufficient to retain the
current-topology failure, not to rule out every possible Automerge representation.

The installed Automerge `change` implementation commits through `progressDocument` and
`handle.applyAndReturnPatches`. `changeAt` reaches the same path; incremental save/load concerns bytes, not a narrow
local mutation API. A patch callback observes publication rather than bypassing it. Root publication alone does not
prove linear copying for every topology: the publication implementation crosses into WASM, and a bounded tree layout
could have different behavior. No eligible replacement API or representation was established by this assessment.

For Yjs, the probe inserts attributed text at the end of a 1,024-unit native text with independently varied Origin runs:

| Origin fragments | Preexisting native items | Unique preexisting items whose right link was read | Right-link reads |
| ---------------: | -----------------------: | -------------------------------------------------: | ---------------: |
|                1 |                        3 |                                                  2 |                4 |
|               32 |                       96 |                                                 64 |               66 |
|              256 |                      768 |                                                512 |              514 |
|             1024 |                     3072 |                                               2048 |             2050 |

In pinned Yjs, `Y.Text.insert(index, text, attributes)` passes `!attributes` to `findPosition`. Explicit protected Origin
therefore disables the search-marker route; the search starts at the text head and follows the prefix. Omitting Origin
would inherit formatting instead of satisfying non-inheriting attribution. Calling `format` afterward is not a proven
escape: its position search also starts without a marker. Private native items and marker mutation are diagnostic
access, not an established supported production insertion API. A marker optimization would also have to preserve the
active formatting context and cleanup semantics.

The probe temporarily observes private item links, restores them, and verifies exact resulting text and encoded reopen.
It does not observe newly created items, all library traversals, engine allocation or all browser work. This is a
version-specific counterexample to the current representation's unrestricted claim, not a proof that every Yjs layout
is ineligible.

The local reproduction used Node 24.19.0 on Linux 6.18.57 x64, Intel Xeon Platinum 8573C, three reported logical CPUs
and 10,452,459,520 bytes of reported host RAM. The probe source, shapes and assertions are committed; the observations
above are a durable summary. No local timing samples are compared with earlier CI timings.

Run the existing counterexample tests with `npm run test -- qualification/step3/comparison/nativeOrdinaryWork.test.ts`.
To obtain all raw rows, load `nativeOrdinaryWork.ts` through the repository's Vite SSR tooling and call
`runNativeOrdinaryWork()`, or use the existing ordinary-edit runner in an empty evidence directory. The latter also
runs the broader measurements and lifecycle package described in the ordinary-edit result.

## Material alternatives

The following directions were considered during the initial assessment. Subsequent user direction chooses the
supported-public-API strategy; native-library changes and forks are excluded from the current design. None of these
initial alternatives establishes an eligible implementation. The physical-partitioning direction is outside the
established authority and scope described below:

| Direction                                                                                                                 | Potential benefit                                                                                                                          | Material cost and unresolved evidence                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep the current layout; obtain a supported native-library extension, upstream release or maintained fork                 | Could retain more existing carrier layout and identity behavior. A Yjs attributed-position API could address the identified prefix search. | Changes dependency/API and maintenance strategy. An actual implementation must preserve formatting/Origin semantics and demonstrate its native work. No Automerge publication remedy is established here. Any version or fork needs common-suite and browser requalification.                |
| Keep the pinned public APIs; design bounded text segments and bounded-fanout native containers within one native document | Could localize attributed lookup and publication while retaining the native transaction boundary for mixed structure/text/opaque changes.  | Changes carrier-private persistent layout, lookup/routing, segmentation, identity and concurrency behavior. Bounding text length alone does not bound tombstone/history fragmentation. All metadata maps touched by typing must also be assessed. Eligibility remains unproven.              |
| Partition one logical document across physical native documents                                                           | Could isolate independent payload publication.                                                                                             | Introduces a transaction/publication/replication and recovery coordinator. Neither current adapter has native atomic cross-document publication. The design must preserve all-or-none mixed Contributions and exact retained state; this is substantially broader than a local optimization. |

The [accepted structural representation](../../../docs/STRUCTURAL_CARRIER_MODEL.md#3-accepted-logical-carrier-representation)
requires one logical collaborative document and prohibits independently committed native CRDT universes per Block.
Its [mixed-operation rule](../../../docs/STRUCTURAL_CARRIER_MODEL.md#10-structural-operation-semantics) requires that
document to contain the affected registry and payload namespaces. Physical partitioning is not established as
conforming to that boundary and is not an implementation option under the current unit 10 scope. Pursuing it would
first require a focused authority and planning decision establishing preservation of the single-logical-document atomic
boundary or explicitly revising the contract. Adding a coordinator alone is not evidence of conformance.

Simple rearrangement of flat maps, an external evidence log alone, or a derived text cache does not establish a remedy.
An internal chunk size would be an implementation parameter, not permission to reject valid long text. A fragmentation
cap, destructive rewrite, compaction requirement or changed admission rule would need its own compatibility and capacity
assessment; none is selected here. Changing editor publication scheduling also cannot conceal disqualifying canonical
work or silently redefine the measured interval.

## Current design direction

The [immutable-run representation design](ORDINARY_EDIT_REPRESENTATION_DESIGN.md) develops the selected public-API
strategy while retaining one native document per candidate. It explicitly owns a carrier-private sequence protocol;
simple chunking does not automatically inherit native text convergence or bounded-work behavior. The design specifies
content-committed source/deletion records, closed command manifests and causal readiness roots, derived indexing,
native publication and conflict-union rules, persisted qualification split/merge mappings, History/Range compatibility,
separate implementation entry checks and rejection conditions.

The design remains unimplemented and unqualified. Its planning merge approves that qualification work, not unit 10
closure. If neither native route can satisfy the required invariants, implementation must return to planning rather
than adopt a fork, fallback, resource cap or alternative sequence protocol without a new decision.

## Qualification obligations after a design is accepted

Retain the existing negative probes and compare the new path against the same logical fixtures. Exercise native and
adapter work independently across unrelated structure, text/opaque contents, Origin fragmentation, prior edits,
liveness/effect evidence and target size. Include adversarial repeated edits and fragmentation; small elapsed time or
the absence of existing adapter counters is insufficient to prove native work is localized. Explain instrumented sites,
version dependence and blind spots, including Node/browser differences.

Check exact text and Origin against independent expectations; native-string success must remain exact and unsupported
operations must refuse atomically. Cover mixed multi-payload changes, stale receipts and expected failure injection,
concurrent/duplicate/reordered/delayed delivery, encode/reopen, retained restore, replacement, positions and following
edits. Preserve the existing anchored editor, clipboard, IME-event and undo/redo obligations where the design affects
them. Use qualification surrogates for future History, persistence and Range contracts rather than implementing those
subsystems early.

Record transition/recovery work separately from ordinary work, with source, profile, environment, package versions,
raw completion/failure evidence and durable findings. Use the unit 9 workload record where its unchanged scope permits;
it cannot verify a new representation. Complete required repository checks and fresh qualification for the actual
implementation before calling unit 10 eligible. Final common-revision comparison and carrier/allocator/policy selection
remain units 11 and 12.
