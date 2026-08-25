# Coedit document-engine MVP scaffolding plan

**Status:** Accepted implementation plan; Step 0 remains open.

**Target branch:** `main`

**Read-only reference branch:** `tauri-experimental-orphan`

**Recorded reference tip:** `f63ce8f59547dc0d84b5f086301ddaf4ee20a89b`

## 1. Purpose

This document defines the order of work for the Coedit document-engine MVP. It defines work packages, lifecycle phases, decision gates, and completion criteria. It does not define detailed technical contracts.

Use the companion documents for authority:

- [`docs/PRODUCT_DOMAIN_MODEL.md`](docs/PRODUCT_DOMAIN_MODEL.md) defines product ontology and domain vocabulary.
- [`docs/MVP_CONTRACT.md`](docs/MVP_CONTRACT.md) defines what the document-engine MVP must prove.
- [`docs/MVP_ARCHITECTURE.md`](docs/MVP_ARCHITECTURE.md) defines component authority and the public engine boundary.
- [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md) defines concrete private MVP implementation rules that are not owned by a focused specification.
- [`docs/MARKDOWN_INTERCHANGE.md`](docs/MARKDOWN_INTERCHANGE.md) defines Markdown import, export, diagnostics, and round-trip behavior.
- [`docs/PORTABLE_DOCUMENT_FORMAT.md`](docs/PORTABLE_DOCUMENT_FORMAT.md) defines the `.coedit` portable format.
- [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md) defines verification strategy and required evidence.
- [`docs/COLLABORATION_MODEL.md`](docs/COLLABORATION_MODEL.md) defines post-MVP replication and convergence constraints.
- [`docs/PRESERVED_BRANCH_RECONCILIATION.md`](docs/PRESERVED_BRANCH_RECONCILIATION.md) records how preserved decisions and reusable evidence were reconciled. It is supporting traceability, not a competing design authority.

If documents overlap, the document with direct authority for the subject controls.

The complete experimental implementation remains on `tauri-experimental-orphan`. That branch is read-only evidence. It is not an implementation base.

## 2. Planning model

The plan uses a RUP-inspired lifecycle. It does not require the complete Rational Unified Process artifact set. Each implementation step is an iteration that must end in usable and verified evidence.

| Phase | Steps | Purpose |
|---|---:|---|
| Inception | 0 | Reconcile scope, decisions, authority, and known design blockers. |
| Elaboration | 1-6 | Establish executable architecture and retire the main technical risks. |
| Construction | 7-11 | Build and verify the browser vertical slice. |
| Transition and assessment | 12 | Measure the prototype and decide whether new infrastructure is justified. |

Provenance, comments, durable discussions, AI integration, and networked collaboration are post-MVP work. They are not hidden completion criteria for this plan.

Do not implement a later-step subsystem only to prepare for possible future work. Add infrastructure when the current step requires it.

## 3. Working agreement

All implementation work must occur on `main` or on a branch that descends from `main`.

Do not merge, rebase, reset, or commit to `tauri-experimental-orphan`. Inspect it only as evidence and for selectively reusable behavior or tests.

Each implementation step must preserve the Step 0 documentation foundation. If implementation evidence invalidates an accepted rule, update the responsible authoritative document in the same change.

A preserved implementation choice is not automatically current authority. A new design is not accepted merely because it is more convenient. Material conflicts must be resolved explicitly through Step 0 traceability or a later recorded decision.

## 4. Ordered work

### Step 0 — Reconcile the documentation and preserved decisions

**Objective:** Establish one local, internally consistent, and traceable authority set before implementation begins.

The baseline must contain:

- `SCAFFOLDING_PLAN.md`;
- `docs/README.md`;
- `docs/PRODUCT_DOMAIN_MODEL.md`;
- `docs/MVP_CONTRACT.md`;
- `docs/MVP_ARCHITECTURE.md`;
- `docs/MVP_IMPLEMENTATION_SPEC.md`;
- `docs/MARKDOWN_INTERCHANGE.md`;
- `docs/PORTABLE_DOCUMENT_FORMAT.md`;
- `docs/MVP_VERIFICATION_PLAN.md`;
- `docs/COLLABORATION_MODEL.md`; and
- `docs/PRESERVED_BRANCH_RECONCILIATION.md`.

For every material design decision found in the preserved branch, classify it as one of:

- **retained** — the current design keeps the decision;
- **adapted** — the decision remains, with a documented vocabulary or boundary change;
- **superseded** — a current authoritative document deliberately replaces it; or
- **deferred** — the decision is not needed yet and must not be decided accidentally by implementation.

The reconciliation record must identify the current authority for retained, adapted, and superseded decisions. It must also identify any deferred decision that blocks implementation.

