# Admission and boundary qualification results

The [profile](ADMISSION_BOUNDARY_PROFILE.md) defines these qualification-only probes and their limits. The
[raw samples](evidence/admission-boundary/raw.json) record a complete run on Node 24.19.0, Linux x64 and the pinned
Yjs 13.6.32 and Automerge 3.4.1 dependencies. The source was local commit
`c1844bd7c7b65dabce135b35477bf05fc567d49b`, with the same tree as PR 50 head
`af9b6c2f1da1c942d49050d656057444eae86cdf`, plus this exact
[Origin-oracle patch](evidence/admission-boundary/origin-oracle.patch), SHA-256
`06ba3271afea6cc831f6624b6c4a34d79697b903f5129114bd83c3b67649ef0b`. The result files were added after this run.
Apply the patch to that head to reproduce the measured source. This is one shared host and three measured samples per
shape, not a product limit or estimate of tail behavior.

## Admission and refusal

Both candidates completed the 216 measured samples with fixture-derived Origin and payload checks and successful
reload. In the
65,536-unit, eight-Origin, eight-replacement transaction, median publication was 1.79 ms for Yjs text and 0.47 ms
for Yjs opaque, versus 617.82 ms for Automerge text and 1,828.64 ms for Automerge opaque. Median encoding was
0.39 / 0.15 ms for Yjs text / opaque and 5.72 / 8.41 ms for Automerge. These measurements use one repeated-byte
pattern and repeated replacements in a single transaction; they neither isolate native allocations nor measure peak
memory. Raw samples include every other tested size and fragmentation level, with separately timed copying and
decode. Actual maximum support is not established.

A second paired workload inserts and deletes Unicode and Markdown-like text. For the largest, eight-Origin,
eight-operation shape, median insertion / deletion was 10.90 / 6.71 ms for Yjs and 91.75 / 1,175.04 ms for Automerge.
Each interval applies all eight operations in one transaction; the sizes, inputs and timing boundaries are in the
profile and raw samples.

The fixed, adaptive and operation-specific candidate functions each refused the fixture text and opaque requests before
publication on both carriers, with unchanged semantic state, encoded bytes and effect records. Their values and cost
models are illustrative. The normal-runtime option published the requests on fresh carriers and checked their
results; no allocation failure was forced and this cannot establish safe failure under resource exhaustion. A text
and an opaque replacement from one
genesis converged in both delivery orders and survived reload; the complete winning payload matched one branch and its
kind is recorded in the raw evidence. This is a bounded scenario, not a policy choice or comprehensive concurrency
proof.

## Clipboard and retained sources

Both carriers validated same-document private fragments against actual materialized retained history before and after
reload. A missing source omitted the copy derivation while preserving Origins that matched the target catalog.
A reference to retained history with different content also omitted the derivation. The lookup is scoped to a chosen
InlineContent and establishes matching attributed content exists; it does not authenticate the actual source. A
separate copy from another InlineContent containing equal attributed text is also accepted by this matching callback,
demonstrating the ambiguity. Missing private data, malformed JSON, wrong version, cross-document data, missing source
reference, empty span, unknown Origin and text mismatch used plain fallback with imported Origin. Each
encoded-length, span-count and
text-length guard independently fell back, including two-Origin fragments before retained lookup. Existing clipboard
tests additionally exercise guard boundaries and self-contained fragments. The fallback is a parser result; this
probe does not measure an OS clipboard or publication
of a paste.

For a 32-unit fragment crossing one of eight Origin runs in reloaded history, the median decode and source lookup was
0.37 / 2.27 ms for Yjs and 0.05 / 1.69 ms for Automerge at 1,024 / 65,536 retained text units respectively. The
fixture searches repeated text and may inspect multiple matching offsets before matching Origins. It does not prove an
indexed lookup or an upper bound. Other dimensions and individual timings are in the raw record.

## Media and malformed state

For both payload adapters the representative UTF-8 profile round-tripped valid Unicode exactly and opaque media
round-tripped bytes; invalid UTF-8, an unsupported text profile and an invalid Media Type explicitly failed before
mutation. Invalid integrated positions and malformed carrier bytes also failed with unchanged state and effect records.
The existing `payload/carrier.test.ts` covers lone-surrogate exact preservation or atomic rejection, non-exact codec
conversion, malformed Origins and other Media Types. Existing `integrated/ordinaryEdit.test.ts` tests malformed retained
ownership and Origin data after load, merge and restore, and checks no publication after rejection. Its later decoder
failure test checks encoded state and effects after ordinary edits, restore and failed merge; it does not establish
atomicity for every possible malformed serialized representation. These are
qualification fixtures, not a selected production media parser.

No out-of-memory failure was induced. More payload distributions, malformed representations, realistic OS clipboard
and device-level resource limits remain unmeasured; they must not be inferred from these bounded observations. Gate B
owns policy and carrier selection, and the final Merge 8 comparison must integrate this evidence with the other
profiles.
