# Targeted ordinary-edit qualification preflight

Both integrated qualification factories accept an optional third argument:

```ts
const targeted = { ordinaryEditVariant: "targeted" } as const; // Default.
const reference = { ordinaryEditVariant: "snapshot" } as const;
```

`create` and `load` use the factory's selection. Selection is local diagnostic configuration and is not serialized.
A state produced by either variant can be loaded by either variant of the same candidate. This does not change
production APIs, select Yjs or Automerge, define a portable format, or choose a replacement or History policy.

## Scope and preserved semantics

The reference path still calls `snapshot()` before each change, validates every visible projected payload, decodes
live placements, copies opaque bytes, and prepares ownership using the complete retained identity sets. The targeted
path replaces only that preparation for a nonempty batch containing exclusively `insert-text` and `delete-text`,
with no placement, InlineContent creation, or Block deletion. Every touched payload must already be a visible, owned,
live text payload. Empty optional arrays are equivalent to omitted arrays. Unknown, dead, or opaque targets fall back.

Targeted preparation projects each distinct touched payload once, including its entire text and Origin spans, and
checks that payload's ownership and both InlineContent and owning Block liveness. It bypasses global retained-ID set
construction only when no identities can be introduced. Both variants use the same sequential text validation and
candidate-native mutation routines, effect-context validation, replacement bases, causal frontier, immutable effect
envelopes, and update-over-delete liveness tokens. Repeated operations on one payload see the preceding operations'
text; all operations are preflighted before mutation. No-op deletions retain the previous no-liveness-update semantics.
Mixed batches, replacements, structural operations, and identity creation continue through the reference path.

## Validation boundary and conservative fallback

Skipping unrelated projections is safe only while their validity is known. A carrier keeps one local boolean proof,
not a document snapshot cache. Targeted construction/reload and successful merge, restore, and nonordinary fallback
changes attempt to establish this proof before returning. The speculative check projects the complete snapshot and
parses **every retained InlineContent ownership ID**, including identities hidden from the visible projection. A
successful check enables targeted preparation on the next eligible edit. No exception is cached or replayed.

If speculative validation throws, the carrier leaves the proof false and returns with the original transition's
success result. The next edit executes the unchanged full preflight, reproducing the original error at the original
call and validation stage. For example, Automerge can hide a malformed retained ownership ID from its snapshot while
ordinary full preflight still rejects that ID after text validation. Snapshot validity alone would be insufficient.
A malformed newly created identity that the reference mutation accepts likewise must not cause a new error after
commit; the speculative check cannot turn successful publication into a late failure. This preserves existing
acceptance behavior rather than introducing a stricter external-state format.

A successful ordinary batch preserves the proof because it changes only validated existing text and adds the same
liveness and evidence records as the reference implementation. This relies on the existing API's private native
document and detached snapshot contract; callers cannot mutate the candidate document behind the adapter. Structural
codec decoding can have observable state. By default, when any Block placement is retained, the targeted variant skips
speculative validation and uses the full preflight on ordinary edits, preserving decoder calls. The qualification-only
`purePositionDecoder` option permits the fast path with placements when the caller guarantees decode is pure,
deterministic and stable for the carrier lifetime. The comparison opts in using the local-dense fixture decoder. This
does not change the general codec contract. The speculative check does not mutate the native document.
The explicit snapshot reference performs no speculative validation and retains its previous cost placement.

Merge and restore attempts and rejected prepared edits invalidate the proof. A failed transition does not refresh it,
so the next ordinary edit conservatively performs full preflight. Successful transitions whose speculative checks fail
also keep that fallback. Capturing or materializing historical state does not alter the projected tip. Public snapshot
reads neither populate nor invalidate the proof. Unknown, dead or opaque targeted lookups fall back to original
preflight. Automerge tests visibility before parsing an owner, matching the reference projection's treatment of hidden
malformed owners and preserving its existing-text-payload error for an attempted edit of such an InlineContent.

Malformed unrelated Origins accepted by native loading or merging therefore still fail on the next edit before
publishing effects, rather than becoming new load/merge failures. Load and merge now perform additional read-only
work, but their externally visible error timing remains unchanged for these states.

## Costs and limits

With no retained placements, or with an explicitly opted-in pure decoder, this isolates repeated projection of
unrelated payloads, placements and opaque bytes in warm ordinary-edit sequences. With arbitrary decoders and retained
placements the full projection remains, so the general normal-typing no-scan qualification criterion remains unresolved.
It does **not** establish constant-time editing, complete independence from document size, or a production performance
budget. In particular:

