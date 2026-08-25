# Coedit document-engine MVP scaffolding plan

**Status:** Accepted implementation plan.

**Target branch:** `main`

**Read-only reference branch:** `tauri-experimental-orphan`

**Recorded reference tip:** `f63ce8f59547dc0d84b5f086301ddaf4ee20a89b`

## 1. Purpose

This document defines the order of work for the Coedit document-engine MVP. It defines work packages, phase gates, and completion criteria. It does not define technical implementation contracts.

Use the companion documents for authority:

- [`docs/PRODUCT_DOMAIN_MODEL.md`](docs/PRODUCT_DOMAIN_MODEL.md) defines the logical product ontology and domain vocabulary.
- [`docs/MVP_CONTRACT.md`](docs/MVP_CONTRACT.md) defines what the document-engine MVP must prove.
- [`docs/MVP_ARCHITECTURE.md`](docs/MVP_ARCHITECTURE.md) defines component authority and the public engine boundary.
- [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md) defines concrete technology choices, private implementation contracts, limits, test rules, and reuse guidance.
- [`docs/COLLABORATION_MODEL.md`](docs/COLLABORATION_MODEL.md) defines post-MVP replication and convergence constraints.

If documents overlap, the document with direct authority for the subject controls. The implementation specification must not override the domain model, MVP contract, public architecture, or collaboration constraints.

The complete experimental implementation remains on `tauri-experimental-orphan`. That branch is read-only evidence. It is not an implementation base.

## 2. Planning model

The plan uses a RUP-inspired lifecycle. It does not require the full Rational Unified Process artifact set. Each step is an iteration that must end in a usable and verified state.

| Phase | Steps | Purpose |
|---|---:|---|
| Inception | 0 | Fix scope, authority, and the documentation baseline. |
| Elaboration | 1-6 | Establish the executable architecture and retire the main technical risks. |
| Construction | 7-12 | Build and verify the browser vertical slice. |
| Transition and assessment | 13 | Measure the prototype and decide whether new infrastructure is justified. |

Do not implement a later-step subsystem only to prepare for possible future work. Add infrastructure when the current step requires it.

## 3. Working agreement

All new implementation work must occur on `main` or on a branch that descends from `main`.

Do not merge, rebase, reset, or commit to `tauri-experimental-orphan`. Inspect it only as evidence and for selective implementation examples. The implementation specification defines the reuse policy.

Each implementation step must preserve the Step 0 documentation foundation. If implementation evidence invalidates an accepted technical rule, update the responsible authoritative document in the same change.

## 4. Ordered work

### Step 0 — Verify the documentation foundation

**Objective:** Establish one local and internally consistent authority set before implementation starts.

The baseline must contain:

- `SCAFFOLDING_PLAN.md`;
- `docs/README.md`;
- `docs/PRODUCT_DOMAIN_MODEL.md`;
- `docs/MVP_CONTRACT.md`;
- `docs/MVP_ARCHITECTURE.md`;
- `docs/MVP_IMPLEMENTATION_SPEC.md`; and
- `docs/COLLABORATION_MODEL.md`.

**Exit gate:** An implementer can determine the product ontology, MVP proof boundary, public engine authority, concrete implementation rules, collaboration constraints, and work order from `main` only. The reference branch is not required to understand current behavior.

Step 0 is complete when this documentation split is merged. Future branches must preserve it.

### Step 1 — Establish the browser-only repository scaffold

**Objective:** Create the smallest browser application that proves the build and test toolchain.

**Outcome:** The repository has the browser scaffold, project metadata, ignore rules, a root README, and one minimal page and test.

**Exit gate:** Development, test, and production build paths work. The repository contains no generated tracked files. The root README points to the documentation index.

