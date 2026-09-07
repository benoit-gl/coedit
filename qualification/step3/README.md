# Step 3 qualification

This directory contains the reproducible evidence harness for Step 3. It does not implement the selected production carrier. Step 4 owns that work after Gate B selects the carrier and structural position allocator.

## Candidate pins

The qualification branch pins these candidate and adapter dependencies:

| Dependency                    | Version | Role                                                 | License decision      |
| ----------------------------- | ------- | ---------------------------------------------------- | --------------------- |
| `yjs`                         | 13.6.32 | collaborative carrier candidate                      | admissible            |
| `@automerge/automerge`        | 3.4.1   | collaborative carrier candidate                      | admissible            |
| `@tiptap/core` / `@tiptap/pm` | 3.30.5  | common editor boundary                               | admissible            |
| `fractional-indexing`         | 4.0.0   | established fractional structural-position candidate | admissible; CC0-1.0   |
| `fugue`                       | 3.0.0   | established Fugue structural-position candidate      | admissible; Unlicense |
| `@playwright/test`            | 1.62.1  | real Chromium qualification                          | development-only      |
| `dompurify`                   | 3.4.14  | clipboard sanitization qualification dependency      | admissible            |

The available TypeScript LSEQ package `@peoplesgrocers/lseq` was reviewed as an established-family reference but is not imported because it is AGPL-3.0. Step 3 records that screen rather than adding a product dependency with an unsuitable license.

## Evidence

`npm run qualify:step3` runs both parts of the qualification:

- the headless fixture records equivalent content and structural-position measurements in `artifacts/step3/qualification.json`;
- the browser fixture drives both Yjs and Automerge through the same ProseMirror schema and transaction bridge in headless Chromium and records the Playwright report in `artifacts/step3/playwright.json`.

The `Step 3 Qualification` workflow uploads `artifacts/step3` as the `step3-qualification-evidence` Actions artifact. The artifact also contains the runner environment so later comparisons can distinguish candidate behavior from environment changes.

The fixture sizes are calibration evidence. They are not document validity limits, API guarantees, or production performance thresholds.

## Gate B result

Gate B selects Yjs 13.6.32 and Fugue 3.0.0. The deciding rationale, rejected-candidate tradeoffs, and selected hostile-input guards are recorded in [`docs/decisions/0010-step-3-carrier-and-allocator-selection.md`](../../docs/decisions/0010-step-3-carrier-and-allocator-selection.md).

The qualification retains both carrier adapters and all allocator candidates so the comparison remains reproducible. Step 4 promotes only the Yjs and Fugue behavior into the production collaborative core. The Range feasibility fixtures remain test-only compositions and do not select the Step 6 lineage representation.

## Selection boundary

Do not select a carrier or allocator from a single timing number. Gate B must consider correctness, convergence, atomic multi-content transactions, editor behavior, Range feasibility, encoded growth, collision and interleaving behavior, adapter complexity, and the persisted measurements together.

The Range tests in this step use test-only cursor compositions to prove carrier feasibility. They intentionally do not define the Step 6 Range representation or wire format. Automerge's inability to preserve both tested insertion affinities is recorded as candidate evidence rather than patched with a premature lineage design.
