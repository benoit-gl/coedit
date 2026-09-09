# Coedit documentation

These documents describe the clean-slate application on `main`. Each document has one primary authority. This split keeps product meaning, MVP scope, architecture, focused technical contracts, verification, work order, and future replication separate.

## Current authoritative documents

| Document                                                                     | Authority                                                                                                                                 |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md)                         | Logical product ontology and domain vocabulary                                                                                            |
| [`MVP_CONTRACT.md`](MVP_CONTRACT.md)                                         | Required proof boundary for the document-engine MVP                                                                                       |
| [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md)                                 | Component authority, public engine behavior, and adapter workflows                                                                        |
| [`CAPACITY_AND_PERFORMANCE_TARGETS.md`](CAPACITY_AND_PERFORMANCE_TARGETS.md) | Capacity/resource classification, contract maturity, ownership, verification, and promotion rules                                         |
| [`INLINE_CONTENT_PAYLOADS.md`](INLINE_CONTENT_PAYLOADS.md)                   | InlineContent Media Types, universal whole-payload replacement, Origin granularity, and payload convergence                               |
| [`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md)   | `application/vnd.coedit.text` formatting, fine-grained Origin, clipboard lineage, Range-holder behavior, and carrier qualification        |
| [`TEXT_POSITION_MODEL.md`](TEXT_POSITION_MODEL.md)                           | `application/vnd.coedit.text` Unicode, transient editor coordinates, and durable carrier-position boundaries                              |
| [`RANGE_MODEL.md`](RANGE_MODEL.md)                                           | Durable `application/vnd.coedit.text` multi-span and positional Range behavior, service boundary, serialization, and staged qualification |
| [`STRUCTURAL_CARRIER_MODEL.md`](STRUCTURAL_CARRIER_MODEL.md)                 | Flat Block placement, tree projection, structural concurrency policy, and position-order qualification                                    |
| [`STRUCTURAL_POSITION_ALLOCATOR.md`](STRUCTURAL_POSITION_ALLOCATOR.md)       | Production dense-order allocator abstraction, collision tolerance, characterization, and algorithm selection                              |
| [`CODING_STYLE.md`](CODING_STYLE.md)                                         | Source structure, as-implemented TSDoc, lint/format/dependency tooling, command-line interface, and platform portability                  |
| [`MVP_IMPLEMENTATION_SPEC.md`](MVP_IMPLEMENTATION_SPEC.md)                   | Private MVP implementation rules that are not owned by a focused specification                                                            |
| [`MARKDOWN_INTERCHANGE.md`](MARKDOWN_INTERCHANGE.md)                         | Markdown import, export, diagnostics, and normalized `application/vnd.coedit.text` round-trip behavior                                    |
| [`PORTABLE_DOCUMENT_FORMAT.md`](PORTABLE_DOCUMENT_FORMAT.md)                 | Lossless `.coedit` Media-Type-labelled-payload recovery contract, gated version-1 container, and hostile-input validation                 |
| [`BROWSER_PERSISTENCE.md`](BROWSER_PERSISTENCE.md)                           | Incremental IndexedDB repository, recovery, multi-tab, quota, and backup behavior                                                         |
| [`MVP_VERIFICATION_PLAN.md`](MVP_VERIFICATION_PLAN.md)                       | MVP test strategy, risk coverage, and qualification evidence                                                                              |
| [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md)                           | Post-MVP replication, Media-Type-labelled-payload convergence, and causal History direction                                               |
| [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md)                           | RUP-inspired work order, phase gates, and completion criteria                                                                             |

All current design authority is local to `main`.

[`PRESERVED_BRANCH_RECONCILIATION.md`](PRESERVED_BRANCH_RECONCILIATION.md) is a supporting traceability record. It classifies material decisions from `tauri-experimental-orphan` as retained, adapted, superseded, or deferred. It also identifies selectively reusable code and tests. It is not a competing design authority.

[`decisions/`](decisions/README.md) contains architecture decision records. An ADR preserves context, alternatives, and rationale; it does not override the direct authority listed above.

## Authority rules

Use the document with direct authority for the subject.

- A private implementation type does not override `MVP_ARCHITECTURE.md`.
- A codec or storage detail does not override `PRODUCT_DOMAIN_MODEL.md`.
- A focused Markdown or `.coedit` specification overrides duplicated technical wording elsewhere.
- `CAPACITY_AND_PERFORMANCE_TARGETS.md` controls capacity classification, maturity, ownership, and promotion. Focused specifications own current subsystem behavior and candidates; pending or experimental numbers are not exact contracts until their named gate promotes them. [`ADR 0008`](decisions/0008-capacity-contract-maturity.md) preserves the reclassification rationale and earlier planning values.
- `INLINE_CONTENT_PAYLOADS.md` owns Media Types, universal whole-payload replacement, payload-specific operation scope, payload-level Origin behavior, and deterministic replacement convergence.
- `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` owns detailed `application/vnd.coedit.text` behavior and text Range-holder lifecycle outside the shared Range contract.
- `TEXT_POSITION_MODEL.md` owns `application/vnd.coedit.text` coordinate and durable carrier-position boundaries; `RANGE_MODEL.md` owns durable text multi-span and positional Range behavior, the carrier-neutral Range service, and Range serialization.
- `STRUCTURAL_CARRIER_MODEL.md` owns Block placement and structural carrier qualification; `STRUCTURAL_POSITION_ALLOCATOR.md` owns the production allocator abstraction and allocator-algorithm qualification; `BROWSER_PERSISTENCE.md` owns browser repository behavior.
- `CODING_STYLE.md` owns source-level documentation, linting, formatting, architectural dependency checks, package commands, and developer-platform portability.
- `MVP_IMPLEMENTATION_SPEC.md` does not expand `MVP_CONTRACT.md`.
- `SCAFFOLDING_PLAN.md` owns order and gates, not detailed technical behavior.
- Local MVP shortcuts do not override `COLLABORATION_MODEL.md`.

When implementation evidence invalidates an accepted rule, update the responsible authority in the same change.

## Current implementation status

The documentation authority, coding/tooling agreement, and preserved-decision reconciliation required by Step 0 are complete. The baseline includes the Media-Type-labelled InlineContent payload contract, the durable `application/vnd.coedit.text` Range contract, and the revised Step 3-and-later work order.

Each InlineContent owns one collaborative payload labelled with an Internet Media Type. `application/vnd.coedit.text` has the fine-grained collaborative-text capability set. Every other supported Media Type initially uses the generic opaque capability set; its exact bytes and payload-level Origin are preserved. Use `application/octet-stream` when the actual format is unknown. Every payload supports atomic whole-payload replacement with explicit Origin behavior. Replacement preserves InlineContent identity while atomically replacing Media Type and content, so the Media Type can stay the same or change. Under replication, a causally later replacement supersedes replacements it observes; concurrent replacements select one deterministic current winner without wall-clock or packet-arrival arbitration. Losing replacements remain in immutable History and their Versions remain materializable.

The document model does not define a hard-break content item. Line-feed, carriage-return, and other characters are `application/vnd.coedit.text` data. Block and InlineContent boundaries are structural and imply no character, space, line break, or paragraph break. Application/editor/interchange adapters translate presentation intent. Markdown, for example, maps its own hard-break syntax to the text character defined by `MARKDOWN_INTERCHANGE.md`.

Formatting remains intrinsic `application/vnd.coedit.text` metadata, fine-grained text Origin remains protected content-native metadata, opaque-payload Origin is payload-level, and ordinary selections remain transient. Comments and internal text links can use the shared `application/vnd.coedit.text` Range value without making Range a universal payload locator, formatting/provenance anchor, canonical entity, or registry.

Steps 1 and 2 are implemented. Step 2 provides the pure recursive Block domain, typed structural operations, tag normalization, live structural validation, atomic operation groups, trusted Web Crypto UUID allocation outside the domain, and the typed opaque empty `InlineContentValue`. The genesis factory creates exactly one real root with no tags, no InlineContents, and no child Blocks. Application code adds authored content after genesis through ordinary operations. Step 4 evolves the opaque InlineContent boundary into the Media-Type-labelled payload representation without changing completed Step 2 structural ownership and ordering semantics.

Durable user-created and domain entity UUID text uses one global namespace. The same UUID text cannot identify two different live durable entities, even across different branded TypeScript ID types. UUID text contains no required type discriminator. Step 2 keeps no lifetime-ID registry; History and portable validation later reject durable identity reuse across retained lifetimes. [`decisions/0002-global-durable-identity-and-empty-genesis-root.md`](decisions/0002-global-durable-identity-and-empty-genesis-root.md) records the accepted rationale.

Step 3 is the next implementation step and qualifies the Yjs and Automerge candidates without also owning the complete production implementation. The payload suite covers `application/vnd.coedit.text`, representative generic opaque Media Types, universal whole-payload replacement, and the deterministic concurrent-replacement tie-break. The structural carrier direction remains explicit: use one logical placement per `BlockId`, with atomic position and depth, and project the recursive tree deterministically from global preorder plus depth. Qualification also proves the text Range primitives needed to avoid an incompatible carrier choice. Step 4 implements the selected collaborative core, Step 5 establishes permanent exact History and Version materialization, and Step 6 implements the durable `application/vnd.coedit.text` Range service and selects its lineage representation. [`INLINE_CONTENT_PAYLOADS.md`](INLINE_CONTENT_PAYLOADS.md), [`STRUCTURAL_CARRIER_MODEL.md`](STRUCTURAL_CARRIER_MODEL.md), [`STRUCTURAL_POSITION_ALLOCATOR.md`](STRUCTURAL_POSITION_ALLOCATOR.md), and [`RANGE_MODEL.md`](RANGE_MODEL.md) are the focused authorities.

Collaborative text does not use one universal numeric character coordinate. Canonical `application/vnd.coedit.text` does not prescribe UTF-8 or UTF-16 storage. The editor owns transient editing positions and normal Unicode selection behavior. A text Range records its document-scoped creation Version and original Block/InlineContent locations. Direct creation is all-or-none and accepts only `application/vnd.coedit.text`. Resolution follows movement, split, and merge lineage but not copying; it omits unresolved members and concatenates exact stored text without inferred separators. Serialization emits a document-relative Range fragment, while the application owns an enclosing external document URI. Generic opaque sub-content has no Range contract. [`TEXT_POSITION_MODEL.md`](TEXT_POSITION_MODEL.md) owns position boundaries; [`RANGE_MODEL.md`](RANGE_MODEL.md) owns Range behavior.

Gate B selects the collaborative carrier after Step 3 qualifies pinned Yjs v13 against Automerge with the common suites in [`INLINE_CONTENT_PAYLOADS.md`](INLINE_CONTENT_PAYLOADS.md), [`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md), [`TEXT_POSITION_MODEL.md`](TEXT_POSITION_MODEL.md), [`RANGE_MODEL.md`](RANGE_MODEL.md), [`STRUCTURAL_CARRIER_MODEL.md`](STRUCTURAL_CARRIER_MODEL.md), [`STRUCTURAL_POSITION_ALLOCATOR.md`](STRUCTURAL_POSITION_ALLOCATOR.md), and [`MVP_VERIFICATION_PLAN.md`](MVP_VERIFICATION_PLAN.md). Gate B also records the carrier-private deterministic whole-payload replacement tie-break. Allocator candidates use the same production abstraction. The persisted evidence records one run-specific comparison method and the final selection. Experimental workload and latency candidates remain evidence rather than correctness thresholds unless promoted. Step 3 proves text Range feasibility but does not freeze the lineage representation. Gate C closes the text Range API, behavior, serialization, whole-payload replacement of `application/vnd.coedit.text` lineage, and representation after Step 6 and before `.coedit` version 1 or the internal-link Range encoding is frozen.

