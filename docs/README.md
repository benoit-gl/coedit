# Coedit documentation

These documents describe the clean-slate application on `main`. Each document has one primary authority. This split keeps product meaning, MVP scope, architecture, focused technical contracts, verification, work order, and future replication separate.

## Current authoritative documents

| Document                                                                   | Authority                                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md)                       | Logical product ontology and domain vocabulary                                                                           |
| [`MVP_CONTRACT.md`](MVP_CONTRACT.md)                                       | Required proof boundary for the document-engine MVP                                                                      |
| [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md)                               | Component authority, public engine behavior, and adapter workflows                                                       |
| [`CAPACITY_AND_PERFORMANCE_TARGETS.md`](CAPACITY_AND_PERFORMANCE_TARGETS.md) | Cross-cutting interpretation and revision of provisional capacity and performance targets                               |
| [`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) | Intrinsic formatting, origin attribution, clipboard lineage, comment targets, and carrier qualification                  |
| [`TEXT_POSITION_MODEL.md`](TEXT_POSITION_MODEL.md)                         | Unicode text, transient editor coordinates, durable stable text positions, and range portability                         |
| [`STRUCTURAL_CARRIER_MODEL.md`](STRUCTURAL_CARRIER_MODEL.md)               | Step 3 flat Block placement, tree projection, structural concurrency policy, and position-order qualification            |
| [`STRUCTURAL_POSITION_ALLOCATOR.md`](STRUCTURAL_POSITION_ALLOCATOR.md)     | Production dense-order allocator abstraction, collision tolerance, characterization, and algorithm selection             |
| [`CODING_STYLE.md`](CODING_STYLE.md)                                       | Source structure, as-implemented TSDoc, lint/format/dependency tooling, command-line interface, and platform portability |
| [`MVP_IMPLEMENTATION_SPEC.md`](MVP_IMPLEMENTATION_SPEC.md)                 | Private MVP implementation rules that are not owned by a focused specification                                           |
| [`MARKDOWN_INTERCHANGE.md`](MARKDOWN_INTERCHANGE.md)                       | Markdown import, export, diagnostics, and normalized round-trip behavior                                                 |
| [`PORTABLE_DOCUMENT_FORMAT.md`](PORTABLE_DOCUMENT_FORMAT.md)               | Lossless `.coedit` logical recovery contract, gated version-1 container, and hostile-input validation                    |
| [`BROWSER_PERSISTENCE.md`](BROWSER_PERSISTENCE.md)                         | Incremental IndexedDB repository, recovery, multi-tab, quota, and backup behavior                                        |
| [`MVP_VERIFICATION_PLAN.md`](MVP_VERIFICATION_PLAN.md)                     | MVP test strategy, risk coverage, and qualification evidence                                                             |
| [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md)                         | Post-MVP replication, convergence, and causal History direction                                                          |
| [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md)                         | RUP-inspired work order, phase gates, and completion criteria                                                            |

All current design authority is local to `main`.

[`PRESERVED_BRANCH_RECONCILIATION.md`](PRESERVED_BRANCH_RECONCILIATION.md) is a supporting traceability record. It classifies material decisions from `tauri-experimental-orphan` as retained, adapted, superseded, or deferred. It also identifies selectively reusable code and tests. It is not a competing design authority.

[`decisions/`](decisions/README.md) contains architecture decision records. An ADR preserves context, alternatives, and rationale; it does not override the direct authority listed above.

## Authority rules

Use the document with direct authority for the subject.

- A private implementation type does not override `MVP_ARCHITECTURE.md`.
- A codec or storage detail does not override `PRODUCT_DOMAIN_MODEL.md`.
- A focused Markdown or `.coedit` specification overrides duplicated technical wording elsewhere.
- `CAPACITY_AND_PERFORMANCE_TARGETS.md` controls whether a numeric value is a semantic invariant, a minimum implementation envelope, a hostile-input resource guard, or a qualification/performance target.
- `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` owns detailed attributed-text behavior; `TEXT_POSITION_MODEL.md` owns text-coordinate and durable-position boundaries; `STRUCTURAL_CARRIER_MODEL.md` owns Step 3 Block placement and structural carrier qualification; `STRUCTURAL_POSITION_ALLOCATOR.md` owns the production allocator abstraction and allocator-algorithm qualification; `BROWSER_PERSISTENCE.md` owns browser repository behavior.
- `CODING_STYLE.md` owns source-level documentation, linting, formatting, architectural dependency checks, package commands, and developer-platform portability.
- `MVP_IMPLEMENTATION_SPEC.md` does not expand `MVP_CONTRACT.md`.
- `SCAFFOLDING_PLAN.md` owns order and gates, not detailed technical behavior.
- Local MVP shortcuts do not override `COLLABORATION_MODEL.md`.

When implementation evidence invalidates an accepted rule, update the responsible authority in the same change.

## Current implementation status

The documentation authority, coding/tooling agreement, and preserved-decision reconciliation required by Step 0 are complete. Formatting is intrinsic collaborative metadata, origin provenance is protected content-native metadata, comments use explicit external targets, and ordinary selections remain transient. There is no general-purpose `TextAnchor` prerequisite for formatting or provenance.

Steps 1 and 2 are implemented. Step 2 provides the pure recursive Block domain, typed structural operations, tag normalization, live structural validation, atomic operation groups, trusted Web Crypto UUID allocation outside the domain, and the typed opaque empty `InlineContentValue`. The genesis factory creates exactly one real root with no tags, no InlineContents, and no child Blocks. Application code adds any authored starter content after genesis through ordinary operations.

Durable user-created and domain entity UUID text uses one global namespace. The same UUID text cannot identify two different live durable entities, even across different branded TypeScript ID types. UUID text contains no required type discriminator. Step 2 keeps no lifetime-ID registry; History and portable validation later reject durable identity reuse across retained lifetimes. [`decisions/0002-global-durable-identity-and-empty-genesis-root.md`](decisions/0002-global-durable-identity-and-empty-genesis-root.md) records the accepted rationale.

Step 3 is the next implementation step. The structural carrier direction is explicit: use one logical placement per `BlockId`, with atomic position and depth, and project the recursive tree deterministically from global preorder plus depth. Semantic Block updates use a carrier-qualified liveness effect so a concurrent move or payload update can beat deletion of that Block. The liveness effect must participate at the Block existence-conflict boundary; a nested-only activity mutation is not sufficient when an enclosing delete can discard it. The dense-order allocator is a replaceable production-engine abstraction. The engine must tolerate primary-position collisions even when normal allocation prevents them. The concrete allocator algorithm, liveness encoding, and non-interleaving run behavior remain Step 3 qualification choices. [`STRUCTURAL_CARRIER_MODEL.md`](STRUCTURAL_CARRIER_MODEL.md) and [`STRUCTURAL_POSITION_ALLOCATOR.md`](STRUCTURAL_POSITION_ALLOCATOR.md) are the direct authorities. [`decisions/0003-flat-structural-placement.md`](decisions/0003-flat-structural-placement.md) and [`decisions/0007-structural-position-allocator-abstraction.md`](decisions/0007-structural-position-allocator-abstraction.md) record the rationale.

Collaborative text does not use one universal numeric character coordinate. Canonical text does not prescribe UTF-8 or UTF-16 storage. The editor owns transient editing positions and normal Unicode selection behavior. Durable live ranges use opaque carrier-stable positions, while portable recovery retains carrier-neutral structural and quote/context evidence. [`TEXT_POSITION_MODEL.md`](TEXT_POSITION_MODEL.md) is the direct authority, and [`decisions/0006-text-position-ownership.md`](decisions/0006-text-position-ownership.md) records the rationale.

Before carrier-dependent CollaborativeContent, History encoding, editor integration, or `.coedit` version 1 is frozen, the Elaboration carrier gate must qualify pinned Yjs v13 against Automerge using the common behavioral suite in [`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md), [`TEXT_POSITION_MODEL.md`](TEXT_POSITION_MODEL.md), [`STRUCTURAL_CARRIER_MODEL.md`](STRUCTURAL_CARRIER_MODEL.md), [`STRUCTURAL_POSITION_ALLOCATOR.md`](STRUCTURAL_POSITION_ALLOCATOR.md), and [`MVP_VERIFICATION_PLAN.md`](MVP_VERIFICATION_PLAN.md). Allocator candidates must use the same production abstraction during qualification, and the evidence plus final selection must be persisted. This is a bounded implementation-selection gate, not an open product-domain question.

