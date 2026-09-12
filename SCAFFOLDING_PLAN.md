# Coedit document-engine MVP scaffolding plan

**Status:** Accepted implementation plan; Steps 0-2 are complete and Step 3 carrier qualification is next.

**Target branch:** `main`

**Read-only reference branch:** `tauri-experimental-orphan`

**Recorded reference tip:** `f63ce8f59547dc0d84b5f086301ddaf4ee20a89b`

## 1. Purpose and authority

This document defines the order of work for the Coedit document-engine MVP. It defines work packages, lifecycle phases, decision gates, and completion criteria. It does not define detailed technical contracts.

Use the companion documents for authority:

- [`docs/PRODUCT_DOMAIN_MODEL.md`](docs/PRODUCT_DOMAIN_MODEL.md) defines product ontology and domain vocabulary.
- [`docs/MVP_CONTRACT.md`](docs/MVP_CONTRACT.md) defines what the document-engine MVP must prove.
- [`docs/MVP_ARCHITECTURE.md`](docs/MVP_ARCHITECTURE.md) defines component authority and the public engine boundary.
- [`docs/CAPACITY_AND_PERFORMANCE_TARGETS.md`](docs/CAPACITY_AND_PERFORMANCE_TARGETS.md) defines cross-cutting capacity, resource, and numeric-ownership rules.
- [`docs/INLINE_CONTENT_PAYLOADS.md`](docs/INLINE_CONTENT_PAYLOADS.md) defines InlineContent Media Types, universal whole-payload replacement, and payload convergence.
- [`docs/ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](docs/ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) defines fine-grained text and attribution behavior, clipboard lineage, Range-holder behavior, and carrier qualification.
- [`docs/RANGE_MODEL.md`](docs/RANGE_MODEL.md) defines durable multi-span and positional fine-grained text Range behavior, the Range service boundary, and its staged qualification.
- [`docs/STRUCTURAL_CARRIER_MODEL.md`](docs/STRUCTURAL_CARRIER_MODEL.md) defines Block placement, Block-local carrier state, structural concurrency, and position-order qualification.
- [`docs/STRUCTURAL_POSITION_ALLOCATOR.md`](docs/STRUCTURAL_POSITION_ALLOCATOR.md) defines the structural position allocator abstraction and candidate qualification.
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

Minimum Origin and lineage invariants are MVP foundation. Provenance visualization/analytics/authentication/signing, comments, durable discussions, AI-provider integration, fine-grained structured-payload collaboration, and networked collaboration are post-MVP work. They are not hidden completion criteria for this plan.

Do not implement a later-step subsystem only to prepare for possible future work. Add infrastructure when the current step requires it.

## 3. Working agreement

All implementation work must occur on a branch that descends from `main` and must enter `main` through a pull request. Do not commit implementation work directly to `main`.

Do not merge, rebase, reset, or commit to `tauri-experimental-orphan`. Inspect it only as evidence and for selectively reusable behavior or tests.

Each implementation step must preserve the Step 0 documentation foundation. If implementation evidence invalidates an accepted rule, update the responsible authoritative document in the same change.

All implementation and verification commands must preserve the cross-platform contract in `docs/CODING_STYLE.md`. Linux is the CI environment; Windows remains a required native developer platform, and macOS is an intended supported platform.

A preserved implementation choice is not automatically current authority. A new design is not accepted merely because it is more convenient. Material conflicts must be resolved explicitly through Step 0 traceability or a later recorded decision.

Capacity and performance statements follow the maturity model in
`docs/CAPACITY_AND_PERFORMANCE_TARGETS.md`. Each affected implementation step
owns its pending selections and cannot close while a hostile-input boundary
introduced by that step lacks a selected, documented, and tested protection
mechanism. A resource-admission selection can instead record, from qualification
evidence, that no additional explicit finite guard is required when the normal
runtime or subsystem behavior already provides a safe atomic failure seam.
Experimental targets produce evidence; they are not correctness gates unless the
responsible authority promotes them.

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
- `docs/CAPACITY_AND_PERFORMANCE_TARGETS.md`;
- `docs/INLINE_CONTENT_PAYLOADS.md`;
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
  `docs/decisions/0009-durable-range-semantics.md` and
  `docs/decisions/0010-typed-inline-content-payloads.md`; and
- `docs/PRESERVED_BRANCH_RECONCILIATION.md`.

For every material design decision found in the preserved branch, classify it as one of:

- **retained** — the current design keeps the decision;
- **adapted** — the decision remains, with a documented vocabulary or boundary change;
- **superseded** — a current authoritative document deliberately replaces it; or
- **deferred** — the decision is not needed yet and must not be decided accidentally by implementation.

The reconciliation record must identify the current authority for retained, adapted, and superseded decisions. It must also identify any deferred decision that blocks implementation.

The former `TextAnchor` blocker is resolved. Formatting and media syntax are application concerns; fine-grained text Origin is protected content-native metadata; opaque payload uses payload-level Origin; applications can store the shared durable fine-grained text Range value in comments, Markdown links, navigation metadata, or other holders; ordinary selections are transient. InlineContent itself owns a Media-Type-labelled payload and is not universally synonymous with rich text. The accepted rationale is recorded in `docs/decisions/0001-collaborative-content-provenance-history.md`, `docs/decisions/0009-durable-range-semantics.md`, and `docs/decisions/0010-typed-inline-content-payloads.md`.

**Exit gate:**

- an implementer can determine current ontology, MVP proof boundary, public engine authority, focused technical contracts, coding/tooling rules, platform requirements, collaboration constraints, and work order from `main` only;
- material preserved decisions have a traceable classification;
- no authoritative document silently contradicts a retained preserved decision; and
- no unresolved implementation-blocking decision remains.

This documentation set establishes and revalidates the Step 0 authority baseline with Media-Type-labelled InlineContent payloads, the durable text Range authority, and the revised Step 3-and-later sequence. Steps 1 and 2 subsequently established the browser scaffold and pure Block domain. Step 3 carrier qualification is next. Gate B selects the carrier, the observable deterministic concurrent-replacement winner rule, the carrier-private implementation of that rule, mixed replacement/text-edit semantics, and payload/carrier resource-admission behavior. Step 4 selects and implements the first raw-media processor capability. Gate C later selects the text Range representation before `.coedit` version 1 is frozen.

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

Step 1 did not require a CI workflow. The current workflow runs the same
bootstrap, check, build, and post-build check commands on Linux.

See [`docs/CODING_STYLE.md`](docs/CODING_STYLE.md),
[`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md), and
[`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md).

### Step 2 — Implement the pure Block domain

**Objective:** Establish the recursive document structure and pure structural mutation model.

**Outcome:** Tests can build and modify realistic Block trees through typed operations without React, Yjs, storage, or browser dependencies. Document/genesis construction creates the one real root outside the structural-operation model. The root has no tags, InlineContents, or child Blocks at genesis. Durable entity UUID text uses one global namespace without type information in the UUID format. InlineContents carry only a typed, opaque, valid empty `InlineContentValue`; structural code does not inspect content internals. Step 4 evolves that opaque boundary into the Media-Type-labelled payload representation without changing completed Step 2 structural ownership or ordering semantics.

**Exit gate:** Structural invariants, live-identity uniqueness, trusted ID allocation, root construction, opaque empty InlineContent behavior, ordering, effectively unbounded Step 2 capacity behavior, and rollback behavior are verified at the domain boundary. Step 2 requires no lifetime-ID registry; History and portable validation later reject durable identity reuse across retained lifetimes.

See [`docs/PRODUCT_DOMAIN_MODEL.md`](docs/PRODUCT_DOMAIN_MODEL.md), [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md), and [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md).

### Step 3 — Qualify collaborative carrier candidates

**Objective:** Compare pinned Yjs v13 and Automerge through the same production-shaped carrier-neutral abstractions before production Media-Type-labelled-payload implementation, History, Range, editor, or portable formats depend on one carrier.

Run the same pinned headless and Tiptap/ProseMirror suite against stable Yjs v13 and Automerge. Track Yjs v14 only after stable release; use Loro as a cursor/movable-tree benchmark, not a current candidate. Before comparing candidates, record one run-specific fixture profile and measurement method used for both. Record dependency/license review, adapter complexity, target devices, measurements, the observable deterministic whole-payload replacement winner rule, its carrier-private implementation, mixed replacement/text-edit semantics, payload/carrier resource-admission behavior, and the selection rationale. Exercise the raw/coarse media boundary with representative test codec fixtures, but do not select the production processor or supported representation profiles in this step.

The suite covers:

- both initial allowlisted fine-grained Media Types, `text/markdown` and `text/plain`, plus representative opaque Media Types including a valid unfamiliar type;
- raw/coarse text conversion through representative test codec fixtures, including exact conversion for a supported representative profile, explicit unsupported-profile failure, and no silent transcoding, relabelling, parameter ignoring, or opaque fallback;
- universal whole-payload replacement;
- deterministic convergence of concurrent whole-payload replacements without wall-clock or arrival-order arbitration;
- exact collaboration for ordinary supported native ECMAScript strings for both allowlisted fine-grained Media Types, plus characterization of carrier behavior for ill-formed string edge cases such as lone surrogates, without promoting those edge cases to portable document invariants;
- protected fine-grained Origin and native-string editing for both allowlisted types;
- exact opaque payload bytes and payload-level Origin;
- resource characterization for fine-grained editing, whole-payload replacement, and representative opaque payloads, including atomic refusal when the selected implementation determines that work is unsafe;
- flat Block placement, liveness, and allocator behavior;
- one transaction across structure and several InlineContents of mixed Media Types;
- application text-editor integration, reload, compaction, and representative growth; and
- the fine-grained text Range-feasibility subset in `RANGE_MODEL.md`: direct multi-span creation, greedy and positional boundaries, structural tracking, lazy resolution, whole-payload replacement of fine-grained text feasibility, and practical cost.

**Outcome:** The repository contains comparable fixtures, measurements, dependency/license review, adapter-complexity evidence, rejected-candidate rationale, the qualified observable replacement winner rule and its private implementation, mixed replacement/text-edit semantics, the payload/carrier resource-admission decision, evidence that raw/coarse media conversion is independent of the carrier, and one recorded carrier selection. Qualification code uses the same abstractions intended for production, but this step does not freeze the final Range API, lineage representation, production raw-media processor, or supported representation profiles.

**Exit gate:** Gate B passes. The common payload, text, structural, concurrency, clipboard, restore, cursor, Range-feasibility, atomicity, portable, garbage-collection, collision/ordering, and representative-growth suite passes. The raw/coarse media boundary proves exact conversion and explicit unsupported-profile behavior through representative fixtures without making a production processor/profile choice. Carrier and private-text-clipboard hostile-input guards are selected from profiling evidence and tested atomically. Payload/carrier resource admission is recorded from qualification evidence; it can use an adaptive host/runtime-dependent mechanism or conclude that no additional explicit finite guard is needed when normal runtime behavior already provides a safe atomic failure seam. Gate B does not require a fixed payload-size maximum. Experimental performance candidates are recorded as evidence rather than correctness thresholds unless deliberately promoted. Functional invariants are mandatory. Select Yjs when its protected carrier works incrementally without fragile repair. Select Automerge only if it passes and materially removes custom machinery despite its integration maturity. Record the winner before carrier-dependent format fields or fixtures are frozen.

See [`docs/INLINE_CONTENT_PAYLOADS.md`](docs/INLINE_CONTENT_PAYLOADS.md), [`docs/ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](docs/ATTRIBUTED_TEXT_AND_ANNOTATIONS.md), [`docs/TEXT_POSITION_MODEL.md`](docs/TEXT_POSITION_MODEL.md), [`docs/RANGE_MODEL.md`](docs/RANGE_MODEL.md), [`docs/STRUCTURAL_CARRIER_MODEL.md`](docs/STRUCTURAL_CARRIER_MODEL.md), [`docs/STRUCTURAL_POSITION_ALLOCATOR.md`](docs/STRUCTURAL_POSITION_ALLOCATOR.md), and [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md).

