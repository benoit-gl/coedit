# Step 3 preliminary comparative evidence

This runner and its measurements establish an experimental baseline for
continued investigation. They do not complete Step 3 comparative qualification
or provide sufficient evidence for Gate B.

The exact run-specific method and input profile are in `profile.json`.
The `npm run step3:measure` command records paired Yjs/Automerge and
structural allocator samples, medians, p95, encoded growth, CPU and memory
environment, and the `GITHUB_SHA` value in `step3-evidence/measurements.json`.
For local runs, set `GITHUB_SHA` to the checked-out commit and record any local
modifications separately; otherwise the recorded revision is null.
The measurement report is checkpointed after each completed row and is marked
incomplete until all workloads finish.
History rows below 5,000 effects time the edit loop over five samples without
warm-ups. At 5,000, one isolated child-process wall-time sample includes startup,
fixture creation and encoding. It has no p95; a failed child has no median.
These intervals are not directly comparable.
Both carriers use the same integrated carrier and Range abstraction.
All timings are **experimental**, never correctness thresholds.

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