Step 1 established the OS-neutral npm package-command interface and tooling in
[`CODING_STYLE.md`](CODING_STYLE.md). npm bootstraps the pinned pnpm version, so
no global pnpm installation is required. Native Windows and Linux command-line
builds are required; macOS is intended and must not be knowingly excluded.
The CI workflow runs the same commands on Linux for pull requests and pushes to `main`, including a second `npm run check` after the production build.

## Preserved experimental evidence

The earlier implementation and its documentation remain on `tauri-experimental-orphan`. The recorded reference tip is:

```text
f63ce8f59547dc0d84b5f086301ddaf4ee20a89b
```

The branch is read-only evidence and a source of selected behavior and tests. It is not current architecture and is not an implementation base.

Use [`PRESERVED_BRANCH_RECONCILIATION.md`](PRESERVED_BRANCH_RECONCILIATION.md) before copying or adapting preserved material. It records which decisions still apply and which preserved assumptions are obsolete.

Examples of useful evidence include tag normalization, tree invariants, semantic edit grouping, controlled editor transitions, History behavior, and recovery tests.

Examples of assumptions that are not current authority include Tauri, SQLite, `DocumentNode`, title/body separation, separate current `BlockContent`, one universal rich-text InlineContent payload, and the old SQLite `.coedit` bytes.

Inspect preserved material without changing branches, for example:

```powershell
git show tauri-experimental-orphan:src/domain/tags.ts
git show tauri-experimental-orphan:src/editor/BodyEditBatchCoordinator.ts
git show tauri-experimental-orphan:docs/proposals/BODY_CHECKPOINT_STRATEGY.md
```

Do not merge, rebase, reset, or otherwise alter `tauri-experimental-orphan`.
