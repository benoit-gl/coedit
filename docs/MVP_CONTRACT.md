# Document-engine MVP contract

**Status:** Accepted prototype contract.

This document defines what the Coedit MVP must prove. The MVP is a **document-engine prototype**, not a complete collaborative writing product.

The contract is intentionally short. Detailed implementation rules remain in [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md). Domain meaning remains in [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md). Public authority boundaries remain in [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md).

## 1. Purpose

The MVP must prove that Coedit can support one durable structured document through a headless document engine with clear authority, exact History, safe rich-text state, deterministic projections, and lossless recovery.

The prototype must make later AI and collaboration work possible without implementing those systems now.

## 2. In scope

The MVP must provide these capabilities:

1. Create a blank document.
2. Import a realistic Markdown document with diagnostics.
3. Inspect the resulting Block tree and InlineContents.
4. Edit headings, prose, and list items.
5. Create, move, nest, reorder, and delete Blocks.
6. Create, select, reorder, tag, and delete InlineContents.
7. Edit canonical rich text through the engine command boundary.
8. Use optional content-selection lenses, including a summary convention.
9. List and summarize durable Contributions.
10. Inspect an exact historical Version read-only.
11. Restore a historical Version through a new attributed Contribution.
12. Mark the current Version as accepted through the defined acceptance command.
13. Compare live and application-selected accepted projections when an accepted Version is available.
14. Export a selected Version, lens, or subtree to Markdown with loss diagnostics.
15. Save a lossless opaque portable document.
16. Reopen that portable document with equivalent current state and History.
17. Persist portable documents in browser storage and survive a browser reload.

## 3. Out of scope

The MVP does not require:

- an AI provider or AI user experience;
- networked multi-user collaboration;
- presence, remote cursors, or typing indicators;
- production fine-grained provenance;
- production comments or durable discussions;
- attachments;
- Tauri or another native shell;
- Rust;
- SQLite or another permanent database choice;
- a final History compaction or retention design;
- a final replicated-tree algorithm; or
- a final product UI design.

Future AI work treats AI as an additional contributor. AI must query explicit Versions and use the same attributed command boundary as other clients.

## 4. Required architecture properties

The prototype passes only if these properties are true:

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

### 4.6 Canonical rich text

Each InlineContent owns one canonical `CollaborativeText` value. HTML and plain text are derived representations.

A live editor can hold transient state, but canonical text changes become durable only through an engine command.

### 4.7 Lossless portable recovery

Within documented limits, the portable document contains enough information to reopen the document with equivalent current state, retained History, stable advertised Version identities, and command-idempotency behavior.

Markdown is not the native recovery format.

### 4.8 Durable and transient state stay separate

Selection, focus, disclosure, active lens, dialogs, editor composition state, retry UI, and similar interaction state are not product History unless a later feature explicitly makes them durable.

## 5. Required domain properties

The prototype must preserve these domain rules:

- one recursive Block type is the structural ontology;
- one real root Block exists and cannot be moved or deleted;
- Blocks and InlineContents have stable, non-reused identities;
- each InlineContent belongs to exactly one Block;
- each InlineContent embeds exactly one CollaborativeText value;
- Block and InlineContent tags have independent ownership;
- `childrenPresentation` belongs to the parent;
- contentless non-root Blocks are transparent grouping containers;
- heading, prose, and list-item presentation comes from structural context;
- a Block can contain zero, one, or several InlineContents;
- several InlineContents are optional, not mandatory;
- current entities do not use lifecycle timestamps or tombstones as product fields;
- earlier working and accepted states normally live in History; and
- historical materializations are detached and read-only.

`PRODUCT_DOMAIN_MODEL.md` is authoritative when this summary is insufficient.

## 6. Required end-to-end proof scenarios

The MVP is not complete until automated tests and the browser prototype prove these scenarios.

### Scenario A — Import and inspect

Given a realistic Markdown fixture, the importer either produces one valid document with stable diagnostics or rejects the input with an actionable error. It must not silently discard unsupported source material.

The browser can render and inspect the resulting Block tree through engine queries only.

### Scenario B — Edit through the engine

A user can reorganize an imported document and edit rich inline content. Every durable structural or text change uses an attributed command.

A failed or stale command leaves canonical state unchanged and retains a recoverable UI draft or an explicit retry/discard path.

### Scenario C — History and restore

After several structural and text changes, the user can list History, inspect an earlier Version read-only, restore it, and continue editing.

The restore appears as a new Contribution. Earlier History remains intact.

### Scenario D — Optional contents and lenses

A document that normally uses one InlineContent can add an optional second InlineContent such as a summary. Lens selection can select it with deterministic fallback rules.

Changing the lens does not mutate the document.

### Scenario E — Export with disclosed loss

A selected Version, lens, or subtree can render to deterministic Markdown for the supported subset.

Any unsupported or normalized construct produces a stable loss diagnostic. The UI does not claim that Markdown is a lossless save.

### Scenario F — Native round trip

A document with realistic content and History can serialize to an opaque portable artifact and reopen into a candidate engine.

The round trip preserves current and historical behavior, stable advertised Version tokens, rich-text state as required by the format contract, and successful command idempotency records.

Malformed or unsupported input does not replace the current engine.

### Scenario G — Browser reload

A committed document can be stored as an opaque portable artifact in IndexedDB and reopened after reload.

A failed save does not report success. Competing browser writers do not silently overwrite each other when their expected saved Version differs.

### Scenario H — Headless contract

Core commands, queries, History, restore, and portable serialization run in tests without React, DOM, file pickers, or IndexedDB.

This scenario proves that the engine boundary is real and is not a wrapper around UI state.

## 7. Completion rule

The document-engine MVP is complete when all in-scope scenarios pass within the documented limits and the browser prototype exposes the vertical slice without violating the engine authority boundary.

Completion does not mean that the product is ready for AI or networked collaboration. It means that those later collaborators can be designed against a tested document engine instead of against UI state or an experimental storage layout.
