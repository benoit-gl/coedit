# Document-engine MVP contract

**Status:** Accepted prototype contract.

This document defines what the Coedit MVP must prove. The MVP is a **document-engine prototype**, not a complete collaborative writing product.

Detailed implementation rules are in [`MVP_IMPLEMENTATION_SPEC.md`](MVP_IMPLEMENTATION_SPEC.md). Domain meaning remains in [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md). Public authority boundaries remain in [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md). Attributed text is specified in [`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md). Markdown interchange is specified in [`MARKDOWN_INTERCHANGE.md`](MARKDOWN_INTERCHANGE.md). Lossless recovery is specified in [`PORTABLE_DOCUMENT_FORMAT.md`](PORTABLE_DOCUMENT_FORMAT.md). Browser persistence is specified in [`BROWSER_PERSISTENCE.md`](BROWSER_PERSISTENCE.md). Implementation order remains in [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md).

## 1. Purpose

The MVP must prove that Coedit can support one durable structured document through a headless document engine with clear authority, exact History, attributed collaborative rich text, deterministic projections, reversible Markdown interchange for imported documents, incremental browser durability, and lossless `.coedit` recovery.

The prototype must make later AI and collaboration work possible without implementing those systems now.

## 2. In scope

The MVP must provide these capabilities:

1. Create a blank document.
2. Import a realistic Markdown document with diagnostics.
3. Inspect the resulting Block tree and InlineContents.
4. Edit headings, prose, and list items.
5. Create, move, nest, reorder, and delete Blocks.
6. Create, select, reorder, tag, and delete InlineContents.
7. Edit canonical collaborative text, intrinsic formatting, and protected Origin through the engine command boundary.
8. Use optional content-selection lenses, including a summary convention.
9. List and summarize durable Contributions.
10. Inspect an exact historical Version read-only.
11. Restore a historical Version through a new attributed Contribution.
12. Create a semantic Checkpoint of the current Version through a new attributed Contribution.
13. List Checkpoint Contributions and materialize any Checkpoint Version exactly.
14. Compare the live Version with an exact historical or Checkpoint Version.
15. Export a selected Version, lens, or subtree to Markdown with diagnostics.
16. Re-import exported Markdown from the canonical Markdown-representable subset to an equivalent normalized Coedit document.
17. Save a lossless opaque `.coedit` document.
18. Reopen that `.coedit` document with equivalent current state and History.
19. Persist documents incrementally in browser storage and survive a browser reload.
20. Qualify the selected collaborative-content carrier against the accepted formatting, Origin, clipboard, comment-target-feasibility, convergence, and growth suite before freezing carrier-dependent implementation or `.coedit` version 1.

## 3. Out of scope

The MVP does not require:

- an AI provider or AI user experience;
- networked multi-user collaboration;
- presence, remote cursors, or typing indicators;
- provenance visualization, analytics, authenticated identity, retention controls, or signed claims beyond the minimum Origin carrier;
- comments or durable discussions;
- post-genesis AI or automation Contributor registration;
- attachments;
- Tauri or another native shell;
- Rust;
- SQLite or another permanent database choice;
- a final History compaction or retention design;
- a final replicated-tree algorithm; or
- a final product UI design.

Future AI work treats AI as an additional contributor. AI must query explicit Versions and use the same attributed command boundary as other clients.

## 4. Required architecture properties

### 4.1 One document authority

The headless `DocumentEngine` is the only authority for durable document state, validation, History, exact materialization, and portable serialization.

React components, editors, importers, renderers, and storage adapters do not mutate private document state directly.

### 4.2 One durable mutation path

Every client-originated durable mutation enters through the asynchronous engine command boundary.

A successful command creates one attributed Contribution and one resulting Version. A failed command publishes no partial state.

### 4.3 Opaque public Versions

Clients treat `VersionToken` as an opaque, document-scoped equality token. Clients do not decode or order it and do not depend on a numeric revision, one permanent head, or one parent.

### 4.4 Exact query correlation

A query that returns document state also returns the VersionToken for that state. An edit derived from the query uses that token as its expected base.

The UX must not perform a separate version read and assume that the two reads are atomic.

### 4.5 First-class History

Every retained Contribution can be listed and summarized without requiring the frontend to read private storage.

Every advertised retained Version can be materialized exactly and read-only.

Restore appends a new Contribution. Restore does not rewind or delete History.

### 4.6 Checkpoints are semantic Contributions

A **Checkpoint** is a first-class, attributed durable interaction. Creating a Checkpoint appends one Checkpoint Contribution and produces one new Version whose document material is identical to its base Version.

A Checkpoint does not mean final, published, approved, or immutable. A document can have zero or many Checkpoints.

Semantic editor groups and physical recovery checkpoints are not semantic Checkpoints. They can support History presentation or storage recovery without redefining this concept.

### 4.7 Canonical attributed rich text

Each InlineContent owns one canonical CollaborativeContent state containing text, hard breaks, intrinsic formatting marks, and protected Origin attribution. HTML, plain text, ProseMirror JSON, and attribution runs are derived representations.

Formatting has explicit insertion-boundary behavior. Every live text item and hard break has exactly one Origin; new Origin is assigned by the trusted engine/import boundary and never inherited from neighboring text. Formatting commands cannot erase or rewrite Origin.

Origin identifies who or what created the material. The Contribution identifies who performed the operation in this document. Copy and restore preserve Origin while recording the copy/restore actor and source/derivation separately.

A live editor can hold transient adapter state, but canonical text, formatting, Origin, and Contribution effects become durable only through an engine command. Detailed behavior belongs to `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`.

### 4.8 Lossless portable recovery

Within documented limits, the `.coedit` document contains enough information to reopen the document with equivalent current attributed content, retained History and derivation, stable advertised Version identities, and command-idempotency behavior.

Markdown is not the native recovery format.

### 4.9 Durable and transient state stay separate

Selection, focus, disclosure, active lens, dialogs, editor composition state, retry UI, and similar interaction state are not product History unless a later feature explicitly makes them durable.

## 5. Required domain properties

The prototype must preserve these domain rules:

- one recursive Block type is the structural ontology;
- one real root Block exists and cannot be moved or deleted;
- Blocks and InlineContents have stable, non-reused identities;
- each InlineContent belongs to exactly one Block;
- each InlineContent owns canonical CollaborativeContent with intrinsic formatting and protected Origin;
- Block and InlineContent tags have independent ownership;
- `childrenPresentation` belongs to the parent;
- contentless non-root Blocks are transparent grouping containers;
- heading, prose, and list-item presentation comes from structural context;
- a Block can contain zero, one, or several InlineContents;
- several InlineContents are optional, not mandatory;
- current entities do not use lifecycle timestamps or tombstones as product fields;
- earlier working and checkpointed states live in History; and
- historical materializations are detached and read-only.

`PRODUCT_DOMAIN_MODEL.md` is authoritative when this summary is insufficient.

## 6. Required end-to-end proof scenarios

### Scenario A — Import and inspect

Given a realistic Markdown fixture, the importer either produces one valid document with stable diagnostics or rejects the input with an actionable error. It must not silently discard unsupported source material.

The browser can render and inspect the resulting Block tree through engine queries only.

### Scenario B — Edit through the engine

A user can reorganize an imported document and edit rich inline content. Every durable structural, text, or formatting change uses an attributed command.

New text receives the correct human/imported/unknown Origin. Clearing formatting preserves Origin. Same-document internal paste preserves source Origin while recording the paster; external paste does not import private Origin or falsely claim authorship.

Durable commits happen promptly and can share a semantic group for History presentation. A failed or stale commit leaves canonical state unchanged and retains a recoverable UI draft or an explicit retry/discard path.

### Scenario C — History, Checkpoints, and restore

After several structural and text changes, the user can list History, inspect an earlier Version read-only, create a Checkpoint, restore an earlier Version, and continue editing.

The Checkpoint appears as one attributed Contribution and creates a new content-identical Version. Its resulting VersionToken remains available through History and can be materialized exactly.

The restore appears as a new Contribution attributed to the restoring actor. Reinserted historical material receives new private carrier identities while preserving its historical Origin. Earlier History and Checkpoints remain intact.

### Scenario D — Optional contents and lenses

A document that normally uses one InlineContent can add an optional second InlineContent such as a summary. Lens selection can select it with deterministic fallback rules.

Changing the lens does not mutate the document.

### Scenario E — Reversible Markdown interchange

For every successfully imported Markdown fixture, the implementation proves:

```text
Markdown A -> Coedit X -> Markdown B -> Coedit Y
```

`X` and `Y` must be equivalent under the normalized structural and semantic equivalence rules in `MARKDOWN_INTERCHANGE.md`.

`Markdown A` and `Markdown B` do not need textual equality. Canonical export spelling is allowed.

If an arbitrary edited Coedit selection is outside the canonical Markdown-representable subset, export reports stable loss or non-representability diagnostics. The UI does not claim exact Markdown interchange for that selection.

### Scenario F — `.coedit` round trip

A document with realistic content and History can serialize to an opaque `.coedit` artifact and reopen into a candidate engine.

The round trip preserves current and historical behavior, Checkpoint Contributions and Versions, stable advertised VersionTokens, exact text/formatting/Origin state, Contribution actor and derivation, and successful command-idempotency records.

Malformed or unsupported input does not replace the current engine.

### Scenario G — Browser reload

A committed document can be recovered from the engine's incremental IndexedDB repository after reload. Explicit `.coedit` Save/Open remains a separate portable workflow.

A failed repository commit does not report success or publish partial state. Competing browser writers do not silently overwrite each other when their expected durable head differs. Quota or persistence denial is visible and the user has an explicit `.coedit` backup path.

### Scenario H — Headless contract

Core commands, queries, History, Checkpoints, restore, Markdown adapters, and portable serialization run in tests without React, file pickers, or IndexedDB. Pure engine behavior does not depend on UI state.

## 7. Completion rule

The document-engine MVP is complete when all in-scope scenarios pass within documented limits and the browser prototype exposes the vertical slice without violating the engine authority boundary.

Completion does not mean that the product has a provenance explorer, comments, authenticated collaboration, an AI provider, signatures, or a final replicated-tree algorithm. It means their accepted invariants are protected by a tested attributed-content and document-engine foundation instead of UI state or an experimental storage layout.
