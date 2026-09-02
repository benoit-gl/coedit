# Coedit document-engine MVP scaffolding plan

**Status:** Accepted implementation plan; Steps 0-2 are complete and Step 3 carrier qualification is next.

**Target branch:** `main`

**Read-only reference branch:** `tauri-experimental-orphan`

**Recorded reference tip:** `f63ce8f59547dc0d84b5f086301ddaf4ee20a89b`

## 1. Purpose

This document defines the order of work for the Coedit document-engine MVP. It defines work packages, lifecycle phases, decision gates, and completion criteria. It does not define detailed technical contracts.

Use the companion documents for authority:

- [`docs/PRODUCT_DOMAIN_MODEL.md`](docs/PRODUCT_DOMAIN_MODEL.md) defines product ontology and domain vocabulary.
- [`docs/MVP_CONTRACT.md`](docs/MVP_CONTRACT.md) defines what the document-engine MVP must prove.
- [`docs/MVP_ARCHITECTURE.md`](docs/MVP_ARCHITECTURE.md) defines component authority and the public engine boundary.
- [`docs/ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](docs/ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) defines attributed text, clipboard lineage, Range-holder behavior, and carrier qualification.
- [`docs/RANGE_MODEL.md`](docs/RANGE_MODEL.md) defines durable multi-span and positional Range behavior, the Range service boundary, and its staged qualification.
- [`docs/STRUCTURAL_CARRIER_MODEL.md`](docs/STRUCTURAL_CARRIER_MODEL.md) defines Block placement, Block-local carrier state, structural concurrency, and position-order qualification.
- [`docs/CODING_STYLE.md`](docs/CODING_STYLE.md) defines source structure, TSDoc, linting, formatting, command-line interfaces, and developer-platform portability.
- [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md) defines concrete private MVP implementation rules that are not owned by a focused specification.
- [`docs/MARKDOWN_INTERCHANGE.md`](docs/MARKDOWN_INTERCHANGE.md) defines Markdown import, export, diagnostics, and round-trip behavior.
- [`docs/PORTABLE_DOCUMENT_FORMAT.md`](docs/PORTABLE_DOCUMENT_FORMAT.md) defines the `.coedit` portable format.
- [`docs/BROWSER_PERSISTENCE.md`](docs/BROWSER_PERSISTENCE.md) defines incremental browser persistence and recovery.
- [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md) defines verification strategy and required evidence.
- [`docs/COLLABORATION_MODEL.md`](docs/COLLABORATION_MODEL.md) defines post-MVP replication and convergence constraints.
- [`docs/PRESERVED_BRANCH_RECONCILIATION.md`](docs/PRESERVED_BRANCH_RECONCILIATION.md) records how preserved decisions and reusable evidence were reconciled. It is supporting traceability, not a competing design authority.

If documents overlap, the document with direct authority for the subject controls.

The complete experimental implementation remains on `tauri-experimental-orphan`. That branch is read-only evidence. It is not an implementation base.

## 2. Planning model

The plan uses a RUP-inspired lifecycle. It does not require the complete Rational Unified Process artifact set. Each implementation step is an iteration that must end in usable and verified evidence.

| Phase                     | Steps | Purpose                                                                   |
| ------------------------- | ----: | ------------------------------------------------------------------------- |
| Inception                 |     0 | Reconcile scope, decisions, authority, and known design blockers.         |
| Elaboration               |   1-8 | Establish executable architecture and retire the main technical risks.    |
| Construction              |  9-13 | Build and verify the browser vertical slice.                              |
| Transition and assessment |    14 | Measure the prototype and decide whether new infrastructure is justified. |

Minimum protected Origin and lineage invariants are MVP foundation. Provenance visualization/analytics/authentication/signing, comments, durable discussions, AI-provider integration, and networked collaboration are post-MVP work. They are not hidden completion criteria for this plan.

Do not implement a later-step subsystem only to prepare for possible future work. Add infrastructure when the current step requires it.

## 3. Working agreement

All implementation work must occur on `main` or on a branch that descends from `main`.

Do not merge, rebase, reset, or commit to `tauri-experimental-orphan`. Inspect it only as evidence and for selectively reusable behavior or tests.

Each implementation step must preserve the Step 0 documentation foundation. If implementation evidence invalidates an accepted rule, update the responsible authoritative document in the same change.

All implementation and verification commands must preserve the cross-platform contract in `docs/CODING_STYLE.md`. Linux is the future CI environment; Windows remains a required native developer platform, and macOS is an intended supported platform.

A preserved implementation choice is not automatically current authority. A new design is not accepted merely because it is more convenient. Material conflicts must be resolved explicitly through Step 0 traceability or a later recorded decision.

## 4. Ordered work

### Step 0 — Reconcile the documentation and preserved decisions

**Objective:** Establish one local, internally consistent, and traceable authority set before implementation begins.

The baseline must contain:

- `README.md`;
- `SCAFFOLDING_PLAN.md`;
- `docs/README.md`;
- `docs/PRODUCT_DOMAIN_MODEL.md`;
- `docs/MVP_CONTRACT.md`;
- `docs/MVP_ARCHITECTURE.md`;
- `docs/ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`;
- `docs/TEXT_POSITION_MODEL.md`;
- `docs/RANGE_MODEL.md`;
- `docs/STRUCTURAL_CARRIER_MODEL.md`;
- `docs/STRUCTURAL_POSITION_ALLOCATOR.md`;
- `docs/CODING_STYLE.md`;
- `docs/MVP_IMPLEMENTATION_SPEC.md`;
- `docs/MARKDOWN_INTERCHANGE.md`;
- `docs/PORTABLE_DOCUMENT_FORMAT.md`;
- `docs/BROWSER_PERSISTENCE.md`;
- `docs/MVP_VERIFICATION_PLAN.md`;
- `docs/COLLABORATION_MODEL.md`;
- `docs/decisions/README.md` and its accepted ADRs, including
  `docs/decisions/0008-durable-range-semantics.md`; and
- `docs/PRESERVED_BRANCH_RECONCILIATION.md`.

For every material design decision found in the preserved branch, classify it as one of:

- **retained** — the current design keeps the decision;
- **adapted** — the decision remains, with a documented vocabulary or boundary change;
- **superseded** — a current authoritative document deliberately replaces it; or
- **deferred** — the decision is not needed yet and must not be decided accidentally by implementation.

The reconciliation record must identify the current authority for retained, adapted, and superseded decisions. It must also identify any deferred decision that blocks implementation.

The former `TextAnchor` blocker is resolved. Formatting uses native collaborative marks; Origin is protected content-native metadata; future comments and internal links can use the shared durable Range value; ordinary selections are transient. The accepted rationale is recorded in `docs/decisions/0001-collaborative-content-provenance-history.md` and `docs/decisions/0008-durable-range-semantics.md`.

**Exit gate:**

- an implementer can determine current ontology, MVP proof boundary, public engine authority, focused technical contracts, coding/tooling rules, platform requirements, collaboration constraints, and work order from `main` only;
- material preserved decisions have a traceable classification;
- no authoritative document silently contradicts a retained preserved decision; and
- no unresolved implementation-blocking decision remains.

This documentation set establishes the Step 0 authority baseline. Steps 1 and 2 subsequently established the browser scaffold and pure Block domain. PR #9 amends and revalidates Gate A with the durable Range authority and the revised Step 3-and-later sequence. Step 3 carrier qualification is next. Gate B selects the carrier; Gate C later selects the Range representation before `.coedit` version 1 is frozen.

### Step 1 — Establish the browser-only repository scaffold

**Objective:** Create the smallest browser application that proves the build,
test, lint, documentation, formatting, dependency, and cross-platform
command-line toolchain.

**Outcome:** The repository has the browser scaffold, pinned Node.js and pnpm
metadata, npm-based pnpm bootstrap, committed lockfile, ignore and
text-normalization rules, ESLint flat configuration, Prettier,
dependency-cruiser, TSDoc/TypeDoc validation, a root README, and one minimal
documented page and test. Package scripts expose the canonical commands in
`docs/CODING_STYLE.md` without OS-specific wrappers or a global pnpm
prerequisite.

**Exit gate:** A clean checkout completes `npm run bootstrap`, `npm run check`,
and `npm run build` without prompts or tracked-file mutation in one native
Windows environment and one Linux environment. `npm run dev`, `npm run preview`,
and the explicit watch command are the interactive paths. The repository contains no
line-ending-only diffs, shell-specific required scripts, or CI-only build logic,
and it tracks no generated build output. Only a generated contractual fixture or
reviewed API report explicitly required by an authoritative specification may be
tracked. The root README points to the documentation index and accurately lists
the available commands. Record a macOS smoke run when a macOS environment is
available; do not block Step 1 solely because it is not.

There is no CI workflow requirement in Step 1. When CI is introduced, Linux runs
the same bootstrap, check, and build commands.

See [`docs/CODING_STYLE.md`](docs/CODING_STYLE.md),
[`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md), and
[`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md).

### Step 2 — Implement the pure Block domain

**Objective:** Establish the recursive document structure and pure structural mutation model.

**Outcome:** Tests can build and modify realistic Block trees through typed operations without React, Yjs, storage, or browser dependencies. Document/genesis construction creates the one real root outside the structural-operation model. The root has no tags, InlineContents, or child Blocks at genesis. Durable entity UUID text uses one global namespace without type information in the UUID format. InlineContents carry only a typed, opaque, valid empty `InlineContentValue`; structural code does not inspect content internals, and Step 4 expands that same type with the selected attributed-content behavior.

**Exit gate:** Structural invariants, live-identity uniqueness, trusted ID allocation, root construction, empty InlineContent behavior, ordering, limits, and rollback behavior are verified at the domain boundary. Step 2 requires no lifetime-ID registry; History and portable validation later reject durable identity reuse across retained lifetimes.

See [`docs/PRODUCT_DOMAIN_MODEL.md`](docs/PRODUCT_DOMAIN_MODEL.md), [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md), and [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md).

### Step 3 — Qualify collaborative carrier candidates

**Objective:** Compare pinned Yjs v13 and Automerge through the same production-shaped carrier-neutral abstractions before production implementation, History, Range, editor, or portable formats depend on one carrier.

The suite covers canonical text, hard breaks, intrinsic formatting, protected Origin, flat Block placement, liveness, allocator behavior, one transaction across structure and several InlineContents, editor integration, reload, compaction, and representative growth. It also covers the Range-feasibility subset in `RANGE_MODEL.md`: direct multi-span creation, greedy and positional boundaries, structural tracking, lazy resolution, and practical cost.

**Outcome:** The repository contains comparable fixtures, measurements, dependency/license review, adapter-complexity evidence, rejected-candidate rationale, and one recorded carrier selection. Qualification code uses the same abstractions intended for production, but this step does not freeze the final Range API or lineage representation.

**Exit gate:** Gate B passes. Functional invariants are mandatory. Select Yjs when it passes without fragile repair. Select Automerge only when it passes the same suite and materially removes custom machinery despite its integration risk.

See [`docs/ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](docs/ATTRIBUTED_TEXT_AND_ANNOTATIONS.md), [`docs/TEXT_POSITION_MODEL.md`](docs/TEXT_POSITION_MODEL.md), [`docs/RANGE_MODEL.md`](docs/RANGE_MODEL.md), [`docs/STRUCTURAL_CARRIER_MODEL.md`](docs/STRUCTURAL_CARRIER_MODEL.md), [`docs/STRUCTURAL_POSITION_ALLOCATOR.md`](docs/STRUCTURAL_POSITION_ALLOCATOR.md), and [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md).