### Step 4 — Implement the selected collaborative core

**Objective:** Establish the production Media-Type-labelled InlineContent payload and structural carrier using the winner recorded by Gate B.

**Outcome:** Headless code can create, validate, project, clone, replace, edit, copy/paste, restore, and serialize carrier state. Each InlineContent has one valid Media Type. The initial compile-time fine-grained allowlist contains `text/markdown` and `text/plain`; all other valid Media Types use opaque byte handling. Every payload supports whole-payload replacement with explicit Origin and deterministic replicated convergence. Allowlisted text additionally supports native-string fine-grained editing and protected non-inheriting fine-grained Origin. Step 4 selects and qualifies the first production raw-media processor and its supported representation profiles. Unsupported profiles fail explicitly instead of silently changing content, Media Type metadata, or capability class. One logical collaborative document contains the accepted flat Block carrier and Block-local payload namespaces, transacts across structure and several InlineContents, and supports semantic-update-over-delete. The selected carrier suite remains a production regression suite.

**Exit gate:** Production code uses no rejected-candidate or carrier-specific public API. The initial raw-media processor and supported representation profiles are recorded. Functional, payload, raw-media-boundary, structural, concurrency, atomicity, clipboard, restore, allocator, reload, compaction, and growth regressions pass for the winner. Tests prove exact behavior for supported profiles and explicit failure for unsupported profiles or exact-representation failures, without silent content repair, relabelling, transcoding, parameter ignoring, or opaque fallback. No Block or InlineContent boundary implies a textual separator, and no document-level hard-break item exists.

