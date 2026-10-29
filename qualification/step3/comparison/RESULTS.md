# Preliminary Step 3 comparative measurements

**Status:** Partial, experimental baseline. Not sufficient for comparative qualification or Gate B selection.

The measurements below are from [Actions run 39483013858](https://github.com/benoit-gl/coedit/actions/runs/39483013858),
on PR head `df9fbbab8a86df5c1de51498e6b662c12461432b`. The run recorded the
GitHub pull-request test-merge SHA `c02dc54f146ff9466e69a059e924a6cfa46ce38f`.
The workflow passed its headless common tests and uploaded
`step3-qualification-evidence`, artifact ID `12291803075`, containing raw samples.

- Host: Linux 6.17.0-1022-azure, x64; Node.js v24.21.0
- CPU: AMD EPYC 9V74 80-Core Processor, 4 logical CPUs; host-reported RAM: 16,766,414,848 bytes
- Method: one warm-up and five samples; nearest-rank median and p95.
  Text is highly compressible repeated ASCII `a`; results must not be
  extrapolated to arbitrary Markdown or Unicode workloads.
- `insert-and-project` includes full encoded-size collection inside its
  measured interval. This timing is not an isolated keystroke or UI feedback latency.

| Candidate           | Operation                              |                 Size | Median ms | p95 ms |  Reported encoded bytes |
| ------------------- | -------------------------------------- | -------------------: | --------: | -----: | ----------------------: |
| Yjs 13.6.32         | Insert, project, encode                | 100,000 UTF-16 units |     0.919 |  1.296 |                 101,094 |
| Automerge 3.4.1     | Insert, project, encode                | 100,000 UTF-16 units |     2.263 |  2.450 |                   1,045 |
| Yjs 13.6.32         | Encode, reload, project                | 100,000 UTF-16 units |     0.659 |  0.709 |                 100,962 |
| Automerge 3.4.1     | Encode, reload, project                | 100,000 UTF-16 units |    58.918 | 59.448 |                     843 |
| Yjs 13.6.32         | Build 1,024 Range holders, resolve one |        1,024 holders |     5.563 |  5.720 |                       — |
| Automerge 3.4.1     | Build 1,024 Range holders, resolve one |        1,024 holders |     4.964 |  7.191 |                       — |
| Local dense         | Narrow gap allocate and sort           |          512 inserts |     1.512 |  3.411 | 114,680 total positions |
| Fractional indexing | Narrow gap allocate and sort           |          512 inserts |     2.578 |  3.513 |  61,423 total positions |
| Fugue               | Narrow gap allocate and sort           |          512 inserts |    12.173 | 15.922 |  68,459 total positions |

The native lifecycle query reported automatic garbage collection for Yjs
and no exposed native compaction capability for pinned Automerge.
Save/load is not evidence of native Automerge compaction.

## Later partial comparison

[Actions run 40824974753](https://github.com/benoit-gl/coedit/actions/runs/40824974753) measured PR head
`9e94c1bbbd80ef42b036a4373dea8fbaa510a0c3` on test-merge `e00818cb781929df25137750489896c7d727abf4`.
Its [raw artifact](https://github.com/benoit-gl/coedit/actions/runs/40824974753/artifacts/12876153994) includes
the profile, all samples, process outcomes, browser fixture, and environment. The artifact is supplementary and has a
finite retention period. This later run adds evidence; it does not complete the comparative qualification.

The host was Linux 7.0.0-1017-azure x64, Node.js 24.22.1, AMD EPYC 7763, four reported CPUs, and 16,760,344,576 bytes
reported RAM. The candidates were Yjs 13.6.32 and Automerge 3.4.1. Five isolated process samples per count alternated
candidate order without warm-ups. The edit interval excludes setup and encoding. Process peak RSS includes setup and
encoding. The fixture uses one initial ASCII `a` and one attributed `a` insertion per effect, not product Contributions.

| Candidate | Effects | Median edit loop | Median encode | Median encoded bytes | Median peak RSS |
| --------- | ------: | ---------------: | ------------: | -------------------: | --------------: |
| Yjs       |   5,000 |         3,464 ms |       48.0 ms |            3,744,302 |     220,956 KiB |
| Automerge |   5,000 |        70,168 ms |       76.0 ms |              620,138 |     411,672 KiB |

These are total loop times, not single-keystroke or visible-feedback latency. Five samples do not give a reliable p95.
The synthetic browser fixture records its raw driver and synchronous-publication intervals in the artifact; it does not
measure physical paint, independent asynchronous feedback, or slow persistence or replication. In this historical run,
both integrated adapters called `snapshot()` during ordinary changes. The later targeted experiment can avoid this
for eligible edits with no retained placements, or with an explicitly opted-in pure position decoder. Arbitrary decoders
with retained placements still use full preflight. The normal-typing whole-document-work criterion remains open.

**Remaining before an admissible comparative record:** expand same-profile
history and opaque workloads, concurrent replacement and integrated structure
tests, Chromium/editor/clipboard/resource characterization, and the
non-selectable Loro reference. Investigate the history workload's resource
growth and publish a current, complete summary with its raw artifacts.
No current number selects a candidate, freezes a limit, or promotes a target.