### Step 4 — Implement the selected collaborative core

**Objective:** Establish the production attributed CollaborativeContent and structural carrier using the winner recorded by Gate B.

**Outcome:** Headless code can create, validate, project, clone, edit, copy/paste, restore, and serialize carrier state. Formatting has explicit boundary policies; every live content item has protected non-inheriting Origin. One logical collaborative document contains the accepted flat Block carrier and Block-local payload namespaces, transacts across structure and several InlineContents, and supports semantic-update-over-delete. The selected carrier suite remains a production regression suite.

**Exit gate:** Production code uses no rejected-candidate or carrier-specific public API. Functional, structural, concurrency, atomicity, clipboard, restore, allocator, reload, compaction, and growth regressions pass for the winner.

### Step 5 — Establish first-class in-memory History

**Objective:** Prove attributed Contributions, materializable Versions, semantic checkpoints, Origin/activity separation, restore, idempotency, and version-conflict behavior behind the public engine boundary.

**Outcome:** The headless engine can commit structural and text work, query History, materialize exact Versions, create semantic checkpoints, and restore earlier material.

**Exit gate:** History behavior is verified without React, IndexedDB, or file APIs. Failed or stale commands publish no partial state. Local restore uses fresh carrier identities, preserves historical Origin, and records the restoring actor and target Version.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 6 — Implement the durable Range service