The current known blocking decision is the concrete representation and update semantics of the opaque `TextAnchor` used by external formatting ranges. `TextAnchor` remains a domain-level opaque construct until that decision is recorded. Do not infer a Yjs-relative-position, offset, ProseMirror-position, or other representation from implementation convenience.

**Exit gate:**

- an implementer can determine current ontology, MVP proof boundary, public engine authority, focused technical contracts, collaboration constraints, and work order from `main` only;
- material preserved decisions have a traceable classification;
- no authoritative document silently contradicts a retained preserved decision; and
- no unresolved implementation-blocking decision remains.

This documentation PR can establish the Step 0 artifact set, but **Step 0 is not complete until the `TextAnchor` decision is recorded**. Do not begin Step 1 before that gate is closed.

### Step 1 — Establish the browser-only repository scaffold

**Objective:** Create the smallest browser application that proves the build and test toolchain.

**Outcome:** The repository has the browser scaffold, project metadata, ignore rules, a root README, and one minimal page and test.

**Exit gate:** Development, test, and production build paths work. The repository contains no generated tracked files. The root README points to the documentation index.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md) and [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md).

### Step 2 — Implement the pure Block domain

**Objective:** Establish the recursive document structure and pure structural mutation model.

**Outcome:** Tests can build and modify realistic Block trees through typed operations without React, Yjs, storage, or browser dependencies.

**Exit gate:** Structural invariants, identity rules, ordering, limits, and rollback behavior are verified at the domain boundary.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 3 — Implement CollaborativeText and external formatting ranges

**Objective:** Establish canonical collaborative text plus the stable external formatting-range model before History, import, or serialization depends on text representation.

**Outcome:** Headless code can create, validate, project, clone, edit, and serialize collaborative text together with formatting ranges that target opaque `TextAnchor` values.

**Exit gate:** Realistic inline content and formatting work without React UI, DOM storage authority, or parallel HTML authority. The implemented `TextAnchor` design matches the Step 0 decision.

See [`docs/PRODUCT_DOMAIN_MODEL.md`](docs/PRODUCT_DOMAIN_MODEL.md) and [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 4 — Establish first-class in-memory History

**Objective:** Prove attributed Contributions, materializable Versions, semantic checkpoints, restore, idempotency, and version-conflict behavior behind the public engine boundary.

**Outcome:** The headless engine can commit structural and text work, query History, materialize exact Versions, create semantic checkpoints, and restore earlier material.

**Exit gate:** History behavior is verified without React, IndexedDB, or file APIs. Failed or stale commands publish no partial state.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 5 — Implement structured Markdown import

**Objective:** Import realistic CommonMark/GFM through a deterministic parser and operation planner.

**Outcome:** Supported source becomes ordinary attributed document operations. Unsupported source is preserved or rejected with stable diagnostics.

**Exit gate:** The fixture set produces valid documents or explicit failures. No source node is silently discarded. The imported structure is within the canonical Markdown-representable Coedit subset defined by the interchange specification.

See [`docs/MARKDOWN_INTERCHANGE.md`](docs/MARKDOWN_INTERCHANGE.md).

### Step 6 — Implement the lossless `.coedit` portable format

**Objective:** Prove lossless, validated, portable recovery for the capabilities built through Step 5.

**Outcome:** The engine can serialize an opaque `.coedit` artifact and open it into a validated candidate engine.

**Exit gate:** Current and historical material round trip within documented limits. Corrupt, hostile, unsupported, or inconsistent input fails without replacing the active document.

See [`docs/PORTABLE_DOCUMENT_FORMAT.md`](docs/PORTABLE_DOCUMENT_FORMAT.md).

### Step 7 — Build the read-only domain laboratory

**Objective:** Expose executable domain and import behavior in a deliberately plain browser workspace.

**Outcome:** A user can create, import, open, render, navigate, and inspect a document through engine queries only.

**Exit gate:** Realistic samples render from the engine. Diagnostics and the development inspector agree with visible structure.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 8 — Add structural editing

**Objective:** Make document structure editable through engine commands.

**Outcome:** A user can create, move, nest, reorder, delete, tag, and configure Blocks and InlineContents.

**Exit gate:** An imported document can be reorganized substantially. Every durable structural action appears in History. Keyboard and focus behavior are verified.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 9 — Integrate interactive InlineContent editing

**Objective:** Connect one active editor to canonical text and formatting through the engine command boundary while preserving the semantic edit-group policy from the preserved implementation.

**Outcome:** Headings, prose, and list items can be edited in place with attributed durable commits. Physical safety captures can occur inside one human-visible edit group without redefining the semantic History checkpoint concept.

**Exit gate:** Editor ownership transitions do not lose text. Edit-group boundaries, failure recovery, History restore, and `.coedit` round trips preserve exact committed state.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md) and [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md).

