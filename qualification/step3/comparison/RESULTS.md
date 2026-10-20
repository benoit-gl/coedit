# Preliminary Step 3 comparative measurements

**Status:** Partial, experimental evidence. Not sufficient for Merge 8 completion or Gate B selection.

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

| Candidate | Operation | Size | Median ms | p95 ms | Reported encoded bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| Yjs 13.6.32 | Insert, project, encode | 100,000 UTF-16 units | 0.919 | 1.296 | 101,094 |
| Automerge 3.4.1 | Insert, project, encode | 100,000 UTF-16 units | 2.263 | 2.450 | 1,045 |
| Yjs 13.6.32 | Encode, reload, project | 100,000 UTF-16 units | 0.659 | 0.709 | 100,962 |
| Automerge 3.4.1 | Encode, reload, project | 100,000 UTF-16 units | 58.918 | 59.448 | 843 |
| Yjs 13.6.32 | Build 1,024 Range holders, resolve one | 1,024 holders | 5.563 | 5.720 | — |
| Automerge 3.4.1 | Build 1,024 Range holders, resolve one | 1,024 holders | 4.964 | 7.191 | — |
| Local dense | Narrow gap allocate and sort | 512 inserts | 1.512 | 3.411 | 114,680 total positions |
| Fractional indexing | Narrow gap allocate and sort | 512 inserts | 2.578 | 3.513 | 61,423 total positions |
| Fugue | Narrow gap allocate and sort | 512 inserts | 12.173 | 15.922 | 68,459 total positions |

The native lifecycle query reported automatic garbage collection for Yjs
and no exposed native compaction capability for pinned Automerge.
Save/load is not evidence of native Automerge compaction.

**Remaining before an admissible comparative record:** complete same-profile
history and opaque workloads, concurrent replacement and other integrated
structure tests, Chromium/editor/clipboard/resource characterization, the
non-selectable Loro reference, and full successful current-revision checks.
Publish raw artifacts and update this summary against the final qualified run.
No current number selects a candidate, freezes a limit, or promotes a target.
