# Targeted ordinary-edit qualification preflight

Both integrated qualification factories accept an optional third argument:

```ts
{
  ordinaryEditVariant: "targeted";
} // Qualification default.
{
  ordinaryEditVariant: "snapshot";
} // Previous complete-snapshot reference.
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
not a document snapshot cache. The first ordinary change after construction or reload performs the complete reference
projection. A successful ordinary batch preserves that proof because it changes only validated existing text and
adds the same liveness and evidence records as the reference implementation. The next eligible batch can use targeted
projection. This relies on the existing API's private native document and detached snapshot contract; callers cannot
mutate the candidate document behind the adapter. Structural codecs retain their existing deterministic codec contract.

Any fallback change, merge attempt, restore attempt, or rejected prepared change invalidates the proof. A subsequent
ordinary change must again complete the full reference projection. Capturing or materializing historical state does
not alter the projected tip. Snapshot reads neither populate nor invalidate the proof. Targeted lookup failures
fall back to the original validation path and its error ordering.

Load and merge retain their previous validation timing. In particular, malformed unrelated payload Origins accepted
by native loading or merging still cause the next ordinary edit to reject before publishing its effects. They are
not silently ignored by the optimization. Eagerly validating load or merge would move observable failures to different
calls; this experiment deliberately avoids that change. A failed merge also invalidates the proof conservatively.

## Costs and limits

This isolates repeated projection of unrelated payloads, placements, and opaque bytes in warm ordinary-edit sequences.
It does **not** establish constant-time editing, complete independence from document size, or a production performance
budget. In particular:

- The first ordinary edit after load, merge, restore, or fallback still projects the whole document.
- Each touched text and its Origin spans are still fully materialized; batch validation copies the touched map.
- Yjs exact-string preflight still constructs a temporary Y.Doc from the complete touched text for each edit.
- Automerge still validates the complete resulting native string, and native mutation costs remain candidate-specific.
- Liveness checks still enumerate the touched InlineContent's and Block's accumulated tokens; successful real edits
  still append tokens. History length can therefore affect warm edit cost even with a fixed document shape.
- Effect serialization and the native mutation, allocation, causal-evidence and garbage-collection costs remain.

Side-by-side measurement must record the explicit variant, document shape, touched text size, edit history, and whether
an edit is cold after an invalidating operation. Warm-only numbers cannot support a claim about the first edit after
reload or merge. Both retained implementations can be measured from the same candidate-native genesis; encoded bytes
will differ between independently authored runs because replica identity, liveness tokens, and authoring nonces differ.
Compare semantic snapshots, Origins and effect records, not native byte equality across independent runs.

## Verification

`ordinaryEdit.test.ts` pairs reference and targeted carriers within each candidate and compares semantic snapshots,
Origins, effect contexts, and causal payload evidence. It covers sequential multi-payload batches, Unicode rejection,
exact errors and atomicity, duplicate effects, absent and opaque targets, no-op deletions, replacement fallback,
mixed structure/deletion with update-over-delete, historical restore, concurrency, reload, and malformed unrelated
Origins introduced through native load and merge. Snapshot spies establish the cold/warm and replacement-fallback
boundaries. `integratedDocument.test.ts` runs the common foundation suite against both explicit variants and compares
cross-candidate update-over-delete projections. Existing causal-history and retained-Range suites exercise the targeted
qualification default as well. These are semantic and routing tests, not performance thresholds.
