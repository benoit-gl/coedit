# Raw transaction and transport batching observations

The [archive manifest](archive-manifest.json) binds the exact measured scripts, all 108 raw rows,
source/native manifests, fixtures, summaries and public-source attribution. Archived files have a `.txt`
suffix solely to preserve exact measured bytes. Four upstream files with trailing blank lines are stored as
lossless base64 text: `ABOUT-DATA.md`, `LICENSE`, upstream `README.md` and `edit-by-index-baseline.js`.
The manifest records their encoding and archived hash/size separately from original hash/size; unpack decodes
and verifies the exact original bytes. This avoids added-blank-EOF whitespace errors without normalizing sources.
No runtime source changed. All result rows explicitly say
`normalFactoryValidated: false`.

## Workloads and observations

Installed Automerge 3.4.1 ran two 500-logical-edit workloads: 250 alternating same-gap insertion/deletion
pairs returning `seed` to `seed`, and the first 500 tuples of the public trace, from empty text
(487 insertions, 13 deletions, final length 474). Each ran three rotated repetitions of native text and a
simplified one-JSON-marker-per-edit trie, with transactions of 1/5/20 logical edits and transport envelopes
of 1/5/20 native changes. Both flush at synthetic episode boundaries every 100 logical edits and at completion.
Hash-derived IDs, actors, Origin labels and history-group metadata are synthetic controls.

| Workload / storage          | Sender median μs/logical edit, transaction 1 / 5 / 20 | Raw change bytes/logical edit, transaction 1 / 5 / 20 |
| --------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| Alternating / native text   | 67.97 / 43.47 / 20.66                                 | 136.83 / 62.81 / 47.51                                |
| Alternating / marker trie   | 4147.45 / 3529.72 / 3452.86                           | 565.30 / 491.97 / 477.70                              |
| Public prefix / native text | 70.03 / 38.61 / 32.70                                 | 134.51 / 56.58 / 41.39                                |
| Public prefix / marker trie | 3572.13 / 3615.10 / 3209.95                           | 567.77 / 494.41 / 480.18                              |

Sender change counts are 500/100/25. Transport-only comparisons retain the identical sender change-list and
head digest while grouping receiver calls. At one logical edit per change, native receiver median μs/edit
for envelopes 1/5/20 were 103.02/45.38/32.15 for alternating and 167.89/51.01/19.52 for the public prefix.
Transport preserves raw change bytes; modeled framing adds four bytes per envelope plus four per change.
[The complete summary](archive/SUMMARY.md.txt) retains ranges, custom receiver results and save sizes.

All cases checked exact ordered logical IDs, state at every episode boundary, final text, synthetic custom
metadata, sender/receiver native heads and save/load replay. Source hashes were checked before and after
measurement. These are raw-native checks; they do not establish production admission or full-carrier semantics.

## Semantic and timing scope

Transaction grouping retains each logical ID but removes intermediate native heads and changes atomicity.
Transport aggregation retains each sender change and its dependencies but changes receiver-call granularity
and when intermediate states become visible. Its unit is native changes per envelope, not logical edits;
raw rows give actual logical edits per packet. Logical coalescing, which changes the edit stream, is separate.
The current immutable-run carrier rejects multiple semantic roots in one native change; this scratch loop
cannot be enabled by wrapping existing production commands in one transaction.

A production experiment must flush at actor/Origin changes, remote receipt and causal cuts, branch/rebase,
explicit capture, undo/redo or history closure, required structural/clipboard observations, and episode end.
Captures need a real intermediate head; native-change undo has a different unit after transaction grouping.
Independent logical undo and restored Origin would require actual validation. IME action boundaries must also
remain explicit. This fixture does not exercise those events, concurrent schedules or intermediate observers;
its synthetic groups do not establish original user intent or history boundaries. The custom marker storage
omits production command manifests, descriptors, provenance admission, indexes, Origin, undo and capture logic.
Native text and the synthetic record layout store different semantic information, so cross-layout ratios are
storage-mechanics observations rather than an equivalent full-carrier comparison.

