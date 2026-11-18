# Browser and native reference qualification profile

## Scope and authority

This is experimental evidence for Step 3 merge unit 9 in the
[scaffolding plan](../../../SCAFFOLDING_PLAN.md). The
[verification plan](../../../docs/MVP_VERIFICATION_PLAN.md), particularly sections 6.2-6.6, owns native-string,
Origin, atomicity and editor requirements. The [fixture profile](browser-reference-profile.json) owns these bounded
workload sizes and sampling settings. They are observations to characterize, not product limits, acceptance ceilings
or performance thresholds. Gate B remains a later decision; no carrier, allocator or policy is selected here.

The existing browser suites cover short start/middle/end edits, backspace/delete, selected replacement, source syntax,
line feed, IME-event handling, clipboard events and semantic undo/redo. The new
[browser fixture](browserReference.browser.test.ts) supplements them with explicit size/Origin/unrelated-state
dimensions, lifecycle recovery and native-string edge cases. It uses the existing qualification editor and carrier
APIs; it does not implement a production editor or resolve the
[ordinary-edit eligibility failure](ORDINARY_EDIT_RESULT.md).

## Running and preserving evidence

After the repository's normal bootstrap, run from the repository root:

```text
npm run step3:browser-reference -- PATH_TO_EMPTY_EVIDENCE_DIRECTORY
```

The [runner](../../../scripts/step3-browser-reference.mjs) requires an empty output directory and writes a running
report before executing the browser fixture and pinned native Loro reference. It preserves completed browser rows,
manifest errors, exit codes and browser/Loro logs on failure. A partial run is an error, never a completed comparison.
Preserve or move an earlier directory before rerunning; evidence is not overwritten. Browser stdout/stderr stream
directly to the log file, retaining completed raw rows even if the parent is externally terminated. Such termination
may leave a running report; it is not completion evidence. Fixture timeouts and subprocess failures do not establish
supported product capacities or carrier resource-admission behavior.

The report records Git HEAD and dirty status separately from GitHub checked-out and PR-head revisions, profile,
OS/CPU/reported host memory, Node and package versions, and the pinned Chromium version from a separate launch of
the same Playwright executable. Dirty runs must retain their exact source explanation. Logs and archives are
supplementary; commit the method, profile and summarized observations needed for a durable record.

The `browser-reference` Actions job uploads its output on success or failure. The existing full qualification runner
also captures the new browser rows in `browser-reference.json`; its later Loro stage writes its own native report.
Loro remains isolated, reference-only, outside the selectable carriers, common correctness gate and production
dependencies. No native Loro operation is synthesized for Yjs or Automerge.

`LORO_REFERENCE_ROOT` can place the isolated reference installation outside the checkout. This keeps third-party
package documentation out of subsequent local source checks. Runtime cache and browser locations remain execution
environment settings, not repository source configuration.

## Paired browser editing dimensions

The JSON profile varies the following dimensions independently and in one combined shape:

- Target `text/markdown` source: 1,024, 10,000 and 100,000 ECMAScript UTF-16 units.
- Target attribution: one or eight distinct authored Origin runs.
- Unrelated placed Blocks: four or sixteen, each containing a 4,096-unit text payload and a 4,096-byte opaque payload.
- Combined shape: 10,000-unit target, eight Origin runs and sixteen unrelated Blocks.

Source includes multiline Markdown, non-ASCII scripts, combining text, supplementary characters, variation/ZWJ emoji,
and CRLF/LF. Fixture generation avoids cutting a surrogate pair at the requested length or Origin boundary. Expected
text and attribution are constructed independently of the resulting carrier projection. Unrelated structure, payloads
and Origins must remain unchanged by target-only editing.

The repeated source pattern is `"# café\r\n漢字 e\u0301 👩‍💻️ **markdown** [link](x)\n"`, truncated to the requested
UTF-16 length with a final incomplete surrogate replaced by `x`. Unrelated `text/plain` is repeated `u`; each
`application/octet-stream` buffer is filled with its zero-based Block index. Target and unrelated runs have distinct
human Origin identities. Editing replaces `[0,1)` with `##`, inserts `e\u0301👩‍💻️\r\n` at a scalar-safe middle
offset, then types `!` at the end. The exact source and boundary construction are also bound to the fixture revision.

Each candidate uses the same logical shape and operation sequence through the existing mounted ProseMirror adapter,
targeted qualification preflight/projection and an explicitly pure local-dense decoder. This opts into an existing
qualification path; it is not a production interface restriction or an eligibility claim. Initial Origin construction
and native document setup are outside measured edit intervals. Varying Origin runs also changes setup history, so
timing differences cannot be attributed solely to fragmentation.

One fresh fixture per warmup/sample performs source selection replacement, a Unicode insertion and synthetic keyboard
insertion at the end. The JSON profile specifies one warmup and three measured samples, alternating candidate order
by iteration. Shapes run in a fixed sequence in one browser environment; runtime warming and garbage collection can
influence observations. Three observations support descriptive medians, not a reliable tail estimate.