**Objective:** Finalize and implement the carrier-neutral Range service after the selected carrier and exact Version materialization exist.

Close the remaining creation validation, normalization, resolution-state, split/merge/delete/copy, document-scope, URI, internal-link, and serialization decisions listed in `RANGE_MODEL.md`. Compare the remaining lineage candidates against the accepted behavior and record the selected representation.

**Outcome:** Headless code can create one-span, multi-span, and Positional Ranges; resolve them against an explicit Version; enumerate resolved spans in semantic order; distinguish valid empty results from uncertainty; serialize and parse an absolute URI or document-relative suffix; rebase tracking evidence; and reinject a value as internal-link metadata or another Range holder.

**Exit gate:** Gate C passes. The complete Range suite proves structural behavior, reload, compaction, serialization, internal-link fallback, no silent rebinding, and cost that does not scale with the total retained Range count.

See [`docs/RANGE_MODEL.md`](docs/RANGE_MODEL.md), [`docs/TEXT_POSITION_MODEL.md`](docs/TEXT_POSITION_MODEL.md), and [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md).

### Step 7 — Implement structured Markdown import

**Objective:** Import realistic CommonMark/GFM through a deterministic parser and operation planner.

**Outcome:** Supported source becomes ordinary attributed document operations. Unsupported source is preserved or rejected with stable diagnostics.

