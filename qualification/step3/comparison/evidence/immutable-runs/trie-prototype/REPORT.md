# Bounded two-digit record trie prototype

## Disposition and source binding

This is exploratory scratch storage evidence, not an implementation proposal, production-readiness claim,
mandatory eligibility result or carrier selection. No production source is changed by this package.
The variants copy clean revision `4e0857f1619cd4b32e515a458455fb6434f147fb`;
[source-binding.json](source-binding.json) records the exact historical inputs.
[prototype.patch](prototype.patch) constructs the candidate in an isolated copy. Only runtime
`nativeDocument.ts` and `nativeRecordStore.ts` differ between the 89-entry variant runtime manifests:
[old](old-manifest.json) and [two-digit](chunk2-manifest.json).
Automerge is pinned to 3.4.1. Both variants bind the same native JavaScript and Node-bound WASM bytes;
the WASM SHA256 is `304ea6e230898ed66af3c29ac554a36c15bbe03f5c8816b5310fddb88f7f5d78`.

The candidate retains all 32 UUID hex digits as sixteen exact two-character map keys, with explicit new private
full-document and primitive layout markers. Old layouts are rejected rather than reinterpreted.
Traversal and command authorization retain hex-character depths, inspect losing conflict alternatives,
require lowercase two-character hex prefixes and enforce exact UUID/path agreement.
Mutation uses supported public Automerge APIs, without backend patches.

## Deterministic primitive comparison

[comparisons-v1.jsonl](comparisons-v1.jsonl) records 36 completed sequential workers: 18 builds and 18 fresh loads.
Real canonical `commitRecordV1` entries use deterministic SHA256-derived UUIDs with version/variant preserved.
Every expected canonical entry list passed; semantic-key digests agree across layouts for all nine cases.
Each fixture uses a separate random native actor/lineage, so its encoded bytes are not identical input.
The table reports prefix maps after insertion and encoded bytes before insertion.

| Distribution / records  | Prefix maps old → two-digit | Root width | Insertion native ops |   Encoded bytes |
| ----------------------- | --------------------------: | ---------: | -------------------: | --------------: |
| uniform / 16            |                   536 → 272 |     9 → 16 |              32 → 17 |   2,974 → 2,463 |
| uniform / 64            |               2,020 → 1,030 |    16 → 54 |              32 → 17 |  10,415 → 8,083 |
| uniform / 256           |               7,872 → 4,010 |   16 → 155 |              30 → 16 | 41,487 → 32,054 |
| shared first byte / 16  |                   502 → 254 |      1 → 1 |              31 → 16 |   2,880 → 2,400 |
| shared first byte / 64  |                 1,890 → 964 |      1 → 1 |              30 → 16 |   9,967 → 7,830 |
| shared first byte / 256 |               7,371 → 3,763 |      1 → 1 |              29 → 15 | 39,616 → 30,863 |
| concentrated tail / 16  |                     50 → 33 |      1 → 1 |                2 → 2 |   1,243 → 1,220 |
| concentrated tail / 64  |                    101 → 81 |      1 → 1 |                2 → 2 |   3,485 → 3,492 |
| concentrated tail / 256 |                   306 → 274 |      1 → 1 |                2 → 2 | 12,522 → 12,678 |

Wider fanout has a real adverse case: concentrated-tail256 gains no insertion-op reduction, increases encoding,
and increases fresh-load baseline-adjusted post-GC heapUsed from 647,496 to 799,064 B.
Uniform256 falls from 2,766,928 to 2,525,824 B. These process deltas do not establish a general memory win,
retained-size attribution or native allocation counts. Each point is a single explicit-GC diagnostic worker,
without repeats or uncertainty estimates. Node is v24.19.0 and the default V8 heap limit is 2,348,810,240 B.
Early workers overlapped a small TypeScript check; recorded times are not controlled latency evidence.

## Native function-call intervals

[native-calls-v2.jsonl](native-calls-v2.jsonl) contains four complete streaming V8 trace intervals around one
real public primitive append, including callback, commit, integration and patch application.
Fixture bytes are hash-checked and canonical cache reconstruction uses `Reflect.construct` following the existing
diagnostic pattern. Fixture construction and fresh-load/application setup are outside the interval.

| Uniform records before insertion | Old calls | Two-digit calls |
| -------------------------------- | --------: | --------------: |
| 16                               |   281,364 |         126,572 |
| 256                              |   284,238 |         136,889 |

