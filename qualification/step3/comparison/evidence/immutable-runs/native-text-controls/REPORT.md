# Native text diagnostic controls

These controls use Automerge 3.4.1 native text and Yjs 13.6.32 `Y.Text` directly, seeded with exactly 1024 ASCII `a`
characters.
Each measured edit has its own Automerge change or Yjs transaction, with no application snapshots or undo stack.
Alternating edits insert `x` at offset 1 and then delete `[1,2)`, matching the carrier diagnostic's visible text edits.
Consecutive typing inserts one cyclic lowercase ASCII character at moving offset `1+i` per edit.
All eight sequential fresh-process workers exited zero, with empty stderr.

| Workload           | Engine    | Edits | Edit total ms | Edit median ms | Save ms | Load ms | Encoded B | Post-edit RSS MiB | Post-edit JS heap used MiB |
| ------------------ | --------- | ----: | ------------: | -------------: | ------: | ------: | --------: | ----------------: | -------------------------: |
| Alternating        | Automerge |   500 |        93.021 |       0.101011 |   3.265 |  19.302 |       236 |             66.92 |                       7.51 |
| Alternating        | Automerge |  5000 |       567.804 |       0.056903 |   4.081 |  40.066 |       245 |             73.12 |                       7.03 |
| Alternating        | Y.Text    |   500 |        17.858 |       0.013338 |   1.203 |   1.587 |      1055 |             46.14 |                      10.40 |
| Alternating        | Y.Text    |  5000 |        43.295 |       0.003547 |   1.247 |   1.630 |      1055 |             57.73 |                      12.89 |
| Consecutive typing | Automerge |   500 |       168.254 |       0.197270 |   2.802 |  18.846 |       249 |             69.59 |                       7.71 |
| Consecutive typing | Automerge |  5000 |       672.116 |       0.085981 |   3.649 |  55.544 |       288 |             71.73 |                       7.57 |
| Consecutive typing | Y.Text    |   500 |        21.893 |       0.015487 |   2.605 |   3.384 |      1549 |             46.41 |                      10.50 |
| Consecutive typing | Y.Text    |  5000 |        43.079 |       0.003264 |   1.869 |   2.101 |      6049 |             53.34 |                      13.45 |

All cases passed exact final text, exact reloaded text, independently identified same-gap concurrent branches merged in
both directions,
propagation of a following edit in both directions, and another exact save/load check.
The deterministic Automerge actors produced same-gap order `RL`; the deterministic Yjs clients produced `LR`.
Both full strings were checked against the two permitted exact merge outcomes.
Alternating ends at 1024 characters; typing ends at 1524 or 6024 characters.

## Measurement scope and semantic differences

Each cell is one Node diagnostic observation, not a browser benchmark, performance guarantee or eligibility result.
The runs used an exclusive sequential measurement window with bounded small smoke work elsewhere, unlike the historical
shared-resource carrier runs.
Node was v24.19.0, V8 was 13.6.233.17-node.51, execArgv was empty and NODE_OPTIONS was absent.
The default V8 heap limit was 2,348,810,240 bytes; there was no heap increase, explicit GC, tracing or heap snapshot.
The [raw manifest](manifest.json.txt) records the host, complete package-owned file hashes, Node executable hash,
lockfile hash, source hashes and commands.
The [post-run verification](post-run-binding-verification.json.txt) confirms unchanged package file sets/hashes, runtime
executable, lockfile and measured scripts.

Individual edit samples time the native call; edit totals also include loop sampling and periodic progress output.
Save/load time the native API calls, excluding file I/O and subsequent content assertions.
Memory is process-wide and not normalized by explicit GC; JS heap, external memory, array buffers, RSS and maxRSS are
separately preserved in raw results.
Array buffers are part of external accounting and must not be added again.
The table reports memory immediately after edits and before save/load, without interpreting it as isolated retained
native or index size.

The original document remains alive during load. Forked replicas and additional loaded states are then retained during
the separate concurrency verification.
This topology differs from the full carrier's existing setup carrier, lifecycle reload, capture/materialize/restore and
peer-edit/merge overlap.
The native controls omit immutable command records, closed record/command provenance validation, per-character Origin
attribution, structural placements,
source indexes, captured-material retention and the complete History/editor lifecycle.
They therefore do not explain the full carrier's memory gap or satisfy those semantic gates.

Yjs uses its default `gc: true` and V1 `encodeStateAsUpdate` encoding.
Its current-text convergence and reload checks do not preserve or prove Automerge-equivalent historical deleted-content
semantics.
The seed and cyclic `a..z` typing fixture have low entropy; Automerge uses one actor and constant change time zero.
These conditions aid compression, so the encoded sizes do not predict varied text, timestamps, actors or application
command metadata.
Consecutive typing models a moving caret, without natural-language prose, think time, observers, UI rendering or undo.
The controls do not establish full Origin/history eligibility, carrier selection or completion of the preserved failed
carrier lifecycle.

## Independent saved-byte Automerge history check

The [separate verifier](verify-automerge-history.mjs.txt) reads the original saved `.bin` files, checks their hashes
against measured results,
reloads them, calls `A.getAllChanges`, and checks `edits+1` changes with contiguous sequence numbers from a single
actor.
It compares complete historical strings through `A.view` at seed, first insertion, an intermediate point, final
pre-delete/previous typing and final heads.
All four Automerge cases passed; [raw verification data](automerge-history-verification.json.txt) includes heads and
exact text hashes.
Verifier memory/timing is separate from the measurement table and accumulated across its four checks.

The 245-byte alternating-5000 file recovered 5001 changes, whose individually encoded forms total 531002 bytes.
Views after 1, 2499 and 4999 edits reconstructed exactly `ax` followed by 1023 `a` characters, including deleted content
after save/load.
The small full-document encoding therefore does not result from batching edits or dropping the measured native Automerge
changes.
The 500-edit file recovered 501 changes totaling 54002 individually encoded bytes.
Typing recovered 501/5001 changes totaling 53001/521001 individually encoded bytes.
These checks do not add the application's Origin, structural or captured-history semantics to either native control.

## Evidence and reproduction

The [package index](package-manifest.json) binds every copied artifact to its original scratch path, exact SHA-256 and
byte size.
Raw JSON is preserved with `.json.txt` suffixes and exact executed scripts with `.mjs.txt` suffixes, preventing
formatter changes to measured source/results.
Raw per-case logs, complete per-edit timings, process memory stages, success checks and empty stderr logs are included
unchanged.
Encoded binaries are excluded from this repository checkpoint; their exact sizes and hashes remain in the measurement
manifest and individual results.
The independent verifier ran against those original saved binaries in scratch before packaging.

To reproduce in the original environment, use the exact scripts under their original filenames:

```sh
cd /workspace/work/merge10-native-controls
node runner.mjs results
node verify-automerge-history.mjs
```

Scripts import installed dependencies from `/workspace/coedit/node_modules`; no install, runtime source edit or remote
operation was used.
For a relocated checkpoint, restore `.mjs.txt` files to `.mjs`, supply the same installed packages at the recorded paths
and retain the manifest for comparison.
Changing dependency paths or scripts requires new source bindings and a new measurement.
The native control manifests bind their scripts and installed dependencies, not the full application carrier source or
all repository qualification checks.