**Exit gate:** The fixture set produces valid documents or explicit failures. No source node is silently discarded. The imported structure is within the canonical Markdown-representable Coedit subset defined by the interchange specification.

See [`docs/MARKDOWN_INTERCHANGE.md`](docs/MARKDOWN_INTERCHANGE.md).

### Step 8 — Implement the lossless `.coedit` portable format

**Objective:** Prove lossless, validated, portable recovery for the capabilities built through Step 7.

**Outcome:** After Gates B and C pass, the engine can assemble logical records, carrier chunks, and embedded Range values into an opaque bounded version-1 `.coedit` artifact and open it into a validated candidate engine.

**Exit gate:** Current and historical attributed material, Origins, Contributions, derivation, Checkpoints, embedded Range values, stable VersionTokens, and idempotency round trip within documented limits. Corrupt, hostile, unsupported, missing/mis-hashed, or inconsistent input fails without replacing the active document.

See [`docs/PORTABLE_DOCUMENT_FORMAT.md`](docs/PORTABLE_DOCUMENT_FORMAT.md).

### Step 9 — Build the read-only domain laboratory

**Objective:** Expose executable domain and import behavior in a deliberately plain browser workspace.

**Outcome:** A user can create, import, open, render, navigate, and inspect a document through engine queries only.

