# Packed immutable record storage prototype

This checkpoint preserves a bounded **storage-only** comparison, its independent review and later correctness fixes.
It does not implement a full packed document carrier or qualify a production layout.
The source snapshot is revision `7618ee8939f305260a3d2a54b30a482093826fe4`, bound by
[64 source hashes](measured/source-binding.json.txt), Automerge 3.4.1 and installed native runtime hashes.
The [package manifest](package-manifest.json) binds every packaged file.

## Exact input and physical representation

All three H500 controls receive the **same exact 3,511 canonical records**, UUIDs, Refs and command order.
The input is a genuine public-carrier history: 1024 ASCII `a` characters, then 500 separate alternating
insert `x` at offset 1 / delete [1,2] commands, with human Origin `o0`.
There are 502 groups: genesis (1 record), seed (10), then 500 edits (7 each).
Record kinds are 502 manifests, 1,003 live records, 501 each contexts/envelopes/payload effects,
252 runs, 250 erases and one generation. No final-visible-only filtering occurs.
The [input manifest](inputs-manifest.json) records byte hashes, semantic hashes, counts and omitted native encodings.
Exact detached tapes are included losslessly as gzip/base64 text, split below 400 KB per file.

The packed layout stores canonical JSON arrays of original record tuples in immutable native byte scalars.
Unit keys commit their bytes with SHA256; UUID sorting gives deterministic slots.
Logical Refs remain record UUID plus commitment. A cold-derived UUID-to-unit/slot cache is included in measured state.
One append call is one original command and one native transaction; no command waits for a future pack.
The cap is 64 records per unit, with no byte-size cap. There is no mutable open pack.
The scalar-per-record control isolates packing from removal of the existing 32-level UUID trie.

| H500 storage primitive           | Original trie | Scalar per record | Command pack |
| -------------------------------- | ------------: | ----------------: | -----------: |
| Logical records                  |         3,511 |             3,511 |        3,511 |
| Physical record units            |         3,511 |             3,511 |          502 |
| Native changes                   |           503 |               503 |          503 |
| Native operations                |       107,924 |             3,514 |          505 |
| Native maps created              |       104,335 |                 1 |            1 |
| Last command operations          |           212 |                 7 |            1 |
| Encoded bytes                    |       648,404 |           584,576 |      316,327 |
| Post-GC build heapUsed delta (B) |    87,441,800 |         8,756,864 |    6,041,824 |
| Post-GC build RSS delta (B)      |   201,711,616 |        60,420,096 |   53,010,432 |

The [derived summary](h500-summary.json) links these values to the
[complete raw journal](measured/measurements-h500.jsonl).
Each primitive has its own bootstrap plus 502 original command changes.
The original full carrier has 502 native changes because genesis shares its bootstrap transaction.
This shared replay difference does not drop an original command.

## Measurements and their limits

These are single observations, run sequentially in fixed trie / scalar / packed order, under Node v24.19.0
with the default 2,348,810,240-byte heap limit and explicit GC.
Memory is incremental post-GC **build retention**, measured after parsing and decoding the entire detached tape.
The baseline already retains that tape. Representation caches and instrumentation are included;
packed controls additionally retain 502 native-head receipt arrays.
Process heap/RSS deltas do not attribute retained objects, native/WASM allocations or application memory.
The trie run briefly overlapped the small correctness rerun.

H500 same-process reopen checks succeeded, with raw document and decoded history still live.
They are verification diagnostics: **fresh-process H500 load-memory evidence is absent**.
There is no isolated H500 cold-load or two-carrier overlap/release result.
Build/append/reopen timings include instrumentation and do not establish latency distributions or controlled speedups.
The older H4/H16 fresh-process load results are a separate small Unicode experiment, with different code bytes.
H16 has 18 groups and 122 records: genesis 1, seed 9 and sixteen 7-record edits.

## Correctness, transaction audit and review

The [independent transaction audit](measured/transaction-audit-h500.json.txt) and its
[executed script](measured/verify500-transactions.mjs.txt) check all 502 exact command groups in all controls.
Each original group remains together in its own linear native change; no commands are combined or history truncated.
All 501 non-genesis historical root text/Origin projections pass independent protocol-reference checks after reopen.
All canonical entries remain equal. Packed controls resolve every exact Ref through actual unit bytes/slots,
retain all 502 native-head receipts and verify five native-prefix record sets.
These protocol checks run outside the measured build interval.

