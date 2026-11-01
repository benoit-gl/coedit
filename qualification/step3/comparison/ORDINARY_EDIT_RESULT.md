# Ordinary-edit qualification result

## Disposition

**Evidence status:** Native diagnostics and the headless comparison have run locally. The browser section describes
its fixture and collection method; successful Chromium evidence for this PR is still pending Actions.
The ordinary-edit work package is not complete until those measurements and required checks have been reviewed.

The current representations do **not** establish an unrestricted production-compatible ordinary-edit path under
[`MVP_VERIFICATION_PLAN.md`, section 6.6](../../../docs/MVP_VERIFICATION_PLAN.md#66-performance-qualification).
The incremental experiment removes the identified adapter-wide and full-target reconstruction from eligible warm
ordinary edits. Native work still prevents an unrestricted no-whole-document-work claim:

| Path                                                               | Result                       | Reason                                                                                              |
| ------------------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Snapshot/reference editor                                          | Fail                         | Ordinary publication and reads reconstruct the document.                                            |
| Targeted editor/preflight                                          | Fail                         | Full target reconstruction and validation remain; arbitrary decoders use full preflight.            |
| Incremental adapter, pure concrete decoder                         | Adapter work addressed       | Indexed slices, staged deltas and revision checks replace full-buffer reads and validation.         |
| Incremental Automerge representation                               | Fail                         | Native publication shallow-copies ancestor maps with unrelated entries and accumulated evidence.    |
| Incremental Yjs representation, unrestricted fragmentation/history | Fail                         | Attributed insertion can traverse the entire native prefix of a fragmented single-content document. |
| Arbitrary stateful decoder                                         | Ineligible for no-scan claim | Preserving its observable callback behavior retains full placement preflight.                       |

These are qualification outcomes, not a carrier or allocator selection. Green correctness checks do not make a failed
representation eligible for Gate B. This closes the investigation with a negative result for the current unrestricted
representations. A production-compatible representation change requires a separately assessed implementation/design
unit; it must not be smuggled into Gate B as a policy exemption. The other Merge 8 work packages remain separate.

## Implemented experiment

`ordinaryEditVariant: "incremental"` is an explicit qualification-only option. Existing snapshot and targeted paths
remain selectable. The experiment uses an attributed piece index with persistent AVL joins and splits. Pieces contain
at most 256 UTF-16 units at construction. This is an internal experimental chunking parameter, owned by `indexedText.ts`,
not a capacity ceiling, admission guard or product performance target. Untouched pieces and subtrees are shared.

The carrier builds a derived live-text index only after complete snapshot and retained-owner validation. An ordinary
batch stages changes on index forks, checks offsets, inserted native strings and cut boundaries, then mutates the native
carrier. The staged index is adopted only after native success. Warm edits do not enumerate retained liveness tokens;
the validated live-target proof is preserved by text-only updates and invalidated or rebuilt at other transitions.
Liveness tokens, native history and qualification effect records are still retained and still have native costs.

`readOrdinaryTextRange` returns a detached attributed slice and an opaque instance-local revision receipt.
`applyOrdinaryChange` checks
that revision and returns a publication receipt. Every change, merge and restore attempt invalidates old revision
receipts, including failed attempts. Reload creates a new carrier instance. A binding cannot transfer receipts between
instances. `prepareOrdinaryText` is explicit read-only activation/recovery; it does full validation and index work.

The separate `QualificationIncrementalEditor` stages ordered edits and inverse slices before publication. It uses the
receipt instead of a post-publication full-buffer assertion. Semantic undo/redo use fresh effects and refuse a stale
session. This experiment does not replace the retained editor's concurrent anchored-insertion policy. The separate
mounted ProseMirror binding projects inserted step slices only. Initial mount and explicit lifecycle/rejection recovery
materialize the target; ordinary transaction dispatch does not. The existing adapter still owns the broader IME and
clipboard suites. Neither adapter is the final production editor binding.

All concrete allocator candidates are still governed by their existing codec interface. The experiment opts into the
already available pure, deterministic, lifetime-stable decoder condition using local-dense. It does not narrow the
general interface or silently discard arbitrary decoder callbacks. The recorded fallback is deliberately ineligible.

## Correctness changes

Yjs transactions batch writes but do not roll back callback exceptions. The integrated adapter now allocates liveness
IDs and checks required owners and native text kinds before entering its live edit transaction. Restore also prepares
namespaces, IDs and restored payloads before live mutation. The regression throws during later token allocation and
checks encoded state, including hidden liveness data, rather than checking visible text alone. The claim covers admitted
operations and expected preparation failures; it is not a universal rollback promise for runtime termination or an
unexpected native-library defect. Resource/admission selection remains in its own Merge 8 work package.

Automerge stable positions retain the native text-object identity at capture. A cursor from a replaced or restored text
object returns unresolved before calling the native resolver. Equal text cannot reattach it. Reload preserves a current
object identity; restore deliberately creates fresh text identities, as the verification plan requires.

The investigation also found an Automerge surrogate-boundary corruption case: deleting UTF-16 `[1,3)` from `😀😁` can
produce a well-formed expected JavaScript string while the native splice produces different text. Integrated and focused
payload validation now reject cuts through surrogate pairs before publication, including fallback retries. Exact
preservation on success or atomic rejection remains the governing contract; no production string domain is selected.
Indexed Origin values use the same canonical fields as native encoding. Differential tests retain candidate-specific
validation ordering for rejected batches.

## Reproducible method and outputs

Run `npm run step3:qualification -- --ordinary-only` for the complete point 1 package, including all common suites
and Chromium collection, without waiting for the other Merge 8 work packages. The runner records its scope explicitly.
The separate `ordinary-edit-evidence` Actions job preserves this scoped artifact even while the broader campaign runs.
Run `npm run step3:qualification` for the broader comparison, or create an empty `step3-evidence` directory and run
`npm run step3:ordinary-edit` for this package. The latter refuses to replace an existing output. It checkpoints completed
rows with a running status and preserves them in an error record if a later profile fails. The full runner uploads
machine-readable evidence and logs through the existing Actions artifact mechanism.

`ordinary-edit.json` contains the checked-out revision, dirty state, host/runtime/dependency metadata, raw samples,
separate counters, lifecycle observations and native-work diagnostics. `ordinary-browser.json` contains mounted-browser
observations from the Chromium stage. The committed profile and this method are durable; Actions artifacts expire.

The headless comparison uses the same encoded native genesis within each candidate/profile. Snapshot, targeted and
incremental variants alternate forward/reverse order. Each has two warm-ups, five measured fresh-instance samples and
one separate instrumented instance. Text is realistic Markdown-like source with astral and BMP Unicode, combining text
and line feeds at 1,024, 10,000 and 100,000 UTF-16 units. Independent profiles vary unrelated placements, unrelated text,
opaque count/size, target Origin runs and prior insert/delete pairs. A combined profile checks interactions. Complete
semantic text/Origin, effect contexts and payload evidence are compared outside timing intervals.

Each headless sample records load, activation and eight complete editor operations: start/middle/end insertion and
deletion, Unicode/line-feed insertion and selection/source replacement. History profiles preserve visible text and
separate edits without context from attributed effects. Native history and liveness remain coupled; the results do not
pretend to isolate either perfectly. Indexed state is additional derived memory, not compaction.

The lifecycle record uses shared native genesis and a scripted load, inbound merge, restore, replacement, rejection and
explicit recovery sequence. Transition, activation, first-edit and warm-edit durations and counters are separate. These
transition timings are single descriptive observations. The record also exercises stateful-decoder fallback explicitly;
its occurrence in that script is not a real-world population frequency.

The browser comparison mounts both retained paths and the new incremental binding. It uses the same three Unicode
sizes, an unrelated text and opaque payload, and a placed Block. It records five samples after two warm-ups for each
candidate/variant/size, with independent diagnostic instances. The 270 measured operation samples cover a direct
Unicode/line-feed transaction, source selection replacement and a synthetic keyboard append. Public projection calls,
native publication and the outer driver/dispatch interval are distinct. Incremental adapter subintervals are nested;
do not add overlapping intervals. The 50 ms calibration is experimental and never a correctness threshold. Five samples
do not establish a reliable population-tail percentile. Browser events and view updates are not physical paint or OS IME.
Publication remains synchronous; the fixture does not disguise that cost with asynchronous downstream callbacks.

## Native-work diagnostics

Automerge diagnostics wrap `Object.assign` only during one synchronous integrated incremental edit, restoring it in
`finally`. They record source-map widths and known unrelated keys at 0, 20 and 100 unrelated contents, with 0 and 100
prior attributed edits. The probe adds diagnostic enumeration overhead and is not timed. Shallow ancestor copying is
different from recursively copying all payload bytes, but still grows with unrelated document entries. No native-zero
claim follows from wrapper counters.

Yjs diagnostics hold text length fixed at 1,024 units and vary Origin fragmentation independently at 1, 32, 256 and 1,024
runs. They probe insertion at start, middle and end by counting reads of existing native item links. Forwarding property
descriptors preserve link changes and are restored in `finally`; semantic text and encoded reload are checked afterward.
This is a pinned-version private diagnostic, not a supported application hook. Counts include search/cleanup and omit
new items. The installed `YText.js` source confirms attributed insertion disables position-search markers. An end edit
on the fully fragmented single-content case visits effectively its full existing native prefix. Passing elapsed-time
calibration does not waive that finding.

## Requirement trace

| Question                             | Evidence                                                                         | Disposition                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Target reconstruction and validation | Indexed carrier/editor tests; independent target-size and Origin profiles        | Removed from eligible warm adapter path; native limitations retained explicitly.            |
| Unrelated document work              | Wrapper counts, independent shape profiles, native map/link probes               | Adapter pass; unrestricted native representations fail as stated above.                     |
| Liveness and effect/history cost     | Warm token counts; history/effect profiles; native map copies                    | No warm adapter enumeration; native retention/growth remains measured.                      |
| Decoder compatibility and fallback   | Existing decoder differential tests and lifecycle fallback rows                  | General behavior preserved; stateful path ineligible.                                       |
| Transition warming/recovery          | Lifecycle record and revision/reload/restore tests                               | Full transition/recovery work identified separately from edits.                             |
| Atomic publication                   | Encoded-state failure regressions, shared foundation suite across three variants | Identified expected-failure gaps fixed; admission selection is separate.                    |
| Restored Automerge anchors           | Native-object identity, replacement/restore/reload regressions                   | Obsolete object unresolved; no equal-text reattachment.                                     |
| Representative editor responsiveness | Headless raw samples and mounted Chromium observations                           | Experimental intervals; no product-speed or independent-feedback guarantee.                 |
| Range-holder work                    | Existing retained-Range tests and localized editor/position paths                | No new holder registry or holder traversal introduced; final Range scaling remains point 3. |

The result is evidence for an explicit representation decision, not permission to relax the mandatory invariant.
