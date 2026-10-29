# Step 3 preliminary comparative evidence

This runner and its measurements establish an experimental baseline for
continued investigation. They do not complete Step 3 comparative qualification
or provide sufficient evidence for Gate B.

The exact run-specific method and input profile are in `profile.json`.
The `npm run step3:measure` command records paired Yjs/Automerge and
structural allocator samples, medians, nearest-rank p95, encoded growth, CPU and memory
environment, exact installed package versions, and the `GITHUB_SHA` value in `step3-evidence/measurements.json`.
For local runs, set `GITHUB_SHA` to the checked-out commit and record any local
modifications separately; otherwise the recorded revision is null.
The measurement report is checkpointed after each completed row and is marked
incomplete until all workloads finish.
History measurements alternate candidates on the same host over five fresh
process samples at each count, without warm-ups. The edit loop and final encode
are timed separately; process wall time includes startup and setup. Per-process
peak RSS includes setup and encoding. The per-sample timeout is in the profile;
timeouts, explicit resource exhaustion, and unknown failures are distinct.
With five samples, nearest-rank p95 is the maximum and is not a reliable
estimate of tail latency; all raw samples remain in the artifact. Timeouts and
resource exhaustion are observations, not correctness thresholds. The standalone
measurement command refuses to overwrite an existing measurements file; the full
qualification runner requires an empty evidence directory.
Matching headless cases are grouped by workload and size; candidates alternate
order on each iteration. Every measured sample records its execution sequence,
position in that iteration, duration, and returned details. Warm-ups are not
reported as samples. Both carriers use the same integrated carrier and Range
abstraction.
All timings are **experimental**, never correctness thresholds.

The extended headless rows separately measure Range construction, one lazy
resolution, edits with probe values present, atomic structure and two payloads,
reload and retained-state materialization, and edit publication with unrelated
InlineContents. Their details specify whether projection or encoding is included. In particular,
`insert-and-project` includes apply, projection, and encoding, and
`opaque-replacement` includes replacement, projection, and encoding.
The unrelated-content scaling measurement can expose scans but cannot prove
that scans are absent. Retained probes are not registered product Range holders.

Carrier-neutral clipboard rows exercise below, at, and above each small fixture
guard and malformed JSON. Their timed interval includes parsing and a constant
time retained-source stub, not OS clipboard operations or real historical lookup.
The fixture values do not select production guards or demonstrate carrier
resource admission.

The browser fixture records synthetic keyboard-driver completion and nested
synchronous carrier publication separately in `editor-feedback.json`. Its
fresh 1,024-character fixture uses two warm-ups and five samples per candidate.
The adapter publishes synchronously; the driver interval includes publication
and driver overhead. It is not physical paint, OS input/IME, independent
asynchronous feedback, slow-persistence isolation, or a product latency claim.

The additional `editor-workloads.json` contains paired browser samples for
insertions at the start, middle and end, backspace, forward delete, selection
replacement and a Markdown source character. Unicode and line-feed cases
dispatch ProseMirror transactions directly; they are not physical keyboard or
IME measurements. Each sample starts with two Blocks and three InlineContents;
the target text is short and includes an emoji. The fixture explicitly opts in
to the pure local-dense position decoder. It records five samples and two
warm-ups per case and candidate in alternating order. The driver/dispatch
interval includes synchronous publication and does not measure paint or
independent feedback; the nested interval covers `applyChange` only. The p95
is the maximum of five values and does not estimate tail latency reliably.
The fixture is a small operation-level probe, not representative-size or
slow-persistence/replica-delivery evidence. The qualification adapter edits one
InlineContent at a time and does not present a multi-Block editor surface.

`downstream-isolation.json` records synthetic local edits while gated in-memory
persistence and inbound and outbound replica callbacks remain pending. After
release, it checks reload and replica convergence. These gates model nonblocking
downstream work, not real storage, network, scheduler contention or durability.
The local editor and carrier still publish synchronously; animation-frame
callbacks are not physical paint. The experiment cannot establish independent
feedback while canonical publication itself is slow.

The snapshot comparison uses the same carrier fixture for the `snapshot` and
`targeted` qualification variants. It separately measures loading, the first edit
after load, steady alternating insertion/deletion batches, and merge, restore,
and fallback-replacement transitions plus each following edit. Loading and
transition timings include validation moved to those operations; edit intervals
include internal
validation and projection but exclude the later verification snapshot and save.
The artifact includes raw samples, fixture dimensions, outcome
checks, and timing limitations. It varies unrelated text and opaque content,
target length, and Origin fragmentation; it does not prove constant-time editing.
Run it separately with `npm run step3:snapshot-comparison` only when its output
path does not already exist.

Run the existing headless and Chromium suites separately before comparing
candidates. Candidate save/load counts as reload, **not** native compaction.
Automerge has no exposed native compaction operation in the pinned adapter.
A Loro cursor/movable-tree benchmark is reference-only and must never become
a selectable carrier or a production dependency.

After `npm run bootstrap`, run `npm run step3:qualification` for the current
partial comparison. The Loro stage installs its pinned package into the ignored
`.step3-loro-reference/` directory on first use. Set `LORO_REFERENCE_ROOT`
only to use a different isolated installation location.
The runner requires an empty `step3-evidence/` directory. Preserve or move
earlier results before another run, including after a failed run.

Further comparative work must complete the coverage and durable evidence in
the scaffolding plan before Gate B. The workflow artifact stores raw samples;
it supplements the committed evidence. Gate B owns candidate selection,
replacement rules and guard values.
