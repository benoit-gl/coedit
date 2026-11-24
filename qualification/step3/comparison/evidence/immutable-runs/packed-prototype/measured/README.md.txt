# Immutable record packing scratch experiment

Completed bounded prototype, not a full carrier or production layout. All work stays outside `/workspace/coedit`; no tracked edits or remote actions.

The primary layout stores each existing command's canonical records in one immutable native Automerge byte-array scalar, addressed by SHA256. The byte scalar is canonical JSON of the exact existing tuples; records keep their separate UUIDs, commitments, effect/batch IDs, origins, source anchors and logical Refs. Logical Refs never encode physical locations. A derived UUID-to-unit/slot cache supports physical `resolve(ref)` reads. No command waits for another command, and no previously published unit is extended or replaced. A command with more than 64 records would use multiple immutable units in its one transaction.

Three controls receive the **same fixture records in the same command order**: existing 32-level UUID trie; one scalar unit per record; packed units per command. The scalar control isolates packing from removing the UUID trie. Both scalar layouts use the same flat native map, so their growing map width is an unresolved scaling cost.

`history500.json` contains genuine current-carrier records for a 1024-character ASCII seed, 500 alternating insert `x` at offset 1 / delete [1,2] commands, human Origin `o0`, actor `packed-author`, and separate stable `edit-0` through `edit-499` effect IDs. UUIDs are freshly authored and differ from other experiment fixtures. Original full carrier bytes are retained alongside the fixture. Grouping is proved against exact authored manifest member Refs, batch/effect IDs and unique total coverage, rather than inferred from sort order. All three storage workers use exactly these same record/body bytes.

| H500 storage primitive | UUID trie | Scalar per record | Command pack |
| --- | ---: | ---: | ---: |
| Logical records | 3,511 | 3,511 | 3,511 |
| Physical record units | 3,511 | 3,511 | 502 |
| Native changes including primitive bootstrap | 503 | 503 | 503 |
| Native operations | 107,924 | 3,514 | 505 |
| Native maps created | 104,335 | 1 | 1 |
| Last command native operations | 212 | 7 | 1 |
| Encoded bytes | 648,404 | 584,576 | 316,327 |
| Build post-GC heapUsed delta, bytes | 87,441,800 | 8,756,864 | 6,041,824 |
| Build post-GC RSS delta, bytes | 201,711,616 | 60,420,096 | 53,010,432 |

Each H500 point is one independent Node process with the unchanged default heap limit (2,348,810,240 bytes). Process memory is a baseline-adjusted explicit-GC diagnostic, not retained-object or WASM allocation attribution. Baselines include the same detached fixture records and loaded module runtime. Packed workers additionally retain native-head receipts. Same-process reopen verification succeeded for each worker; this table contains **no fresh-process H500 load-memory result**. The original trie build briefly overlapped the small 12-case correctness rerun; no timing or latency conclusion is claimed. Build/reopen durations and append samples are retained for diagnosis only.

All 501 non-genesis historical text/Origin projections pass independent protocol reference validation after reopen. Every canonical entry and Ref is retained. Packed variants physically resolve every Ref and retain 502 native-head receipts; five sampled historical native views have exact expected prefix record sets. `transaction-audit-h500.json` independently uses supported public decoded-history APIs without importing the prototype: all 502 command groups in every layout contain their exact original record set in a separate, linear native change. The audit proves records were not combined across commands or history truncated by this implementation.

`correctness16-v2.json` records 12 correctness cases, including actual concurrent scalar conflicts, disjoint/identical union, exact Unicode and distinct-Origin historical projections, idempotence, atomic equivocation rejection, foreign lineage, and hostile native deletions/metadata/map/content changes. Public Automerge treats identical-byte reassignment as a no-op; the test accepts that no-op. `packed-store.mjs` scans all scalar conflict alternatives and validates immutable-unit history on explicit load/merge. This concerns the supplied history; it does not prove native author authenticity or identify a forged reconstructed history.

Limitations: this is a record-storage primitive. It does not integrate `nativeDocument` semantic-root publication, descriptor/ownership metadata, full closed-command native provenance, retained carrier capture tokens, restoration, migration, or the existing carrier qualification suite. Cold load scans every unit and history, while warm logical resolution uses a derived cache and decodes the selected bounded pack. Large source or metadata records can still make a pack large in bytes; the 64-record cap is not a byte cap. Flat-map publication scaling, cold overlap memory, worker failure handling in an application, unrelated native history, concurrency under full carrier authorization and larger histories remain unqualified. No production eligibility claim follows from the storage-only savings.

The earlier H4/H16 smoke fixture uses Unicode and distinct Origins and is not the matched ASCII H500 workload. Its complete original harness is preserved under `v1/` because physical Ref resolution was added after those initial measurements. H500 uses the final implementation. Source snapshot, native runtime and harness hashes are preserved. The native version is Automerge 3.4.1.

Reproduction (use fresh output paths because writes are exclusive):

```sh
node build-history500.mjs /tmp/packed-history500-new.json
node correctness.mjs history16.json /tmp/packed-correctness-new.json
node --expose-gc measure500-worker.mjs trie history500.json /tmp/packed-trie-new.am
node --expose-gc measure500-worker.mjs unit1 history500.json /tmp/packed-unit1-new.am
node --expose-gc measure500-worker.mjs commandPack history500.json /tmp/packed-command-new.am
```

`run-h500.py` contains the exact sequential commands used; `measurements-h500.jsonl` retains their output and commands. Reusing the runner's output names intentionally fails. `verify500-transactions.mjs` audits the preserved H500 encodings at the fixed scratch location. `source-binding.json`, `native-runtime-binding.json`, `v1-harness-manifest.json` and `artifacts-manifest.json` bind source and evidence bytes.