### Step 5 — Establish first-class in-memory History

**Objective:** Prove attributed Contributions, permanently materializable Versions, semantic checkpoints, Origin/activity separation, restore, idempotency, and version-conflict behavior behind the public engine boundary.

**Outcome:** The headless engine can commit structural, fine-grained text, and whole-payload replacement work, query History, materialize every Version exactly for the lifetime of the document, create semantic checkpoints, and restore earlier material. Private physical snapshots can accelerate access without creating product Versions.

**Exit gate:** History behavior is verified without React, IndexedDB, or file APIs. Failed or stale commands publish no partial state. Local restore uses fresh fine-grained text carrier identities where needed, preserves historical text Origin and opaque-payload Origin, and records the restoring actor and target Version.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 6 — Implement the durable fine-grained text Range service

**Objective:** Finalize and implement the carrier-neutral text Range service after the selected carrier and exact Version materialization exist.

Close the remaining result-wrapper, split/merge continuing-identity,
merged-away-reference, deterministic identity tie-break, complete structural
lineage, exact structural boundary, positional structural behavior,
whole-payload replacement of fine-grained text lineage, fragment-encoding, resource-guard, and
Range wire decisions listed in `RANGE_MODEL.md`. Compare the remaining
lineage candidates against the accepted behavior and record the selected
representation. Application holder policy remains outside this service.