### Step 10 — Add lenses, historical comparison, and Markdown export

**Objective:** Prove optional simultaneous content, exact Version projections, and reversible Markdown interchange for imported documents.

**Outcome:** The user can select main or summary content, inspect exact historical Versions, compare Versions, and export a selected Version, lens, or subtree to Markdown.

**Exit gate:** Lens and historical selection create no durable mutation. Markdown output is deterministic. For the canonical Markdown-representable subset, `Markdown A -> Coedit X -> Markdown B -> Coedit Y` yields equivalent normalized Coedit structure and semantic content for `X` and `Y`. Export outside that subset reports stable loss or non-representability diagnostics.

See [`docs/MARKDOWN_INTERCHANGE.md`](docs/MARKDOWN_INTERCHANGE.md).

### Step 11 — Add browser durability

**Objective:** Survive browser reload without making browser storage a second document authority.

**Outcome:** Opaque `.coedit` artifacts can be stored, listed, reopened, and autosaved through browser storage adapters.

**Exit gate:** Reload preserves the document and History. Failed or competing writes do not claim success or silently overwrite newer state.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md) and [`docs/PORTABLE_DOCUMENT_FORMAT.md`](docs/PORTABLE_DOCUMENT_FORMAT.md).

### Step 12 — Reassess persistence and packaging

**Objective:** Use measured prototype evidence to decide whether additional infrastructure is justified.

Assess:

- permanent database needs;
- portable artifact representation and growth;
- History snapshot, delta, and compaction needs;
- native packaging and filesystem needs;
- platform requirements;
- validation placement; and
- attachment and large-asset needs.

**Exit gate:** Each adopted infrastructure change has measured justification and preserves the public engine boundary. Do not add Tauri, Rust, SQL, or another persistence model only to regain parity with the preserved experiment.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

## 5. Phase and risk gates

### Gate A — Step 0 authority baseline

Do not start implementation while an implementation-blocking Step 0 decision is open. At present, the concrete `TextAnchor` representation is that blocker.

### Gate B — Elaboration baseline

Do not treat the architecture as executable until Steps 1-6 pass. At that point the project has a browser scaffold, pure domain, canonical collaborative text and external formatting ranges, first-class History, structured Markdown import, and lossless `.coedit` recovery.

### Gate C — Interactive rich editing

Do not attach the interactive editor before Steps 2-7 are usable. The text/range model, History, import, portable format, and read-only workspace must exist first.

### Gate D — SQL or native packaging

Do not adopt SQL or a native shell before Step 12 measurements show a concrete need. A native shell must wrap the validated application. It must not redefine the document engine.

### Gate E — Networked collaboration

Networked collaboration is post-MVP. Before real clients connect, satisfy the preconditions in [`docs/COLLABORATION_MODEL.md`](docs/COLLABORATION_MODEL.md). The local MVP must not turn its private linear History or storage representation into a public distributed-system contract.

## 6. Post-MVP experiments

After the strict document-engine MVP is complete, separate elaboration work can prototype:

- range provenance;
- comments and durable discussions;
- additional contributor registration workflows, including AI identities;
- AI collaboration through the ordinary engine boundary;
- networked replication; and
- native packaging or database changes justified by Step 12 measurements.

Formatting-range behavior established for the MVP can inform provenance, but provenance must not be smuggled into the MVP through formatting implementation choices.

## 7. MVP completion

The plan is complete when the browser prototype satisfies the MVP contract and all of these conditions are true:

- the browser UX reads and changes durable state only through the asynchronous `DocumentEngine` boundary;
- realistic Markdown can be imported with diagnostics;
- imported Markdown can be exported and re-imported with equivalent normalized Coedit structure and semantic content;
- the recursive Block model is the only structural ontology;
- durable changes are attributed Contributions;
- exact historical Versions, semantic checkpoints, and compensating restore are usable;
- optional InlineContents and content lenses are usable;
- selected Versions, lenses, and subtrees can export to Markdown with explicit diagnostics when exact structural interchange is not possible;
- the opaque `.coedit` artifact provides lossless recovery within its documented limits;
- IndexedDB provides browser reload durability without becoming a second document authority;
- one active rich-text editor preserves canonical CollaborativeText and external formatting ranges;
- semantic edit grouping preserves the accepted batching, transition, failure, and retry rules;
- verification covers data loss, hostile input, corruption, conflicts, History, checkpoints, restore, and interchange round trips;
- current documentation describes the clean-slate application; and
- no deferred infrastructure has been introduced without passing its decision gate.

Completion produces an experimental document-engine foundation. It does not mean that AI, provenance, comments, networked collaboration, native packaging, or a production persistence design is complete.
