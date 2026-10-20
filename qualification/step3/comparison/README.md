# Step 3 Merge 8 comparative qualification

The exact run-specific method and input profile are in `profile.json`.
The `npm run step3:measure` command records paired Yjs/Automerge and
structural allocator samples, medians, p95, encoded growth, CPU and memory
environment, and revision in `step3-evidence/measurements.json`.
Both carriers use the same integrated carrier and Range abstraction.
All timings are **experimental**, never correctness thresholds.

Run the existing headless and Chromium suites separately before comparing
candidates. Candidate save/load counts as reload, **not** native compaction.
Automerge has no exposed native compaction operation in the pinned adapter.
A Loro cursor/movable-tree benchmark is reference-only and must never become
a selectable carrier or a production dependency.

The summary of actual measurements, tested host and exact Actions run must
be committed before Merge 8 is called complete. The workflow artifact stores
raw samples; it is supplemental to the committed evidence. Merge 9, not this
merge, owns candidate selection, replacement rules and guard values.