Step 1 established the OS-neutral npm package-command interface and tooling in
[`CODING_STYLE.md`](CODING_STYLE.md). npm bootstraps the pinned pnpm version, so
no global pnpm installation is required. Native Windows and Linux command-line
builds are required; macOS is intended and must not be knowingly excluded.
Future CI runs on Linux through the same commands. No CI workflow exists yet.

## Preserved experimental evidence

The earlier implementation and its documentation remain on `tauri-experimental-orphan`. The recorded reference tip is:

```text
f63ce8f59547dc0d84b5f086301ddaf4ee20a89b
```

The branch is read-only evidence and a source of selected behavior and tests. It is not current architecture and is not an implementation base.

Use [`PRESERVED_BRANCH_RECONCILIATION.md`](PRESERVED_BRANCH_RECONCILIATION.md) before copying or adapting preserved material. It records which decisions still apply and which preserved assumptions are obsolete.

Examples of useful evidence include tag normalization, tree invariants, semantic edit grouping, controlled editor transitions, History behavior, and recovery tests.

Examples of assumptions that are not current authority include Tauri, SQLite, `DocumentNode`, title/body separation, separate current `BlockContent`, and the old SQLite `.coedit` bytes.

Inspect preserved material without changing branches, for example:

```powershell
git show tauri-experimental-orphan:src/domain/tags.ts
git show tauri-experimental-orphan:src/editor/BodyEditBatchCoordinator.ts
git show tauri-experimental-orphan:docs/proposals/BODY_CHECKPOINT_STRATEGY.md
```

Do not merge, rebase, reset, or otherwise alter `tauri-experimental-orphan`.