The [H16 current-reader result](measured/correctness16-v2.json.txt) records 12 cases for Unicode/multiple Origins,
old roots, concurrency/conflicts, idempotence, equivocation atomicity and hostile native mutations.
Its malformed-conflict branch checked cold load only despite its broader historical label;
identical-byte native reassignment was an accepted no-op despite the old rejection-oriented name.
The [independent report](review/independent-review.md.txt) discloses both issues and the missing load-width guard.
It independently matched all 3,511 original native record operations to this tape, closing the historical extractor's
unchecked unequal-UUID overwrite caveat for this valid fixture.

Measured H4/H16 code is preserved separately in [v1](v1/packed-store.mjs.txt).
Its resolver returned the accepted-map entry; the H500/current reader decodes actual physical slots.
Original [H4/H16 measurements](measured/measurements.jsonl) must not be reassigned to the newer reader.
All 120 historical artifact hashes, 64 source hashes and five archived v1 harness hashes were verified.

The [post-review fixes](post-review-fix/README.md.txt) **postdate every measurement**.
They validate width 1 or 64 in constructor/create/load/append, rejecting nine invalid values synchronously;
execute malformed-conflict merge rejection with exact accepted-state preservation;
accurately label identical reassignment; and reject unequal UUID bodies during extraction.
The final [focused result](post-review-fix/correctness16-with-extractor.json.txt) has 14 passing cases.
Fixed scripts and their original manifest are separate from measured scripts.
**No performance or memory number in this checkpoint measures the fixed candidate.**

## Remaining qualification boundary

Full-carrier closed-command provenance, accepted-base/native dependency authorization, semantic-root publication,
descriptor/ownership metadata, retained capture tokens, restoration/migration and full existing carrier tests are absent.
History validation checks supplied immutable storage history; it does not authenticate authors or detect reconstructed history.
Concurrent storage branches are not qualified concurrent full-carrier commands.
H500 uses one Origin and regular ASCII history; H16's broader Unicode/Origin checks do not establish complete editor semantics.
Cold loading scans all units and native history, and flat native map width grows with history.
Large-record byte costs, larger-history lifecycle behavior and full-carrier overlap remain unresolved.
No production eligibility, carrier-selection change or overall application memory/latency claim follows.
This checkpoint contains no H5000 result.

## Decode and reproduce

The [archive map](archive-map.json) maps byte-exact `.txt` copies to their original absolute paths.
Remove only the final `.txt` suffix when restoring scripts, JSON and Markdown outside the repository.
Do not run or format the archived text in place.
Restore `measured/` at the original scratch root, `v1/` beneath it and the fixed scripts in `post-review-fix/`.
Restore source files at the bound revision, checking all 64 hashes; install the pinned dependencies and verify native bindings.
Historical scripts contain absolute `/workspace/coedit` dependency and scratch-source paths.
Using another location requires explicitly recorded path adaptation and constitutes a new harness.

Decode exact tapes with these commands from this evidence directory (use new output paths):

```sh
base64 --decode inputs/history16.json.gz.b64 | gzip --decompress > /tmp/history16.json
cat inputs/history500.json.gz.b64.part01 inputs/history500.json.gz.b64.part02 \
  | base64 --decode | gzip --decompress > /tmp/history500.json
sha256sum /tmp/history16.json /tmp/history500.json
```

Check the uncompressed byte SHA256 against `inputs-manifest.json` before use.
The semantic SHA256 is over sorted canonical record keys joined by newline, without a trailing newline.
The exact [H500 runner](measured/run-h500.py.txt) and [small-run runner](measured/run-measurements.py.txt)
retain original commands and exclusive-write output names. Use unused output paths for any new run.
The [fixture builders](measured/build-history500.mjs.txt) can author the same workload with fresh identities;
regeneration does not promise the original UUIDs or bytes. Included tapes preserve the measured identities.
Native `.am` binaries are omitted; hashes and original scratch paths are in the input manifest.
Replaying the exact tape reproduces semantic inputs, but new native actor identities can change encoding bytes and hashes.
The historical transaction audit uses fixed scratch paths and requires the original saved encodings
to recheck exact hashes.
This packaging checkpoint verified hashes/counts/commitments without rerunning benchmarks
or claiming a new correctness run.

Run the read-only package integrity check with `python3 verify-package.py.txt`.