Two-digit relative growth is 8.15% versus 1.02% for old over these two points.
The lower counts and larger relative growth are consistent with a width trade-off; two points establish no
asymptotic bound or individual internal algorithm. Trace wall times are not latency measurements.
The V1 trace was terminated before any completed interval; its empty journal/log are retained as an abandoned
attempt, not successful evidence. V2 streams output with blocking stdout to avoid dropping trace lines.

## Actual native-publication diagnostic

The complete [old journal](full-publication-old/results.jsonl) and
[two-digit journal](full-publication-chunk2/results.jsonl) each complete build, measurement and independent
normal carrier factory-load verification at four unrelated commands. The unchanged existing source-bound
native-publication harness builds an ordinary insertion of seven canonical records, changing `seed` to `seXed`.
The full expected snapshots and target payloads match across variants, with exact text/Origin validation.
Each journal's source/native manifest matches its saved variant manifest.

| Counted publication interval              |       Old | Two-digit |
| ----------------------------------------- | --------: | --------: |
| Native function calls                     | 2,270,697 |   994,614 |
| Per-operation native Columns splice calls |       225 |       120 |
| Native object hydration calls             |       218 |       113 |
| Native commit / apply-patches invocations |     1 / 1 |     1 / 1 |

The observed call reduction is 56.20% in this single bounded pair. This is publication-only diagnostic work:
preparation, source-index replay, cold activation, native load/save and verification are excluded.
The measured worker reconstructs state with the existing source-index replay stub; normal-load verification is
independent. Separately generated record UUIDs/native author IDs mean these real-command fixtures do not have
identical deterministic byte/key shapes. The controlled primitive cases supply that separate comparison.
No native memory-event trace was enabled: zero memory-event/load/store fields mean unmeasured memory work.
These counts do not prove whole-edit latency, loaded full-carrier retained memory, H500/H5000 behavior,
complete lifecycle qualification, larger-history scaling or production readiness.

## Correctness and reproduction

Historical [focused tests](chunk2-focused.log) passed 58 tests in six files, including losing-prefix union,
malformed losing branches, provenance/closed commands, equivocation and atomic recovery.
The [added layout tests](chunk2-layout.log) passed seven cases rejecting old layouts, wrong prefix widths,
uppercase/nonhex prefixes and UUID/path disagreement. [Typecheck](chunk2-typecheck-final.log) passed after
restoring the existing browser-reference JSON fixture omitted from the initial source-only copy.
These are historical prototype checks, not checks of a released layout.

The [package manifest](manifest.json) hashes every packaged file except itself, records omitted binary fixtures,
and distinguishes copied raw text from the new preparation wrapper/report.
The [original harness manifest](experiment-harness-manifest.json) binds the executed scripts, preserved as `.txt`.
`prototype.patch` has trailing line whitespace removed, and two test logs have final blank lines removed;
their normalized package hashes
are separate from the original experiment hashes. Applying it reproduces both recorded runtime manifests.
All other copied journals, logs, source manifests and executed script text retain original bytes.
No binary fixture, heap snapshot, WASM binary or production source tree is packaged.

Copy `reproduce.mjs.txt` to an `.mjs` file before invoking Node. For example, from the repository root:

```sh
cp qualification/step3/comparison/evidence/immutable-runs/trie-prototype/reproduce.mjs.txt /tmp/reproduce-trie.mjs
node /tmp/reproduce-trie.mjs --repository "$PWD" \
  --evidence "$PWD/qualification/step3/comparison/evidence/immutable-runs/trie-prototype" \
  --output /tmp/new-trie-experiment
```

The output must not exist. The wrapper retrieves and hash-checks historical source, applies the scratch patch,
uses the installed pinned dependencies, and verifies both complete runtime manifests including native hashes.
This preparation-only path was checked during packaging; no new measurements were run.
Optional `--run-comparisons` builds fresh binary fixtures and workers; `--run-traces` first runs comparisons,
then the primitive traces and actual publication pair. Supervisors use exclusive output creation.
Path-adjusted rerun harnesses get new hashes in `reproduction-harness.json`; they are not the original executed bytes.
Native actor randomness means rerun fixture encodings/call counts need not equal the original observations.

Representative complete-carrier fresh-load/overlap memory, ordinary publication after load, concurrent prefix creation,
and cold merge under a chosen bounded history remain follow-up work. Compatibility/migration is separate work.
The preserved H5000 failures and mandatory eligibility obligations remain unresolved by this prototype.
