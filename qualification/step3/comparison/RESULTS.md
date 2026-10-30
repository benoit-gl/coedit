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

## Editor and ordinary-edit increment

[Actions run 40925388226](https://github.com/benoit-gl/coedit/actions/runs/40925388226) measured PR head
`127657a98a9bdce708154904f1c1133327fc3709` on test merge `d243f54574c9e6b570b09abad38b9698ffbad1bf`.
The [raw artifact](https://github.com/benoit-gl/coedit/actions/runs/40925388226/artifacts/12920342128) contains all
samples, profiles and environment details. It is supplementary and expires.
The host reported Linux 7.0.0-1017-azure x64, Node 24.22.1, four Intel Xeon Platinum 8573C CPUs, and
16,759,308,288 bytes RAM; Yjs was 13.6.32 and Automerge 3.4.1.
The browser user agent identified HeadlessChrome 156.0.8078.4.

In the browser growth fixture, five measured fresh samples per candidate followed two warm-ups. The target was a single
ASCII text InlineContent in a two-Block, three-InlineContent document. The table shows median / nearest-rank p95
synthetic keyboard-driver duration and nested synchronous carrier apply, in milliseconds, for a middle insertion.
The driver interval includes driver and adapter work; it is not physical paint or independent feedback.
Raw samples are in the artifact;
with five observations p95 is the maximum, not a reliable tail estimate.

| UTF-16 units |  Yjs driver | Yjs apply | Automerge driver | Automerge apply |
| ------------ | ----------: | --------: | ---------------: | --------------: |
| 1,024        | 15.4 / 15.6 | 0.2 / 0.3 |      10.3 / 11.7 |       1.2 / 1.6 |
| 10,000       | 14.7 / 15.0 | 0.2 / 0.3 |      16.2 / 16.9 |       1.4 / 1.9 |
| 100,000      | 26.4 / 39.0 | 0.6 / 0.6 |      27.2 / 29.7 |       1.8 / 1.9 |

The other short-text editor cases from the same run are summarized below.
Each value is median / nearest-rank p95 in milliseconds for five measured
samples. Unicode and line-feed cases use direct ProseMirror transactions;
their driver intervals are not comparable with synthetic keyboard intervals.

| Edit case             |  Yjs driver | Yjs apply | Automerge driver | Automerge apply |
| --------------------- | ----------: | --------: | ---------------: | --------------: |
| Insert at start       | 30.6 / 56.2 | 0.4 / 0.6 |      39.7 / 47.8 |       4.7 / 7.2 |
| Insert in middle      | 21.1 / 31.1 | 0.4 / 0.9 |      24.7 / 39.2 |       2.3 / 4.4 |
| Insert at end         | 18.7 / 28.9 | 0.2 / 0.2 |      22.0 / 33.2 |       2.2 / 3.3 |
| Backspace             | 32.7 / 46.2 | 0.4 / 1.0 |      45.9 / 50.9 |       1.8 / 3.3 |
| Forward delete        | 17.1 / 34.8 | 0.3 / 0.5 |      27.3 / 62.0 |       1.7 / 3.6 |
| Selection replace     | 18.9 / 27.7 | 0.3 / 0.6 |      27.3 / 40.0 |       3.0 / 4.4 |
| Markdown source       | 15.6 / 15.7 | 0.2 / 0.2 |      10.7 / 11.5 |       1.3 / 1.5 |
| Unicode transaction   |   0.5 / 0.5 | 0.1 / 0.2 |        1.9 / 2.2 |       1.2 / 1.5 |
| Line-feed transaction |   0.5 / 0.6 | 0.1 / 0.2 |        1.8 / 2.6 |       1.2 / 1.8 |

The downstream-isolation fixture recorded two sequential keyboard edits per
fresh fixture while persistence and inbound/outbound replica delivery were
held behind in-memory gates. Each value is median / nearest-rank p95 in
milliseconds from five measured samples.

| Candidate / edit  | Driver-to-DOM check | Synchronous apply | Next animation-frame callback |
| ----------------- | ------------------: | ----------------: | ----------------------------: |
| Yjs, edit 1       |         23.4 / 32.4 |         0.2 / 0.7 |                   37.3 / 43.1 |
| Yjs, edit 2       |         25.4 / 37.9 |         0.1 / 0.3 |                   32.8 / 38.3 |
| Automerge, edit 1 |         26.4 / 29.1 |         2.0 / 3.5 |                   31.7 / 38.1 |
| Automerge, edit 2 |         27.9 / 42.9 |         2.4 / 4.6 |                   31.0 / 56.2 |

The animation-frame interval starts before keyboard dispatch and ends in a
subsequent animation-frame callback. It includes driver and assertion overhead.
It does not measure physical paint or feedback independent of slow synchronous
publication. These results characterize gated callbacks, not real slow I/O
or product responsiveness.

The snapshot comparison used eight samples of ten alternating edits after ten warm-ups, with a pure local-dense decoder.
For 100 unrelated Block placements, median steady time per edit was 0.392 ms snapshot and 0.106 ms targeted for Yjs,
and 1.704 ms snapshot and 1.472 ms targeted for Automerge. Median load was 0.476/0.932 ms for Yjs and 6.014/7.140 ms
for Automerge, respectively. With 500 prior target edits, median steady time was 0.146/0.093 ms for Yjs and
4.391/4.159 ms for Automerge. Those history cases combine liveness-token and native-history growth and cannot attribute
the cost to either alone. They do not establish constant-time editing.

The gated downstream fixture checked local updates while simulated persistence and inbound and outbound replica
callbacks were pending, then checked reload and convergence after release. This demonstrates the fixture's scheduling,
not real slow storage, network, durability, or feedback independent of slow synchronous local publication. Arbitrary
stateful decoders with retained placements still use full preflight; the no-whole-document-work criterion remains open.

**Remaining before an admissible comparative record:** expand same-profile
history and opaque workloads, concurrent replacement and integrated structure
tests, Chromium/editor/clipboard/resource characterization, and the
non-selectable Loro reference. Investigate the history workload's resource
growth and publish a current, complete summary with its raw artifacts.
No current number selects a candidate, freezes a limit, or promotes a target.
