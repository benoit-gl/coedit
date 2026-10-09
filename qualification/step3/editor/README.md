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
submit new semantic operations; they never rewind carrier state. The current
qualification prototype explicitly refuses an inverse against a changed base,
rather than silently deleting concurrent edits. This refusal is evidence to
inform later undo policy, not a frozen product rule.

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

**Still required for Merge 7:** Real Tiptap/ProseMirror transaction translation;
native carrier-position/cursor qualification; browser integration for IME,
clipboard, mount/unmount, and editor-position behavior; cross-platform full
repository checks; and an independent fresh review. No PR convergence or
qualification is claimed by the files in this directory alone.
