# Bounded heap attribution diagnostic

Fresh fixture-builder, load-only and two-carrier processes ran at history 100 and 500.
All text/Origin checks passed. These are scratch diagnostics, not lifecycle qualification results.
The run manifests bind clean source revision `7926007230e6a7244ad76596bf67bf5334bbaaeb`,
full source hashes, executed worker hash/argv and Node v24.19.0.
Default V8 heap limit was 2,348,810,240 B; workers used `--expose-gc`, two explicit GCs before samples,
and V8 snapshots. No 5000 retry or increased heap limit was used.

## Measurements

Post-GC process heapUsed in the overlap workers, MiB:

| History | Baseline | One carrier | Two carriers | Release A | Release all |
| ------- | -------: | ----------: | -----------: | --------: | ----------: |
| 100     |    29.07 |       46.26 |        60.35 |     45.56 |       30.20 |
| 500     |    29.03 |      105.63 |       175.65 |    104.98 |       32.03 |

Load-only snapshots attribute retained JS bytes as follows. Parent totals include their descendants;
do not add parent and child rows.

| Structure                       | History 100 | History 500 |
| ------------------------------- | ----------: | ----------: |
| Entire carrier                  |  15,650,368 |  74,463,576 |
| NativeProvider total            |   7,890,456 |  37,472,792 |
| Provider command-change map     |   5,529,728 |  26,872,048 |
| Provider namespace-depth map    |   2,123,536 |   9,511,672 |
| Native document records subtree |   5,308,032 |  25,779,944 |
| Protocol total                  |   1,159,384 |   5,681,280 |
| Selected source-index map       |     205,240 |     322,864 |

At 500, 3511 immutable records expand into 104,314 namespace object IDs and 108,797 decoded operations
retained in 501 command changes. The command-change map, namespace-depth map and native records subtree
have disjoint dominated descendants and comprise about 83.5% of the carrier's dominated bytes.
The native wrapper and provider share one native document; activation and provider also share the protocol.
Canonical strings and other shared references require dominator-aware accounting.

Snapshots confirm one, two, then one carrier/provider/protocol/source index after releasing A;
B retains its snapshot object ID. This establishes disposal in this bounded topology.
It does not establish absence of leaks on other paths. High RSS after release is distinct from live JS bytes.
The 500 overlap peak RSS with snapshots was 1,117,780 KiB; snapshot overhead affects this figure.

## Binding, reproducibility and limits

The executed worker source is preserved byte-for-byte as `fixture-worker.mjs.txt`; its hash appears
in every run manifest. `analyze-snapshot.mjs.txt` preserves the final dominator analyzer.
`manifest.json` binds these files and the copied evidence. `attribution.json` contains exact retained sizes,
counts, overlap topology, verification results and hashes for eight snapshots retained in scratch only.
Fixture `.bin.json` files bind fixture bytes, expected material and build commands; binary fixtures are scratch only.
Measurement JSONL is copied unchanged; copied JSON manifests receive whitespace formatting only.
The artifact manifest records original and copied hashes. No snapshots are included here.

The worker read only `dependencies` for `nativePin`; Automerge is in `devDependencies`, so that property
was omitted from its JSON. Exact package/lock hashes were already bound. The separately identified
`runtime-binding-supplement.json` records declared and installed version 3.4.1 and installed package hash.
Scratch originals and executed source were preserved without retroactive correction.

The analyzer sums V8 shallow sizes over strong-edge dominated subtrees, excluding weak edges.
It follows exported V8 ephemeron edges and excludes native/WASM linear-memory allocation.
Independent node-removal reachability matched all four tested H100 and eight H500-two retained-size checks.
Historical analyzer outputs preceded additional reporting fields; the final analyzer preserves the same computation.

This isolates fixture construction from loading and deliberately tests carrier coexistence and release.
It omits warm edits, capture, restore and peer merge from the source qualification harness.
It identifies measured memory contributors, not the exact failing phase or root cause of the preserved
5000 failure, and does not establish 5000 scaling, mandatory eligibility or carrier selection.
GC and snapshots are invasive; elapsed durations are not controlled performance evidence.