Each measured editing row contains all three ordered operations. `driverOrDispatchMs` covers the synthetic keyboard
driver or transaction construction and synchronous ProseMirror dispatch through completion; `publicationMs` is nested
synchronous carrier publication. These intervals overlap and must not be added. Setup, verification and later encoding
are excluded.
Neither interval measures physical paint or proves feedback independent of slow synchronous publication. No finite
timing candidate drives correctness failure.

The [report parser](../../../scripts/step3-browser-reference-report.mjs) checks an exact candidate/profile/iteration
manifest, not row count alone. Duplicates cannot substitute for missing observations. With this profile it expects
36 editing rows (108 operation observations), six lifecycle rows and six edge-case rows. Warmups are not emitted as
measured rows. Missing rows, malformed timing data or incomplete operation/phase sequences make the report incomplete.

## Lifecycle, positions and asynchronous scheduling

The smaller lifecycle shape combines 1,024 target units, four Origin runs and four unrelated Blocks. It exercises:

1. Two local keyboard edits while simulated persistence, outbound delivery and an inbound change are held behind
   in-memory gates across an explicit browser task boundary.
2. Releasing downstream work and applying the inbound prefix, checking attributed convergence and recovery of a stale
   mounted projection before another edit.
3. Encoding, reload/remount and following editing, with explicit selection and native position observations.
4. Restoring a retained qualification capture, recovering the view and making another edit.
5. Whole-text replacement, recording position invalidation and recovery/reselection before following editing.

Expected states and Origin effects are checked outside timings. Rejected stale actions must leave committed bytes,
state and effect records unchanged. Selection observations describe the existing reset/remount and explicit
reselection path; they do not promise automatic caret continuity or introduce a production selection policy.
Qualification captures are detached retained states, not permanent product Versions.

The fixed lifecycle sequence appends `x` and `y`, receives a remote `R` prefix, appends `z` after stale-view recovery,
reopens and appends `q`, restores the original capture and appends `r`, then replaces with `replacement\n😀` and
appends `!`. Reload and final replica checks compare exact attributed states. Reset/remount selection observations
precede an explicit end reselection; no hidden editor state is assumed to survive those transitions.

The task boundary establishes asynchronous scheduling of pending work, not real slow I/O. Persistence is a byte buffer,
replication exchanges in-memory encoded state, and callbacks run on the same browser thread. No real IndexedDB,
network latency, durability, process restart, CPU contention or slow synchronous canonical publication is simulated.
Reload/convergence assertions prove this controlled schedule, not general distributed-system responsiveness.

## Native-string edge observations

Both carriers exercise lone high/low surrogate insertion and deletion through the interior boundaries of two
surrogate pairs. A successful operation must preserve the expected native string and Origin exactly, including after
reopen; an unsupported operation must refuse atomically. The fixture distinguishes a native-string refusal from an
arbitrary test failure and records the rejection reason and observed transient selection behavior. It does not repair
or normalize content, choose the eventual support domain, or assume the two candidates accept the same strings.

## Browser input and observation limits

- Synthetic keyboard events exercise the browser editor path, not physical keys or an operating-system input stack.
- Unicode/source transactions explicitly exercise editor semantics; they are not OS keyboard or IME measurements.
- Existing composition-event tests exercise the adapter's event protocol; they do not establish real OS IME behavior.
- Existing `DataTransfer`/clipboard-event cases exercise private/plain fallback and publication, not OS clipboard
  permission, interoperability or activation boundaries.
- DOM/model equality verifies the current view and canonical state. Driver completion and animation-frame callbacks
  do not establish physical paint latency.
- Single-host headless Chromium observations do not generalize to all browsers, devices or supported platforms.

The existing ordinary-edit instrumentation and negative native-work results retain their own scope. Browser speed or
green correctness tests cannot waive the mandatory no-whole-document-work criterion. Unit 10 owns its resolution;
unit 11 owns final common-revision comparative qualification after units 8-10, and unit 12 records selections.

## Native Loro reference method

The [pinned reference script](../../../scripts/step3-loro.mjs) uses isolated `loro-crdt@1.16.4`. Default invocation
still writes `step3-evidence/loro-reference.json`; an optional output-file argument supports the focused runner.
It reserves the output, checkpoints completed rows, and distinguishes running/complete/error outcomes.

The native text fixture creates 1,024 ASCII units and a cursor at offset 512. The measured operation inserts `x`,
resolves the cursor, and checks independently expected text and offset 513. The native tree fixture creates four
nodes and alternates one child's parent 16 or 128 times, commits, projects and checks the expected final parent.
Setup is excluded; native resolution/projection and the stated checks are inside the intervals. The reference uses
the shared preliminary profile's one warmup and five measured samples, recorded in its report; nearest-rank p95 is
the maximum of five observations, not a reliable estimate of a latency tail.

These operations omit protected Origin, Coedit semantic publication, effect/liveness metadata, attributed editor
projection, integrated structure, serialization and replica/lifecycle operations. They also have different source,
document size and timing boundaries. They establish bounded native cursor/tree feasibility and cost observations;
they do not establish equivalent carrier functionality or support a speed ratio, carrier ranking or selection.
