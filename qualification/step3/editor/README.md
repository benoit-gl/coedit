# Step 3 Merge 7 — application/editor qualification (in progress)

This directory holds qualification-only application-intent and clipboard fixtures.
No code here is a production editor adapter, History API, or selected private
clipboard format. Gate B retains the choice of private fragment guards and
carrier-specific editor-position behavior.

`semanticText.ts` translates one native-string editor action into the existing
integrated structural/payload transaction seam. It preserves fine-grained Origin
for untouched text. Text insertion, deletion, replacement, and attributed private
paste use one carrier change with one qualification actor/effect context. IME
updates remain transient until a complete composition is submitted. Undo and redo
submit new semantic operations; they never rewind carrier state.

For a pure text insertion, the qualification decision is to retain
candidate-native boundary anchors and the expected inserted native text. Undo
resolves those anchors against the current carrier state and deletes the range
only when it still contains that exact text; it intentionally does not require
the original Origin or an unchanged whole-document frontier. Edits before the
range therefore reconcile its position, while changed or ambiguous content
refuses the undo. This is a qualification policy for inserted text, not yet a
final policy for deletion, replacement, grouping, or product History. A redo
creates fresh carrier identities and therefore refreshes those boundary anchors
before a later undo. The mounted adapter takes the insertion coordinates from
the ProseMirror transaction, rather than inferring them from repeated text.

`prosemirrorAdapter.ts` uses a flat, direct ProseMirror schema for one active
allowlisted InlineContent. It turns a committed document-changing transaction
into the same integrated semantic-change seam. Selections and marks remain
transient; inserted text receives the adapter's trusted Origin while unchanged
text keeps its exact Origin. This is qualification-only adapter evidence, not a
production editor binding.

`clipboard.ts` tests a **candidate** private JSON text fragment with a
`formatVersion`, source document/reference, and attributed text spans. Private
input is always untrusted. It preserves Origin only for a same-document source
whose Origin references match the target's trusted Origin catalog. Malformed,
cross-document, unknown-Origin, or fixture-over-capacity fragments fall back to
ordinary supplied plain text with imported/unknown Origin. The limits are
explicit fixture inputs, not selected production acceptance numbers. HTML
interpretation is outside this contract.

The common tests run both pinned carriers and exercise the existing integrated
semantic change seam, IME publication, semantic undo/redo, cut/copy/paste,
origin preservation, hostile input fallback, and candidate reload.
`nativeCursor.test.ts` separately characterizes the pinned native cursor
primitives through insertion and reload, without selecting a carrier or
claiming an integrated carrier-position interface.

The separate Chromium suite mounts and unmounts the direct adapter and confirms
that a native editor edit reaches both carrier candidates. It intentionally keeps
carrier and transaction assertions in the lower-cost Node suite.

**Still required for Merge 7:** Real-browser integration for IME, clipboard,
and editor-position behavior; cross-platform full
repository checks; and an independent fresh review. No PR convergence or
qualification is claimed by the files in this directory alone.