**Outcome:** Headless code can create one-span, multi-span, and Positional Ranges against allowlisted fine-grained text in the visible Version; resolve surviving spans in creation and lineage order; concatenate exact stored text without inferred separators; rationalize eligible merge-caused adjacency explicitly; serialize a document-relative Range fragment; parse it best-effort in an application-selected document; rebase tracking evidence; and return a portable Range value that an application can place in its own holder. Generic opaque sub-content is not addressed by this service.

**Exit gate:** Gate C passes. The complete Range suite proves atomic direct text creation, rejection of non-text targets, permissive source-member preservation, structural and no-copy lineage, best-effort omission, exact text assembly, explicit rationalization, reload, compaction with every Version preserved, parse/serialization, application-holder round trip through the public API, no engine reinjection or holder-specific fallback policy, no speculative rebinding, and cost that does not scale with the total retained Range count.

See [`docs/RANGE_MODEL.md`](docs/RANGE_MODEL.md), [`docs/TEXT_POSITION_MODEL.md`](docs/TEXT_POSITION_MODEL.md), and [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md).

### Step 7 — Implement structured Markdown import

**Objective:** Import realistic CommonMark/GFM through a deterministic parser and operation planner.

**Outcome:** Supported source becomes ordinary structural and `text/markdown; charset=UTF-8` fine-grained operations. Structural syntax consumed into Blocks is not duplicated in payload text. Remaining inline Markdown source, including emphasis/link/code delimiters and soft/hard line-break spelling, is preserved literally unless `MARKDOWN_INTERCHANGE.md` explicitly defines a normalization. Unsupported source is preserved or rejected with stable diagnostics. Markdown import does not manufacture opaque payloads or require general charset conversion.

**Exit gate:** The fixture set produces valid documents or explicit failures. No source node is silently discarded. Every imported textual InlineContent uses `text/markdown; charset=UTF-8`. Export/re-import preserves retained inline Markdown source exactly except for explicitly defined normalizations, while deterministic structural spelling may be regenerated. The imported structure is within the canonical Markdown-representable Coedit subset defined by the interchange specification. Parser and importer profiling selects hostile-input guards, records their evidence, distinguishes source-format from capacity failure at the top-level result, and verifies that failed import publishes no candidate.

