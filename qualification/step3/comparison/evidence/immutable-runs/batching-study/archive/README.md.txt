# Scratch batching evidence package

This compact package retains the exact 108 raw observation rows and measured worker source for two matched 500-logical-edit studies: synthetic alternating250 insert/delete pairs and a public authorship-derived prefix of 487 insertions plus 13 deletions. There are three rotated repetitions of two storage shapes × transaction sizes 1/5/20 × transport sizes 1/5/20. Full timing/size tables and caveats are in `SUMMARY.md`.

This is evidence of raw Automerge storage/application mechanics. Every result says `normalFactoryValidated:false`. The custom layout is a simplified one-JSON-marker-per-edit trie, not an admitted immutable-run carrier document. No production admission, source-index replay, Origin, undo, capture or concurrent-user semantics is validated. All deterministic actor/Origin/undo metadata and every100-edit boundary are synthetic controls.

## Offline verification

From this directory:

```sh
node scripts/verify.mjs
```

Requires only Node standard modules; uses no network, npm install or native replay. It checks the lossless package file hashes, reconstructs both 500-edit fixtures including exact metadata, checks recorded worker/fixture hashes, parses all 108 complete rows, validates timing/byte denominators and confirms sender head/change digests are constant across each transport-only comparison. It verifies consistency of retained observations, not independent reexecution of the original native intervals. Actual native blobs were not retained in this small package.

`package-manifest.json` hashes every other package file and lists original worker SHA-256. Original manifests are retained byte-for-byte with original absolute source paths and source hashes; those paths are historical provenance. The original full public dataset is omitted. Its pinned source URL, Git blob SHA-1, acquired SHA-256 and size are in `source/provenance.json`; verifying that full-file hash would require the omitted original source. Offline verification needs only `source/editing-trace-prefix500.json` (the exact original first500 splice tuples) and the included derived fixtures.

## Public source and license

Source: [automerge/automerge-perf](https://github.com/automerge/automerge-perf), commit `da212e984c777d31ee7d888f82637288aa4c61d3`, `edit-by-index/editing-trace.js`. Original acquired file: 4,579,942 bytes; SHA-256 `23116070719243e2950c310006dd50b3d80744be7542a86c62e7d5c2ed7326d0`.

Attribution: Automerge contributors; Martin Kleppmann and Alastair R. Beresford, authors of *A Conflict-Free Replicated JSON Datatype*, [doi:10.1109/TPDS.2017.2697382](https://doi.org/10.1109/TPDS.2017.2697382). Upstream makes all trace material available under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). `source/LICENSE` retains the full license; `source/README.md` retains the upstream provenance, attribution and discussion of paper-versus-trace rights. No warranties; see that license. `source/ATTRIBUTION.md` retains the acquisition notice from the original scratch directory; references there to the full local source describe the acquisition directory, not this compact package.

Changes: extracted only tuples 0–499, from an empty initial document; no tuple positions or characters changed. Local fixtures add stable hash-derived IDs and synthetic single-actor/Origin/history/episode metadata. Upstream already flattened original concurrency and omitted cursor moves. This prefix does not establish original actor identities, timing, undo groups or capture observations. No source JavaScript was executed; only its array was parsed as JSON. The complete source 259,778-tuple native workload was not run.

## Optional fresh native replay

The exact measured worker is retained as `scripts/run500.mjs` and has SHA-256 `fe15fb3425cd52de515a5d93a78c401671b3e53ea32c0fccf42f89d3dbb49045`. `scripts/summarize.mjs` is the exact original summary worker. Both preserve their original scratch paths and are archival sources for the original rows.

A separate, unmeasured wrapper supports fresh offline native reruns with a local coedit installation and its already installed Automerge dependency:

```sh
node scripts/replay500.mjs alternating500 /path/to/coedit /fresh/alternating-output
node scripts/replay500.mjs public500 /path/to/coedit /fresh/public-output
```

Each output root must not exist. The wrapper emits `derived-run500.mjs`, changes scratch/runtime roots, substitutes the packaged 500-tuple public prefix for the omitted full source, checks length 500, and labels its output `*-bounded-rerun-v1`. The derived runner and source-prefix hashes in new manifests will differ from original full-source manifests. The wrapper was syntax-checked; no native rerun using this new wrapper was performed while another heavy workload held the shared slot. Existing 108 observations come from the exact original worker, not this wrapper.

## Semantics and measurement limits

Transaction size is logical edits per native change. Transport size is native changes per envelope: it preserves original sender changes, dependencies and IDs, but changes receiver call/visibility granularity. It must not be described as native transaction grouping. Actual logical edits per packet are in raw rows. All packets/transactions flush at synthetic episode boundaries and final completion.

The current production custom protocol rejects multiple semantic roots in one native change, so scratch transaction grouping cannot be enabled by looping existing commands in one `A.change`. Safe production batching requires a separate admitted provenance design and actual boundary/undo/capture checks. Logical edit coalescing is a third experiment because it changes the operation stream.

Sender intervals sum only `A.change` calls including draft mutations; receiver intervals sum only `A.applyChanges`. All reported time and byte ratios use the same 500 original logical edits, never commit/packet counts. Sender numbers repeated across three transport conditions represent the same sender observation, not nine independent repetitions. Checks, preparation, source hashes, load/save, derived indexes, full-carrier validation, UI/event processing, batching wait, actual transport/sync and framing serialization are excluded. Modeled envelope framing is 4 bytes/packet plus 4 bytes/change, without compression.

Only three repetitions, native-text-only warm-up and substantial warm-up/order variation limit latency comparisons. The custom public transaction 5 median is slightly worse than transaction 1. Do not infer a stable speed ratio, growth bound, production eligibility or carrier ranking. Native text and synthetic records store different semantic information; cross-layout ratios are mechanics observations rather than equivalent full-carrier comparisons. The public prefix is short and mostly insertion; the alternating workload has only one fixed edit location and returns to its seed. Neither covers concurrent schedules, remote undo, structural changes or actual capture/restore.

No package file contains the 4.58 MB original trace. Every retained text file is below 400,000 bytes; all files are lossless, uncompressed text. No remote writes or tracked repository edits were made by this study.