**Exit gate:** Realistic samples render from the engine. Diagnostics and the development inspector agree with visible structure.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 10 — Add structural editing

**Objective:** Make document structure editable through engine commands.

**Outcome:** A user can create, move, nest, reorder, delete, tag, and configure Blocks and InlineContents.

**Exit gate:** An imported document can be reorganized substantially. Every durable structural action appears in History. Keyboard and focus behavior are verified.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 11 — Integrate interactive InlineContent editing

**Objective:** Connect one active editor to canonical attributed content through the engine command boundary with prompt durable Contributions and separate human-readable grouping.

**Outcome:** Headings, prose, and list items can be edited in place with attributed durable commits. Several immutable Contributions can share one human-visible semantic group without redefining the semantic History Checkpoint concept.

**Exit gate:** Editor ownership transitions do not lose text, formatting, or Origin. IME and atomic edit paths, prompt commit, semantic grouping, failure retry, internal/external clipboard, History restore, and `.coedit` round trips preserve exact committed state. No two-whole-artifact queue threshold blocks ordinary typing.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md) and [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md).

### Step 12 — Add lenses, historical comparison, and Markdown export

**Objective:** Prove optional simultaneous content, exact Version projections, and reversible Markdown interchange for imported documents.

**Outcome:** The user can select main or summary content, inspect exact historical Versions, compare Versions, and export a selected Version, lens, or subtree to Markdown.

**Exit gate:** Lens and historical selection create no durable mutation. Markdown output is deterministic. For the canonical Markdown-representable subset, `Markdown A -> Coedit X -> Markdown B -> Coedit Y` yields equivalent normalized Coedit structure and semantic content for `X` and `Y`. Export outside that subset reports stable loss or non-representability diagnostics.

See [`docs/MARKDOWN_INTERCHANGE.md`](docs/MARKDOWN_INTERCHANGE.md).

### Step 13 — Add browser durability

**Objective:** Survive browser reload through an incremental engine repository without making browser storage a second semantic authority.

**Outcome:** IndexedDB stores immutable Contribution/effect records, periodic physical recovery checkpoints, command receipts, local descriptors, and a small compare-and-swap head. Explicit `.coedit` Save/Open remains a separate portable workflow.

**Exit gate:** Reload preserves attributed content and History. Failure injection proves atomic record/head publication. Failed, quota-limited, or competing writes do not claim success or silently overwrite newer state; degraded durability and `.coedit` backup are visible.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md) and [`docs/BROWSER_PERSISTENCE.md`](docs/BROWSER_PERSISTENCE.md).

### Step 14 — Reassess persistence and packaging

**Objective:** Use measured prototype evidence to decide whether additional infrastructure is justified.

Assess:

- permanent database needs;
- portable JSON/base64 overhead and possible manifest/binary evolution;
- Contribution/update chunk growth, physical checkpoint cadence, History materialization, and compaction needs;
- native packaging and filesystem needs;
- platform requirements;
- validation placement; and
- attachment and large-asset needs.

**Exit gate:** Each adopted infrastructure change has measured justification and preserves the public engine, repository, and portable contracts. Do not add OPFS, Tauri, Rust, SQL, PGlite, RxDB, or another persistence model only to regain parity with the preserved experiment.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

## 5. Phase and risk gates

### Gate A — Documentation authority baseline

Gate A passes when the authority set, ADR rationale, preserved-branch classifications, and work order are consistent. PR #9 revalidates this gate with the Range authority and revised sequence. Steps 1 and 2 remain complete; no implementation work is repeated.

### Gate B — Collaborative carrier selection