See the Step 1 rules in [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 2 — Implement the pure Block domain

**Objective:** Establish the recursive document structure and pure structural mutation model.

**Outcome:** Tests can build and modify realistic Block trees through typed operations without React, Yjs, storage, or browser dependencies.

**Exit gate:** Structural invariants, identity rules, ordering, limits, and rollback behavior are verified at the domain boundary.

See the Step 2 rules in [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 3 — Implement the headless CollaborativeText kernel

**Objective:** Establish one canonical rich-text value before History, import, or serialization depends on text representation.

**Outcome:** Headless code can create, validate, project, clone, update, and compare CollaborativeText values.

**Exit gate:** Realistic inline content works without React, Tiptap UI, DOM, or browser storage. Later steps need no placeholder text representation.

See the Step 3 rules in [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 4 — Establish first-class in-memory History

**Objective:** Prove attributed Contributions, materializable Versions, checkpoints, restore, idempotency, and version conflict behavior behind the public engine boundary.

**Outcome:** The headless engine can commit structural and text work, query History, materialize exact Versions, create checkpoints, and restore earlier material.

**Exit gate:** History behavior is verified without React, IndexedDB, or file APIs. Failed or stale commands publish no partial state.

See the Step 4 rules in [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 5 — Implement structured Markdown import

**Objective:** Import realistic Markdown through a deterministic parser and operation planner.

**Outcome:** Supported source becomes ordinary attributed document operations. Unsupported source is preserved or rejected with stable diagnostics.

**Exit gate:** The fixture set produces valid documents or explicit failures. No source node is silently discarded.

See the Step 5 rules in [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 6 — Define the lossless native interchange format

**Objective:** Prove lossless, validated, portable recovery for the capabilities built through Step 5.

**Outcome:** The engine can serialize an opaque portable artifact and open it into a validated candidate engine.

**Exit gate:** Current and historical material round trip within documented limits. Corrupt, hostile, unsupported, or inconsistent input fails without replacing the active document.

See the Step 6 rules in [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 7 — Build the read-only domain laboratory

**Objective:** Expose the executable domain and import behavior in a deliberately plain browser workspace.

**Outcome:** A user can create, import, open, render, navigate, and inspect a document through engine queries only.

**Exit gate:** Realistic samples render from the engine. Diagnostics and the development inspector agree with the visible structure.

See the Step 7 rules in [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 8 — Add structural editing

**Objective:** Make the document structure editable through engine commands.

**Outcome:** A user can create, move, nest, reorder, delete, tag, and configure Blocks and InlineContents.

**Exit gate:** An imported document can be reorganized substantially. Every durable structural action appears in History. Keyboard and focus behavior are verified.

See the Step 8 rules in [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 9 — Integrate interactive InlineContent editing

**Objective:** Connect one active rich-text editor to canonical CollaborativeText through the engine command boundary.

**Outcome:** Headings, prose, and list items can be edited in place with attributed durable commits.

**Exit gate:** Editor ownership transitions do not lose text. History restore and native round trips preserve exact rich-text state.

See the Step 9 rules in [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 10 — Add lenses, historical comparison, and Markdown export

**Objective:** Prove optional simultaneous content and explicit Version-based projections.

**Outcome:** The user can select main or summary content, inspect exact historical Versions, compare Versions, and export a selected Version, lens, or subtree to Markdown.

**Exit gate:** Lens and historical selection create no durable mutation. Markdown output is deterministic for the supported subset and reports all known loss.

See the Step 10 rules in [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 11 — Add browser durability

**Objective:** Survive browser reload without making browser storage a second document authority.

**Outcome:** Opaque portable artifacts can be stored, listed, reopened, and autosaved through browser storage adapters.

**Exit gate:** Reload preserves the document and History. Failed or competing writes do not claim success or silently overwrite newer state.

See the Step 11 rules in [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 12 — Prototype provenance, comments, and discussions

**Objective:** Test whether the current model can support durable overlays and finer attribution without changing the document spine.

**Outcome:** The prototype exercises contributor registration, sparse provenance anchors, comments, discussions, copy behavior, and restoration behavior.

**Exit gate:** Durable overlays survive History, native portability, and browser reload under an explicit format-compatibility decision.

This step is a prototype and measurement step. It does not finalize production provenance storage.

See the Step 12 rules in [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 13 — Reassess persistence and packaging

**Objective:** Use measured prototype evidence to decide whether additional infrastructure is justified.

Assess:

- permanent database needs;
- portable artifact representation;
- History snapshot, delta, and compaction needs;
- native packaging and filesystem needs;
- platform requirements;
- validation placement; and
- attachment and large-asset needs.

**Exit gate:** Each adopted infrastructure change has measured justification and preserves the public engine boundary. Do not add Tauri, Rust, SQL, or a new persistence model only to regain parity with the preserved experiment.

See the Step 13 decision rules in [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

## 5. Phase and risk gates

### Gate A — Elaboration baseline

Do not treat the architecture as executable until Steps 1-6 pass. At that point the project has a browser scaffold, pure domain, canonical text, first-class History, structured import, and lossless native recovery.

### Gate B — Interactive rich editing

Do not attach the interactive editor before Steps 2-7 are usable. The canonical text model, History, import, native format, and read-only workspace must exist first.

### Gate C — Provenance persistence

Do not finalize provenance storage before Step 12 experiments cover realistic document size, contributor changes, range edits, copy, deletion, restoration, and native round trips.

### Gate D — SQL or native packaging

Do not adopt SQL or a native shell before Step 13 measurements show a concrete need. A native shell must wrap the validated application. It must not redefine the document engine.

### Gate E — Networked collaboration

Networked collaboration is post-MVP. Before real clients connect, satisfy the preconditions in [`docs/COLLABORATION_MODEL.md`](docs/COLLABORATION_MODEL.md). The local MVP must not turn its private linear History or storage representation into a public distributed-system contract.

## 6. MVP scaffolding completion

The scaffolding plan is complete when the browser prototype satisfies the MVP contract and all of these conditions are true:

- the browser UX reads and changes durable state only through the asynchronous `DocumentEngine` boundary;
- realistic Markdown can be imported with diagnostics;
- the recursive Block model is the only structural ontology;
- durable changes are attributed Contributions;
- exact historical Versions, checkpoints, and compensating restore are usable;
- optional InlineContents and content lenses are usable;
- selected Versions, lenses, and subtrees can export to Markdown with loss diagnostics;
- the opaque portable artifact provides lossless recovery within its documented limits;
- IndexedDB provides browser reload durability without becoming a second document authority;
- one active rich-text editor preserves canonical CollaborativeText state;
- tests cover data loss, hostile input, corruption, conflicts, History, checkpoints, and restore;
- current documentation describes the clean-slate application; and
- no deferred infrastructure has been introduced without passing its decision gate.

Completion produces an experimental document-engine foundation. It does not mean that AI, networked collaboration, native packaging, or a production persistence design is complete.
