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
submit new semantic operations; they never rewind carrier state. Empty insertion
at a collapsed selection is ignored by the editor; both candidate carriers
reject an empty fine-grained insertion command.

For a pure text insertion, the qualification decision is to retain a
candidate-native anchor attached to the first inserted character and the
expected inserted native text. Undo resolves that anchor against the current
carrier state and derives the candidate range from the expected text length. It
deletes the range only when it still contains that exact text; it intentionally
does not require
the original Origin or an unchanged whole-document frontier. Edits before the
range therefore reconcile its position, while changed or ambiguous content
refuses the undo. This is a qualification policy for inserted text, not yet a
final policy for deletion, replacement, grouping, or product History. A redo
creates fresh carrier identities and therefore refreshes those boundary anchors
before a later undo. The mounted adapter retains ordered edits at actual ProseMirror transaction
coordinates instead of reconstructing operations from final text. Undo/redo
replay those exact operations, preserving untouched carrier text identity.
Whole-buffer comparison validates the result, not the edit positions.

`prosemirrorAdapter.ts` uses a flat, direct ProseMirror schema for one active
allowlisted InlineContent. It turns a committed document-changing transaction
into the same integrated semantic-change seam. Selections and marks remain
transient; inserted text receives the adapter's trusted Origin while unchanged
text keeps its exact Origin. This is qualification-only adapter evidence, not a
production editor binding.

`clipboard.ts` tests a **candidate** private JSON text fragment with a
`formatVersion`, source document/reference, and attributed text spans. Private
input is always untrusted. It preserves Origin only for a same-document source
whose Origin references match the target document's Origin catalog. The
fragment is self-contained: no private receipt, copy registry, or originating
editor session is needed to paste it, including after restart or transfer to
another instance of the same document. The source reference must identify
durable document data, not a transient process-local token. It records
derivation only when the receiving document can resolve the source against
retained state; an unresolved source claim is omitted without discarding
separately validated same-document Origin. This is not authenticated authorship.
Malformed, cross-document, unknown-Origin, or fixture-over-capacity fragments
fall back to ordinary
supplied plain text with imported/unknown Origin. The limits are
explicit fixture inputs, not selected production acceptance numbers. HTML
interpretation is outside this contract.

The common tests run both pinned carriers and exercise the existing integrated
semantic change seam, IME publication, semantic undo/redo, cut/copy/paste,
origin preservation, hostile input fallback, and candidate reload.
`nativeCursor.test.ts` separately characterizes the pinned native cursor
primitives through insertion and reload, without selecting a carrier or
claiming an integrated carrier-position interface.

The mounted adapter requires an explicit imported/unknown Origin for ordinary
paste, even when private clipboard support is absent. Cut copies plain text
before deleting and does not delete when that clipboard write is unavailable.
Copy and cut refuse an unfinished IME composition, including its deferred final
publication, without writing clipboard data or deleting transient text. Selection
coordinates in that state must not be applied to older canonical content.

The production DocumentEngine already specifies asynchronous commands with
expected-Version checks. Step 11 must synchronize pending local editor commands
and use one version-consistent selection/text/Origin projection for clipboard
work, or refuse the action if the browser event cannot safely wait. This does
not require remote-merge suspension; whether to buffer inbound remote changes
across an asynchronous Cut remains a Step 11 design question.

The separate Chromium suite mounts and unmounts the direct adapter against both
candidate carriers. It exercises browser typing, IME composition, cut/paste,
and candidate-native insertion anchors through that path. The suite uses
synthetic DOM composition and clipboard events; it does not claim OS-level
IME or clipboard automation. It intentionally keeps detailed carrier and
transaction assertions in the lower-cost Node suite.

**Still required for Merge 7:** Cross-platform full repository checks and an
independent fresh review. No PR convergence or qualification is claimed by the
files in this directory alone.