Gate B follows Step 3. Do not begin production carrier implementation or freeze carrier-dependent History effects before the Yjs/Automerge common suite passes and the winner is recorded. The suite includes attributed content, structure, allocator behavior, editor integration, atomicity, performance, and Range feasibility. Gate B does not select the Range-tracking representation.

### Gate C — Durable Range freeze

Gate C follows Step 6. It closes the carrier-neutral Range API, remaining structural and copy behavior, resolution taxonomy, serialization and reinjection rules, internal-link encoding, and lineage representation. Do not freeze `.coedit` version 1 or the internal-link Range wire shape before Gate C passes.

### Gate D — Elaboration baseline

Do not treat the architecture as executable until Steps 1-8 pass. At that point the project has a browser scaffold, pure domain, selected collaborative core, first-class History, a durable Range service, structured Markdown import, and lossless `.coedit` recovery.

### Gate E — Interactive rich editing

Do not attach the interactive editor before Steps 2-10 are usable. The selected carrier, History, Range service, import, portable format, read-only workspace, and structural editing must exist first.

### Gate F — SQL or native packaging

Do not adopt SQL or a native shell before Step 14 measurements show a concrete need. A native shell must wrap the validated application. It must not redefine the document engine.

### Gate G — Networked collaboration

Networked collaboration is post-MVP. Before real clients connect, satisfy the preconditions in [`docs/COLLABORATION_MODEL.md`](docs/COLLABORATION_MODEL.md). The local MVP must not turn its private linear History, Range representation, or storage representation into a public distributed-system contract.

## 6. Post-MVP experiments

After the strict document-engine MVP is complete, use separately gated iterations:

1. provenance visualization/query, retention/anonymization, and authenticated identity;
2. comments and durable discussions with Range targets and explicit repair;
3. an in-process two-engine causal replication bus and causal-restore conflicts;
4. an authenticated relay, durable outbox/inbox, catch-up, and visible sync state;
5. AI collaboration through explicit Versions and typed commands, with software-agent Origin and separate human acceptance;
6. cross-document lineage exchange and private clipboard namespace/trust rules;
7. signed publication/export attestations such as C2PA; and
8. native packaging or a database change only after its own evidence gate.

## 7. MVP completion

The plan is complete when the browser prototype satisfies the MVP contract and all of these conditions are true:

- the browser UX reads and changes durable state only through the asynchronous `DocumentEngine` boundary;
- realistic Markdown can be imported with diagnostics;
- imported Markdown can be exported and re-imported with equivalent normalized Coedit structure and semantic content;
- the recursive Block model is the only structural ontology;
- durable changes are attributed Contributions;
- exact historical Versions, semantic checkpoints, and compensating restore are usable;
- the headless Range service and embedded internal-link Range values pass Gate C;
- optional InlineContents and content lenses are usable;
- selected Versions, lenses, and subtrees can export to Markdown with explicit diagnostics when exact structural interchange is not possible;
- the opaque `.coedit` artifact provides lossless recovery within its documented limits;
- the incremental IndexedDB repository provides browser reload durability without becoming a second semantic authority;
- one active rich-text editor preserves canonical text, intrinsic marks, and protected Origin;
- semantic edit grouping remains separate from prompt durable Contributions and preserves controlled transition, failure, and retry rules;
- verification covers data loss, hostile input, corruption, conflicts, History, checkpoints, restore, and interchange round trips;
- the canonical clean-checkout command sequence succeeds on required Windows and Linux environments, remains macOS-compatible by design, and is the only future Linux CI path;
- current documentation describes the clean-slate application; and
- no deferred infrastructure has been introduced without passing its decision gate.

Completion produces an experimental document-engine foundation. It includes minimum Origin semantics, a durable Range service, and incremental browser durability; it does not mean that AI-provider integration, provenance UI/authentication/signing, Comment records or repair UX, networked collaboration, native packaging, or a final History/Range retention and compaction design is complete.