See [`docs/MARKDOWN_INTERCHANGE.md`](docs/MARKDOWN_INTERCHANGE.md).

### Step 8 — Implement the lossless `.coedit` portable format

**Objective:** Prove lossless, validated, portable recovery for the capabilities built through Step 7.

**Outcome:** After Gates B and C pass, the engine can assemble logical records, Media-Type-labelled payload state, carrier chunks, opaque payload bytes, and required text Range lineage into an opaque version-1 `.coedit` artifact and open it into a validated candidate engine.

**Exit gate:** Current and historical Media Types, allowlisted fine-grained text state, opaque payload bytes, Origins, Contributions, derivation, Checkpoints, required text Range lineage, stable VersionTokens, whole-payload replacement History, and idempotency round trip for the representative fixtures recorded by the qualification run. Profiling covers raw and decoded allocation, collection cardinality, graph work, carrier chunks, opaque-payload chunks, and content size; it selects and records the portable implementation guards before version 1 freezes. Selected guards return explicit capacity failures, and corrupt, hostile, unsupported, missing/mis-hashed, or inconsistent input fails without replacing the active document.

See [`docs/PORTABLE_DOCUMENT_FORMAT.md`](docs/PORTABLE_DOCUMENT_FORMAT.md).

### Step 9 — Build the read-only domain laboratory

**Objective:** Expose executable domain and import behavior in a deliberately plain browser workspace.

**Outcome:** A user can create, import, open, render, navigate, and inspect a document through engine queries only. Rendering is payload-aware and does not infer text separators from structural boundaries.

**Exit gate:** Realistic samples render from the engine. Diagnostics and the development inspector agree with visible structure and Media Types.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 10 — Add structural editing

**Objective:** Make document structure editable through engine commands.

**Outcome:** A user can create, move, nest, reorder, delete, tag, and configure Blocks and InlineContents.

**Exit gate:** An imported document can be reorganized substantially. Every durable structural action appears in History. Keyboard and focus behavior are verified. Structural operations do not manufacture payload text.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

### Step 11 — Integrate interactive InlineContent editing

**Objective:** Connect one active text editor to canonical fine-grained text through the engine command boundary with prompt durable Contributions and separate human-readable grouping.

**Outcome:** Headings, prose, and list items can be edited in place with attributed durable commits. Several immutable Contributions can share one human-visible semantic group without redefining the semantic History Checkpoint concept. The editor/application maps line-break, paragraph, formatting, and link intent into explicit text and/or structural operations; it does not depend on a document hard-break item or engine-owned formatting/link state. Generic opaque payloads remain replaceable through the generic payload boundary but have no text editor requirement.

**Exit gate:** Editor ownership transitions do not lose canonical source text or Origin. IME and atomic edit paths, prompt commit, semantic grouping, failure retry, internal/external clipboard, History restore, and `.coedit` round trips preserve exact committed engine state. Application formatting/link presentation remains derivable from source text and structure. An incompatible opaque payload target is not silently bound to the text editor. No whole-artifact queue threshold blocks ordinary typing.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md) and [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md).

### Step 12 — Add lenses, historical comparison, and Markdown export

**Objective:** Prove optional simultaneous content, exact Version projections, payload-aware rendering, and reversible Markdown interchange for imported text documents.

**Outcome:** The user can select main or summary content, inspect exact historical Versions, compare Versions, and export a selected Version, lens, or subtree to Markdown. The renderer reports stable non-representability when a selected opaque payload or another unsupported payload participates.

**Exit gate:** Lens and historical selection create no durable mutation. Markdown output is deterministic. For the canonical Markdown-representable subset, `Markdown A -> Coedit X -> Markdown B -> Coedit Y` yields equivalent normalized Coedit structure and the same retained inline `text/markdown` source for `X` and `Y`, except for explicit interchange normalizations. Export outside that subset reports stable loss or non-representability diagnostics.

See [`docs/MARKDOWN_INTERCHANGE.md`](docs/MARKDOWN_INTERCHANGE.md).

### Step 13 — Add browser durability

**Objective:** Survive browser reload through an incremental engine repository without making browser storage a second semantic authority.

**Outcome:** IndexedDB stores immutable Contribution/effect records, periodic physical recovery checkpoints, command receipts, local descriptors, and a small compare-and-swap head. Explicit `.coedit` Save/Open remains a separate portable workflow.