- Successful load, merge, restore, and fallback now pay a full speculative projection plus retained-ID validation.
  This shifts work out of the next ordinary edit; it does not remove the document-wide scan. Successful fallback
  changes can pay both their original full preflight and a full post-commit validation.
- Failed transitions and failed speculative validation still require full preflight on the next edit. No claim of
  a scan-free path is made for unsupported, malformed, or unvalidated states.
- Each touched text and its Origin spans are still fully materialized; batch validation copies the touched map.
- Yjs exact-string preflight still constructs a temporary Y.Doc from the complete touched text for each edit.
- Automerge still validates the complete resulting native string, and native mutation costs remain candidate-specific.
- Liveness checks still enumerate the touched InlineContent's and Block's accumulated tokens; successful real edits
  still append tokens. History length can therefore affect warm edit cost even with a fixed document shape.
- Effect serialization and the native mutation, allocation, causal-evidence and garbage-collection costs remain.

Side-by-side measurement must record the explicit variant, document shape, touched text size, edit history, and whether
the preceding transition established the proof. Measure load/merge/restore/fallback durations as well as the following
edit: an isolated first-edit improvement can merely reflect work moved into the preceding transition. Both retained
implementations can be measured from the same candidate-native genesis; encoded bytes differ between independently
authored runs because replica identity, liveness tokens, and authoring nonces differ. Compare semantic snapshots,
Origins and effect records, not native byte equality across independent runs.

## Verification

`ordinaryEdit.test.ts` pairs reference and targeted carriers within each candidate and compares semantic snapshots,
Origins, effect contexts, and causal payload evidence. It covers sequential multi-payload batches, Unicode rejection,
exact errors and atomicity, duplicate effects, absent and opaque targets, no-op deletions, replacement fallback,
mixed structure/deletion with update-over-delete, historical restore, concurrency, reload, and malformed unrelated
Origins introduced through native load and merge. Additional regressions cover hidden malformed owners, invalid
retained ownership IDs after load/merge/restore, preflight error precedence, and malformed local creation without a
new post-commit exception. Snapshot spies establish successful transition warming and failed-transition fallback.
`integratedDocument.test.ts` runs the common foundation suite against both explicit variants and compares
cross-candidate update-over-delete projections. Existing causal-history and retained-Range suites exercise the targeted
qualification default as well. These are semantic and routing tests, not performance thresholds.

## Experimental editor target projection

The factory option `editorProjectionVariant: "targeted"` enables a separate,
qualification-only experiment. The default `"snapshot"` keeps the previous
editor read and position behavior. Targeted reads reuse the validated-projection
proof described above and project only a visible, live target text payload. The
same opt-in also uses that projection for stable-position creation and resolution.
When the proof is unavailable, a retained placement has an arbitrary decoder, or
an eligible text target cannot be established, the original full snapshot path
runs. The experiment does not change the general allocator codec contract. Reads
are detached, and the editor still checks the current text and Origin before and
immediately after publication.

Validation and transition costs remain: successful load, merge, restore and
fallback changes can perform full validation before later targeted reads. A
rejected edit invalidates the proof and the next read uses the full path. This
prototype reconstructs the whole target text and Origin spans and enumerates
its and its owner's liveness tokens. Public snapshot spies and decoder counts do
not instrument candidate-native internal traversal, payload copying, or Range
holders. It does not establish the normal-typing no-whole-document-work criterion
in general or make a production design choice.

The paired Node fixture compares reads, edits, undo/redo, effects, reload,
merge, restore, invalid targets and decoder fallback. Browser qualification
runs the direct editor suite with both variants and checks stale text and
Origin-only changes before publication. The traversal artifact varies preflight
and editor projection independently, records observed snapshot routes for both
candidates and two combined document shapes, and does not measure timing. It
uses independently seeded but logically equivalent fixture states; independent
scaling dimensions, comprehensive malformed-state/error-order equivalence,
concurrent position semantics, and end-to-end cost measurements remain open.

The paired editor-projection suite also compares stateful decoder call sequences
and a decoder failure on the second retained placement during reads and position
creation and resolution. It compares failures for one malformed unrelated opaque
Origin after native load or merge, and checks that failed reads do not change
encoded state. A shared native genesis and authored concurrent branches allow
comparison of position outcomes across merge, reload, replacement, deletion and
restore within each candidate. The restored-position checks compare returned
values or errors; they do not select a cross-carrier position policy. In the
current Automerge fixture, resolving a pre-replacement anchor after restoring the
payload can throw a native cursor error. This is an observed limitation, not a
qualified product behavior. Other malformed state and operation sequences remain
uncovered.