Sender intervals sum `A.change`, including draft mutation; receiver intervals sum `A.applyChanges`.
Every time/byte denominator is the same 500 original logical edits. Sender results reused across transport
conditions are three observations, not nine. Preparation, checks, source hashing, load/save, admission,
derived replay, framing serialization, network/sync, UI processing and batch-fill waiting are excluded.
Only 40 unrelated native-text edits warmed up the process. Three samples and large warm-up/order variation
limit timing conclusions: alternating native transaction-5 ranged 31.21–1231.23 μs/edit, and the custom public
transaction-5 median exceeded transaction-1. These observations establish no stable speed ratio, growth bound,
carrier ranking, mandatory eligibility or production readiness.

## Public source and attribution

Source: [Automerge contributors' automerge-perf](https://github.com/automerge/automerge-perf), pinned commit
`da212e984c777d31ee7d888f82637288aa4c61d3`,
[edit-by-index/editing-trace.js](https://github.com/automerge/automerge-perf/blob/da212e984c777d31ee7d888f82637288aa4c61d3/edit-by-index/editing-trace.js).
Attribution also credits Martin Kleppmann and Alastair R. Beresford's authorship trace of
[A Conflict-Free Replicated JSON Datatype](https://doi.org/10.1109/TPDS.2017.2697382).
Upstream offers all trace material under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
The [full license (base64)](archive/source/LICENSE.txt), [upstream README (base64)](archive/source/README.md.txt),
[attribution notice](archive/source/ATTRIBUTION.md.txt) and [source receipt](archive/source/provenance.json.txt)
are retained, including upstream's discussion of paper-versus-trace rights and warranty disclaimers.

The full acquired source was 4,579,942 bytes, SHA-256
`23116070719243e2950c310006dd50b3d80744be7542a86c62e7d5c2ed7326d0`, Git blob SHA-1
`aadf32adf98fc4ef318dbf6a8e7aeddb9dbf1030`. GitHub metadata/docs reads succeeded, but its file fetch rejected
the size; a bounded HTTPS read of the same pinned raw URL succeeded. The full source is omitted here.
[The retained original prefix](archive/source/editing-trace-prefix500.json.txt) contains tuples 0–499 without
position/character changes. Local metadata and boundaries were added as disclosed above. The upstream trace is
real authorship-derived but already linearized, omitting cursor movement, original timing and concurrency;
original Origin/undo/capture semantics cannot be inferred. No full-trace native replay was performed.

## Offline verification and optional reproduction

Run from the repository, choosing a nonexistent output directory:

```sh
python qualification/step3/comparison/evidence/immutable-runs/batching-study/unpack.py.txt /tmp/batching-evidence-review
```

This checks all archived hashes, decodes the four base64-wrapped sources, restores exact original bytes/filenames
and runs the exact packaged offline verifier
using only Node standard modules. It reconstructs both fixtures, validates 108 rows, source-worker/fixture
hashes, arithmetic/units and sender identity across transport conditions. It verifies retained observations,
not an independent native replay; actual native blobs were not retained. The omitted full-source hash cannot
be recomputed from the prefix, and offline verification does not require it or any network access.

The restored README documents a separate syntax-checked optional wrapper for a fresh native rerun with an
already installed local Automerge dependency. It derives a new runner from the exact archived measured worker,
substituting the bounded prefix and fresh paths; new manifests differ and are not original observations.
That new wrapper was not used for these timings. The exact measured worker SHA-256 is
`fe15fb3425cd52de515a5d93a78c401671b3e53ea32c0fccf42f89d3dbb49045`.
The original package manifest SHA-256 is
`3af9aa2609d8f68e6ea48e341db3224bbfee6f1e429a1030eb30b6d2c70e757c`.