**Exit gate:** Reload preserves Media Types, fine-grained text state, opaque payload bytes, Origins, and History. Failure injection proves atomic record/head publication. Recovery profiling selects any required checkpoint, replay, collection, and allocation guards and verifies typed capacity failure without partial open. Failed, quota-limited, or competing writes do not claim success or silently overwrite newer state; degraded durability and `.coedit` backup are visible.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md) and [`docs/BROWSER_PERSISTENCE.md`](docs/BROWSER_PERSISTENCE.md).

### Step 14 — Reassess persistence and packaging

**Objective:** Use measured prototype evidence to decide whether additional infrastructure is justified.

Assess:

- permanent database needs;
- portable JSON/base64 overhead and possible manifest/binary evolution;
- Contribution/update chunk growth, opaque-payload size behavior, physical checkpoint cadence, History materialization, and compaction needs;
- native packaging and filesystem needs;
- platform requirements;
- validation placement; and
- attachment and large-asset needs.

**Exit gate:** Each adopted infrastructure change has measured justification and preserves the public engine, repository, Media-Type-labelled-payload, and portable contracts. Do not add OPFS, Tauri, Rust, SQL, PGlite, RxDB, or another persistence model only to regain parity with the preserved experiment.

See [`docs/MVP_IMPLEMENTATION_SPEC.md`](docs/MVP_IMPLEMENTATION_SPEC.md).

## 5. Phase and risk gates

### Gate A — Documentation authority baseline

Gate A passes when the authority set, ADR rationale, preserved-branch classifications, and work order are consistent. The Media-Type-labelled-payload and Range authorities revalidate this gate. Steps 1 and 2 remain complete; no implementation work is repeated.

### Gate B — Collaborative carrier selection

Gate B follows Step 3. Do not begin production carrier implementation or freeze carrier-dependent History effects, editor integration, or `.coedit` version 1 before the Yjs/Automerge common suite passes and the winner is recorded. The gate includes Media-Type-labelled payloads, whole-payload replacement, deterministic concurrent replacement convergence, attributed allowlisted fine-grained text, opaque payload byte/Origin preservation, raw/coarse media-boundary factoring, payload/carrier resource-admission qualification, structure, allocator behavior, application text-editor integration, atomicity, Range feasibility, one run-specific comparison method, and selected and tested carrier/private-text-clipboard guards. Experimental performance candidates do not become acceptance thresholds merely because the gate measured them. Gate B records the observable deterministic concurrent-replacement winner rule, the carrier-private implementation that realizes it, mixed whole-payload replacement/text-edit semantics, the selected carrier's required text-domain behavior, and the payload/carrier resource-admission behavior. That resource decision can be adaptive and host/runtime-dependent, and an evidence-backed conclusion that no additional explicit finite guard is required is valid. Gate B does not require a fixed payload-size maximum. It does not select the production raw-media processor or supported representation profiles, and it does not select the Range-tracking representation.

Gate B also closes the mixed replacement/text-edit semantics in
`INLINE_CONTENT_PAYLOADS.md` section 10.1. Media Type syntax, parameter preservation,
raw-media boundary separation, and capability matching are already document
semantics; Step 3 proves those boundaries can be implemented independently of the
carrier. Step 4 selects the initial raw-media processor capability and retains the
Step 3 boundary cases as production regressions. This does not move Range lineage
out of Gate C or the network protocol out of the pre-network gate.

### Gate C — Durable Range freeze

Gate C follows Step 6. It closes the carrier-neutral allowlisted fine-grained text Range API result wrappers,
split/merge continuing identities, merged-away-reference behavior, the
deterministic identity rule when no semantic continuation is naturally
designated, complete one-to-many and many-to-one lineage, remaining positional
and exact-boundary structural behavior, whole-payload replacement of fine-grained text lineage,
fragment parsing/serialization, resource-guard behavior, and lineage representation. Application holder storage, link activation, comment repair, and fallback policy remain outside the Range service. Do not freeze `.coedit` version 1 or the portable Range-fragment wire shape before Gate C passes.

### Gate D — Elaboration baseline

Do not treat the architecture as executable until Steps 1-8 pass. At that point the project has a browser scaffold, pure structural domain, selected typed collaborative core, first-class History, a durable allowlisted fine-grained text Range service, structured Markdown import, and lossless `.coedit` recovery.

