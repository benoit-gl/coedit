# Document-engine MVP contract

**Status:** Accepted prototype contract.

This document defines what the Coedit MVP must prove. The MVP is a **document-engine prototype**, not a complete collaborative writing product.

Detailed implementation rules are in [`MVP_IMPLEMENTATION_SPEC.md`](MVP_IMPLEMENTATION_SPEC.md). Domain meaning remains in [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md). Public authority boundaries remain in [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md). Capacity and resource semantics are specified in [`CAPACITY_AND_PERFORMANCE_TARGETS.md`](CAPACITY_AND_PERFORMANCE_TARGETS.md). InlineContent Media Types and universal replacement are specified in [`INLINE_CONTENT_PAYLOADS.md`](INLINE_CONTENT_PAYLOADS.md). Attributed collaborative text is specified in [`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md). Durable text Range behavior is specified in [`RANGE_MODEL.md`](RANGE_MODEL.md). Markdown interchange is specified in [`MARKDOWN_INTERCHANGE.md`](MARKDOWN_INTERCHANGE.md). Lossless recovery is specified in [`PORTABLE_DOCUMENT_FORMAT.md`](PORTABLE_DOCUMENT_FORMAT.md). Browser persistence is specified in [`BROWSER_PERSISTENCE.md`](BROWSER_PERSISTENCE.md). Implementation order remains in [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md).

## 1. Purpose

The MVP must prove that Coedit can support one durable structured document through a headless document engine with clear authority, exact History, typed collaborative InlineContent payloads, attributed collaborative text, durable multi-span and positional text Ranges, deterministic projections, reversible Markdown interchange for imported documents, incremental browser durability, and lossless `.coedit` recovery.

The prototype must make later AI, richer payload types, and collaboration work possible without implementing those systems now.

## 2. In scope

The MVP must provide these capabilities:

1. Create a blank document.
2. Import a realistic Markdown document with diagnostics.
3. Inspect the resulting Block tree and InlineContents.
4. Edit headings, prose, and list items.
5. Create, move, nest, reorder, and delete Blocks.
6. Create, select, reorder, tag, and delete InlineContents.
7. Use Internet Media Types for InlineContent payloads; support `application/vnd.coedit.text` with fine-grained text operations and generic opaque handling for other supported Media Types.
8. Replace the complete content of any InlineContent atomically with explicit Origin behavior and deterministic convergence semantics.
9. Edit canonical `application/vnd.coedit.text`, intrinsic formatting, and protected fine-grained Origin through the engine command boundary.
10. Preserve opaque payload bytes with payload-level Origin; no fine-grained opaque payload editing is required.
11. Use optional content-selection lenses, including a summary convention.
12. List and summarize durable Contributions.
13. Inspect an exact historical Version read-only.
14. Restore a historical Version through a new attributed Contribution.
15. Create a semantic Checkpoint of the current Version through a new attributed Contribution.
16. List Checkpoint Contributions and materialize any Checkpoint Version exactly.
17. Compare the live Version with an exact historical or Checkpoint Version.
18. Export a selected Version, lens, or subtree to Markdown with diagnostics.
19. Re-import exported Markdown from the canonical Markdown-representable subset to an equivalent normalized Coedit document.
20. Save a lossless opaque `.coedit` document.
21. Reopen that `.coedit` document with equivalent current state and History.
22. Persist documents incrementally in browser storage and survive a browser reload.
23. Create one-span, multi-span, and Positional Ranges against current visible `application/vnd.coedit.text`; resolve spans or exact concatenated text against a descendant Version; rationalize them explicitly; serialize and parse them; and embed a Range value as optional internal-link refinement.
24. Qualify Yjs and Automerge against the accepted payload, attributed-text, structure, Range-feasibility, convergence, editor, and growth suite before selecting the production carrier.
25. Select and record the Range-tracking representation before freezing `.coedit` version 1 or the internal-link Range encoding.

## 3. Out of scope

The MVP does not require:

- an AI provider or AI user experience;
- networked multi-user collaboration;
- presence, remote cursors, or typing indicators;
- provenance visualization, analytics, authenticated identity, retention controls, or signed claims beyond the minimum Origin carrier;
- Comment records, durable discussions, or comment repair UX;
- post-genesis AI or automation Contributor registration;
- fine-grained collaborative editing for opaque payload, SVG, image, table, JSON, or other future structured payloads;
- Media Type conversion for an existing InlineContent;
- a generic structured-data CRDT or plugin-dispatched payload system;
- Tauri or another native shell;
- Rust;
- SQLite or another permanent database choice;
- a final physical History compaction strategy;
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

Trusted document construction creates genesis with the initial root and no Contribution. Root construction is not a client structural mutation; the first successful user mutation creates the first Contribution.

### 4.3 Opaque public Versions

Clients treat `VersionToken` as an opaque, document-scoped equality token. Clients do not decode or order it and do not depend on a numeric revision or globally unique Version identifier.

### 4.4 Exact query correlation

A query that returns document state also returns the VersionToken for that state. An edit derived from the query uses that token as its expected base.

The UX must not perform a separate version read and assume that the two reads are atomic.

### 4.5 First-class History

Every Contribution can be listed and summarized without requiring the frontend to read private storage.

Every Version remains exactly materializable and read-only for the lifetime of its document. Private physical snapshots can accelerate materialization without creating product Versions.

Restore appends a new Contribution. Restore does not rewind or delete History.

### 4.6 Checkpoints are semantic Contributions

A **Checkpoint** is a first-class, attributed durable interaction. Creating a Checkpoint appends one Checkpoint Contribution and produces one new Version whose document material is identical to its base Version.

A Checkpoint does not mean final, published, approved, or immutable. A document can have zero or many Checkpoints.

Semantic editor groups and physical recovery checkpoints are not semantic Checkpoints. They can support History presentation or storage recovery without redefining this concept.

### 4.7 Media-Type-labelled collaborative InlineContent payloads

Each InlineContent owns one collaborative payload labelled with an Internet Media Type. `application/vnd.coedit.text` selects the fine-grained collaborative-text capability set; every other supported Media Type initially selects the generic opaque capability set. Block and InlineContent boundaries imply no text character or separator.

Every InlineContent payload supports atomic Media-Type-preserving whole-content replacement with Origin information. A causally later replacement supersedes replacements it observes. Concurrent replacements choose one deterministic current winner without using packet arrival order, local wall-clock time, or an unsynchronized local sequence. Losing replacements remain represented by immutable Contributions and exactly materializable Versions.

The document model does not interpret opaque payload bytes or prescribe application meaning for text characters. Payload-specific contracts decide which fine-grained operations are available.

`application/vnd.coedit.text` contains authored Unicode text, intrinsic formatting marks, and protected fine-grained Origin attribution. It has no document-level `HardBreak` item. Line-feed, carriage-return, and other characters are text data; application/editor/interchange layers decide how to create, normalize, restrict, or present them.

A payload using the generic opaque capability set contains exact bytes and one payload-level Origin for the current value. It has no fine-grained MVP mutation beyond whole-content replacement.

Formatting has explicit insertion-boundary behavior. New fine-grained text Origin is assigned by the trusted engine/import boundary and never inherited from neighboring text. Formatting commands cannot erase or rewrite Origin.

Origin identifies who or what created material. The Contribution identifies who performed the operation in this document. Copy and restore preserve Origin according to the payload contract while recording the copy/restore actor and source/derivation separately.

A live editor can hold transient adapter state, but canonical payload effects become durable only through an engine command. Detailed behavior belongs to `INLINE_CONTENT_PAYLOADS.md` and `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`.

### 4.8 Lossless portable recovery

Within the implementation's actual supported resource capacity, the `.coedit` document contains enough information to reopen the document with equivalent current Media-Type-labelled payloads, complete History and derivation, stable Version identities, text Range creation Versions and lineage, and command-idempotency behavior. A codec capacity failure is explicit and is not a claim that the document is semantically invalid.

Markdown is not the native recovery format.

### 4.9 Durable and transient state stay separate

Selection, focus, disclosure, active lens, dialogs, editor composition state, retry UI, and similar interaction state are not product History unless a later feature explicitly makes them durable.

### 4.10 Durable text Range service

The headless engine creates and resolves document-relative durable Range values for `application/vnd.coedit.text`. Each Range records its document-scoped creation Version and its original Block and InlineContent locations. A Range can contain arbitrarily ordered, overlapping, duplicated, adjacent, sparse, or zero-length Span members, or it can refer to one logical text position. Range is not a canonical entity, has no independent identity, creates no document-wide holder registry, and is not a universal opaque payload locator.

Direct creation fails atomically if any supplied target does not resolve as `application/vnd.coedit.text`. Resolution returns surviving spans in creation and lineage order, skips unresolved members, and can concatenate exact stored text without adding separators. Copy creates no Range lineage. Explicit rationalization can merge only sequential, exactly adjacent spans made adjacent by a lineage merge.

Range serialization is a non-mutating document-relative rebase. Parsing is best-effort and omits unresolved or ambiguous members without speculative rebinding. The application owns any enclosing document URI and selects the document supplied to the Range service. `RANGE_MODEL.md` owns the detailed behavior and the Step 6 decision boundary.

## 5. Required domain properties

The prototype must preserve these domain rules:

- one recursive Block type is the structural ontology;
- one real root Block exists and cannot be moved or deleted;
- trusted code allocates UUID-v4 durable identities and pure reducers never generate them;
- Block and InlineContent identities are unique in live structure, while History and portable validation reject reuse across retained lifetimes;
- each InlineContent belongs to exactly one Block;
- each InlineContent owns one Media-Type-labelled collaborative payload;
- `application/vnd.coedit.text` selects the fine-grained collaborative-text capability set and other supported Media Types initially select the generic opaque capability set;
- every payload can be replaced atomically with explicit Origin behavior;
- concurrent whole-content replacements converge deterministically;
- `application/vnd.coedit.text` owns intrinsic formatting and protected fine-grained Origin;
- generic opaque payload handling preserves exact bytes and payload-level Origin;
- Block and InlineContent tags have independent ownership;
- `childrenPresentation` belongs to the parent;
- contentless non-root Blocks are transparent grouping containers;
- heading, prose, list-item, separator, and opaque payload presentation comes from structural/application context, not implicit payload characters;
- a Block can contain zero, one, or several InlineContents;
- several InlineContents are optional, not mandatory;
- current entities do not use lifecycle timestamps or tombstones as product fields;
- earlier working and checkpointed states live in History;
- historical materializations are detached and read-only;
- a Range is a durable `application/vnd.coedit.text` value and engine service, not a canonical entity or registry; and
- moving Blocks does not reorder the semantic parts of an existing text Range.

`PRODUCT_DOMAIN_MODEL.md` is authoritative when this summary is insufficient.

## 6. Required end-to-end proof scenarios

### Scenario A — Import and inspect

Given a realistic Markdown fixture, the importer either produces one valid document with stable diagnostics or rejects the input with an actionable error. It must not silently discard unsupported source material.

The browser can render and inspect the resulting Block tree through engine queries only.

### Scenario B — Edit through the engine

A user can reorganize an imported document and edit rich `application/vnd.coedit.text`. Every durable structural, text, formatting, or whole-payload replacement uses an attributed command.

New text receives the correct human/imported/unknown Origin. Clearing formatting preserves Origin. Same-document internal paste preserves source Origin while recording the paster; external paste does not import private Origin or falsely claim authorship.

The suite also creates an opaque InlineContent, replaces its bytes with explicit Origin, and proves byte preservation. Whole-content replacement of either Media Type is atomic.

Durable commits happen promptly and can share a semantic group for History presentation. A failed or stale commit leaves canonical state unchanged and retains a recoverable UI draft or an explicit retry/discard path.

### Scenario C — History, Checkpoints, and restore

After several structural, text, opaque-payload replacement, and formatting changes, the user can list History, inspect an earlier Version read-only, create a Checkpoint, restore an earlier Version, and continue editing.

The Checkpoint appears as one attributed Contribution and creates a new content-identical Version. Its resulting VersionToken remains available through History and can be materialized exactly.

The restore appears as a new Contribution attributed to the restoring actor. Reinserted historical text receives new private carrier identities while preserving its historical Origin; restored opaque content preserves its historical payload Origin. Earlier History and Checkpoints remain intact.

### Scenario D — Optional contents and lenses

A document that normally uses one InlineContent can add an optional second InlineContent such as a summary. Lens selection can select it with deterministic fallback rules.

Changing the lens does not mutate the document.

### Scenario E — Reversible Markdown interchange

For every successfully imported Markdown fixture, the implementation proves:

```text
Markdown A -> Coedit X -> Markdown B -> Coedit Y
```

`X` and `Y` must be equivalent under the normalized structural and `application/vnd.coedit.text` semantic equivalence rules in `MARKDOWN_INTERCHANGE.md`.

`Markdown A` and `Markdown B` do not need textual equality. Canonical export spelling is allowed.

If an arbitrary edited Coedit selection is outside the canonical Markdown-representable subset, including an unsupported opaque payload, export reports stable loss or non-representability diagnostics. The UI does not claim exact Markdown interchange for that selection.

### Scenario F — `.coedit` round trip

A document with realistic `application/vnd.coedit.text`, opaque content, and History can serialize to an opaque `.coedit` artifact and reopen into a candidate engine.

The round trip preserves current and historical behavior, Media Types, opaque payload bytes, payload Origins, Checkpoint Contributions and Versions, every stable VersionToken, text Range creation Versions and lineage, exact text/formatting/Origin state, Contribution actor and derivation, and successful command-idempotency records.

Malformed or unsupported input does not replace the current engine.

### Scenario G — Browser reload

A committed document can be recovered from the engine's incremental IndexedDB repository after reload. Explicit `.coedit` Save/Open remains a separate portable workflow.

A failed repository commit does not report success or publish partial state. Competing browser writers do not silently overwrite each other when their expected durable head differs. Quota or persistence denial is visible and the user has an explicit `.coedit` backup path.

### Scenario H — Headless contract

Core commands, queries, History, Checkpoints, restore, Media-Type-labelled payload operations, text Range operations, Markdown adapters, and portable serialization run in tests without React, file pickers, or IndexedDB. Pure engine behavior does not depend on UI state.

### Scenario I — Durable text Range round trip

Create a Span Range directly from several arbitrarily ordered, overlapping, duplicated, adjacent, sparse, and zero-length `application/vnd.coedit.text` spans, and create a separate Positional Range. Reject the complete creation if any supplied target does not resolve in `application/vnd.coedit.text` at the current visible Version. Edit and restructure the selected document so the Span Range resolves across Blocks, changes current span count, and retains creation and lineage order despite current tree order. Verify greedy Span boundaries, zero-length Span behavior, Block-local preceding-stickiness, no continuation through copy, and exact-boundary split without a manufactured zero-length descendant.

Resolve exact text by concatenating surviving spans without inferred separators or deduplication. Stored newline characters remain part of the result; structural boundaries add nothing. Rationalize only merge-caused exact adjacency after an explicit request. Serialize each Range as a document-relative value, parse it best-effort with unresolved or ambiguous members omitted, and resolve the rebased result. Embed a Range value as same-document internal-link refinement, preserve the primary Block fallback, and round trip it and its creation Version through `.coedit`. The application composes external deep links from a document URI and Range fragment. Ordinary edits and Block moves must not scan or rewrite every retained Range value.

### Scenario J — Concurrent whole-payload replacement

From one common Version, create concurrent whole-content replacements of the same `application/vnd.coedit.text` InlineContent and the same opaque InlineContent. After replicas receive the same valid Contributions, both choose the same deterministic current replacement without using wall-clock or delivery order. Then apply a causally later replacement and verify that it supersedes the replacements it observed.

Every replacement Contribution and its resulting Version remains materializable, including losing concurrent replacements.

## 7. Completion rule

The document-engine MVP is complete when all in-scope scenarios pass,
experimental workloads have recorded characterization evidence, every guard
selected by an implemented boundary fails safely, and the browser prototype
exposes the vertical slice without violating the engine authority boundary.
Completion does not create arbitrary product-level size maxima or promote an
experimental target implicitly.

Completion does not mean that the product has a provenance explorer, Comment records or repair UX, authenticated collaboration, an AI provider, signatures, fine-grained non-text collaboration, or a final networked replicated-tree algorithm. It means their accepted invariants are protected by a tested Media-Type-labelled-payload, attributed-text, Range, and document-engine foundation instead of UI state or an experimental storage layout.