### Gate E — Interactive rich editing

Do not attach the interactive text editor before Steps 2-10 are usable. The selected carrier, History, text Range service, import, portable format, read-only workspace, and structural editing must exist first. The text editor is an allowlisted fine-grained text adapter, not a universal InlineContent editor.

### Gate F — SQL or native packaging

Do not adopt SQL or a native shell before Step 14 measurements show a concrete need. A native shell must wrap the validated application. It must not redefine the document engine.

### Gate G — Networked collaboration

Networked collaboration is post-MVP. Before real clients connect, satisfy the preconditions in [`docs/COLLABORATION_MODEL.md`](docs/COLLABORATION_MODEL.md). The local MVP must not turn its private linear History, payload-register representation, Range representation, or storage representation into a public distributed-system contract.

## 6. Post-MVP experiments

After the strict document-engine MVP is complete, use separately gated iterations:

1. provenance visualization/query, retention/anonymization, and authenticated identity;
2. comments and durable discussions with text Range targets and explicit repair;
3. an in-process two-engine causal replication bus and causal-restore conflicts;
4. an authenticated relay, durable outbox/inbox, catch-up, and visible sync state;
5. AI collaboration through explicit Versions and typed commands, with software-agent Origin and separate human acceptance;
6. additional payload types and, only when needed, their fine-grained editing or content-local addressing contracts;
7. cross-document lineage exchange and private clipboard namespace/trust rules;
8. signed publication/export attestations such as C2PA; and
9. native packaging or a database change only after its own evidence gate.

## 7. MVP completion

The plan is complete when the browser prototype satisfies the MVP contract and all of these conditions are true:

- the browser UX reads and changes durable state only through the asynchronous `DocumentEngine` boundary;
- realistic Markdown can be imported with diagnostics;
- imported Markdown can be exported and re-imported with equivalent normalized Coedit structure and preserved inline Markdown source except for explicitly defined normalizations;
- the recursive Block model is the only structural ontology;
- each InlineContent has one supported Media-Type-labelled payload and Block/InlineContent boundaries imply no text separator;
- allowlisted fine-grained text and representative opaque Media Types are both represented, preserved, and replaceable through the engine;
- the Step 4-selected raw-media processor supports its documented representation profiles and reports unsupported profiles and exact-representation failures explicitly without silently changing Media Types or repairing content;
- universal whole-payload replacement preserves InlineContent identity, atomically replaces Media Type/content/Origin state, and is qualified for deterministic eventual convergence under the Gate B observable winner rule;
- opaque payload remains opaque and does not require fine-grained collaboration;
- durable changes are attributed Contributions;
- exact historical Versions, semantic checkpoints, and compensating restore are usable;
- the headless allowlisted fine-grained text Range service and required lineage pass Gate C;
- optional InlineContents and content lenses are usable;
- selected Versions, lenses, and subtrees can export to Markdown with explicit diagnostics when exact structural/payload interchange is not possible;
- the opaque `.coedit` artifact provides lossless recovery of Media Types, supported carrier-native ECMAScript strings, opaque payload bytes, Origins, History, and required Range lineage within the selected implementation capacity, and capacity failure does not claim semantic invalidity;
- the incremental IndexedDB repository provides browser reload durability without becoming a second semantic authority;
- one active text editor preserves canonical allowlisted source text and protected fine-grained Origin;
- semantic edit grouping remains separate from prompt durable Contributions and preserves controlled transition, failure, and retry rules;
- verification covers data loss, hostile input, corruption, conflicts, History, checkpoints, replacement convergence, restore, and interchange round trips;
- the canonical clean-checkout command sequence succeeds on required Windows and Linux environments, remains macOS-compatible by design, and is the same path used by Linux CI;
- current documentation describes the clean-slate application; and
- no deferred infrastructure or generalized content framework has been introduced without passing its decision gate.

Completion produces an experimental document-engine foundation. It includes Media-Type-labelled payloads, universal whole-content convergence, minimum Origin semantics, a durable allowlisted fine-grained text Range service, permanent exact Version materialization, and incremental browser durability; it does not mean that AI-provider integration, provenance UI/authentication/signing, Comment records or repair UX, fine-grained non-text collaboration, networked collaboration, native packaging, exhaustive raw-media profile support, or a final physical History/Range compaction strategy is complete.
