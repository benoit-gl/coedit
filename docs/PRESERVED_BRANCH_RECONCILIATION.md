# Preserved-branch reconciliation record

**Status:** Supporting traceability record; not a design authority.

**Read-only reference branch:** `tauri-experimental-orphan`

**Recorded reference tip:** `f63ce8f59547dc0d84b5f086301ddaf4ee20a89b`

## 1. Purpose

This document records how material design decisions and reusable evidence from the preserved experimental branch map to the clean-slate documentation on `main`.

It does not define product or implementation behavior by itself. For each retained, adapted, or superseded decision, the listed current authoritative document controls.

Use these classifications:

- **retained** — current design keeps the decision;
- **adapted** — current design keeps the decision with changed vocabulary or boundaries;
- **superseded** — current authority deliberately replaces the decision; and
- **deferred** — the decision is not needed yet and must not be decided accidentally.

## 2. Reconciliation summary

| Preserved decision or evidence                                          | Classification                     | Current treatment and authority                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One recursive structural tree with stable identities                    | adapted                            | Retained as the recursive `Block` tree; current vocabulary and invariants are in `PRODUCT_DOMAIN_MODEL.md`.                                                                                                                                                                                                                           |
| Separate `BlockContent` identity wrapping `InlineContent`               | superseded                         | `InlineContent` now owns stable content identity and tags directly. `PRODUCT_DOMAIN_MODEL.md` is authoritative.                                                                                                                                                                                                                       |
| Title/body `DocumentNode` ontology                                      | superseded                         | Structural context determines title, heading, body, and list-item presentation. `PRODUCT_DOMAIN_MODEL.md` controls.                                                                                                                                                                                                                   |
| Tauri/Rust/SQLite as current runtime/storage                            | deferred                           | They are not MVP requirements. Reconsider only after measured evidence in the final MVP assessment step.                                                                                                                                                                                                                              |
| `.coedit` as the public document extension                              | retained                           | The clean-slate portable artifact uses `.coedit`. `PORTABLE_DOCUMENT_FORMAT.md` controls the new format; preserved SQLite bytes are not compatible.                                                                                                                                                                                   |
| Append-only permanent History and compensating restore                  | retained                           | Every Version remains exactly materializable for the document lifetime. Physical snapshots are private optimizations. `PRODUCT_DOMAIN_MODEL.md`, `MVP_ARCHITECTURE.md`, and `MVP_IMPLEMENTATION_SPEC.md` control.                                                                                                                     |
| Historical viewing is a non-mutating query                              | retained                           | Current architecture requires exact detached read-only materialization. `MVP_ARCHITECTURE.md` controls.                                                                                                                                                                                                                               |
| Semantic text edit groups with prompt durable commands                  | adapted                            | Preserve human-readable grouping and controlled transitions, but use immutable Contributions as the crash journal. Several Contributions can share a semantic group ID for presentation. `MVP_IMPLEMENTATION_SPEC.md`, `BROWSER_PERSISTENCE.md`, and `MVP_VERIFICATION_PLAN.md` control.                                              |
| 20-grapheme insertion threshold                                         | superseded                         | Retained only as experimental tuning/test evidence. Character/time thresholds are measured UX policy, not durable semantics.                                                                                                                                                                                                          |
| 30-second idle seal                                                     | superseded                         | Retained only as experimental tuning/test evidence. Idle still seals a semantic group; the constant is not canonical.                                                                                                                                                                                                                 |
| Two detached pending body checkpoints high-water mark                   | superseded                         | The exact retry/FIFO lesson remains, but normal durability is incremental and must not block typing merely because two complete artifact writes are pending.                                                                                                                                                                          |
| Atomic IME/paste/cut/format/undo/redo edit boundaries                   | retained                           | Retained in current edit-group behavior and verification.                                                                                                                                                                                                                                                                             |
| Controlled transition freeze/flush/drain before editor invalidation     | retained                           | Retained. `MVP_ARCHITECTURE.md` owns the UX/engine boundary; implementation and tests are in the MVP implementation and verification specs.                                                                                                                                                                                           |
| Exact retry of failed queued editor persistence work                    | adapted                            | Retain the exact detached command, effect data, and idempotency identity needed for repository retry; do not retain the old whole-body capture queue as an architectural boundary.                                                                                                                                                    |
| Formatting and provenance share a generic external range abstraction    | superseded                         | Formatting is intrinsic carrier metadata and Origin provenance is protected content-native metadata. Internal links and future comments can use the shared Range value without making it a formatting/provenance annotation or entity. `PRODUCT_DOMAIN_MODEL.md`, `RANGE_MODEL.md`, and `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` control. |
| Formatting and provenance have different mutation/inheritance semantics | adapted                            | Preserved as distinct intrinsic semantics: formatting follows explicit boundary policies, while Origin never inherits and cannot be cleared by formatting.                                                                                                                                                                            |
| Yjs relative positions as a plausible `TextAnchor` implementation       | adapted                            | Retained as one carrier-position primitive for Step 3 Range feasibility. It is not the public Range API or an accepted lineage representation. Formatting and Origin need no external anchor.                                                                                                                                         |
| Formatting persisted as ProseMirror/Yjs marks                           | adapted                            | Native carrier marks are now the canonical formatting representation. ProseMirror remains an adapter, and the recursive Block tree remains outside it.                                                                                                                                                                                |
| `collaborativeStateEquivalent` based on Yjs CRDT internals/delete sets  | adapted                            | Carrier-specific equivalence is required in the common conformance suite, but it remains private and includes formatting, Origin, cursor, and historical behavior rather than defining public domain equality.                                                                                                                        |
| Markdown import through structured parsing rather than regex            | retained                           | `MARKDOWN_INTERCHANGE.md` controls.                                                                                                                                                                                                                                                                                                   |
| Markdown is not the native recovery format                              | retained                           | `.coedit` is lossless recovery; Markdown is interchange.                                                                                                                                                                                                                                                                              |
| Current Markdown import grouping for body plus subsections              | adapted                            | Retained as the canonical Markdown-representable Coedit structure. Export must invert it. `MARKDOWN_INTERCHANGE.md` controls.                                                                                                                                                                                                         |
| Markdown export can be lossy                                            | adapted                            | Arbitrary Coedit structures can still be non-representable, but every successfully imported Markdown document must satisfy the exact normalized Coedit round-trip invariant after export/re-import.                                                                                                                                   |
| Human Contributor exists at document bootstrap                          | adapted                            | MVP UX asks for a free-form human display name before session creation. No account/profile design is required. `MVP_IMPLEMENTATION_SPEC.md` controls.                                                                                                                                                                                 |
| Imported Contributor identity                                           | adapted                            | Imported/unknown Origin identifies source material. The import Contribution identifies the human/system actor that performed the import; a source file is not impersonated as actor.                                                                                                                                                  |
| Post-genesis Contributor registration for AI/automation                 | deferred                           | Not needed for strict MVP. Design with AI/provenance work later.                                                                                                                                                                                                                                                                      |
| Production provenance, comments, and durable discussions                | adapted/deferred                   | Minimum protected Origin and lineage invariants are MVP foundation. Provenance UI/analytics/authentication/signing, comments, and discussions remain later phases.                                                                                                                                                                    |
| Full snapshot per revision                                              | adapted for bounded prototype only | Allowed for in-memory/early fixtures. The browser target is immutable effects plus periodic recovery checkpoints and a CAS head.                                                                                                                                                                                                      |
| Query-first History projection and grouped human-readable History       | retained/adapted                   | Non-mutating queries and semantic edit-group presentation remain; physical rows are never rewritten by grouping.                                                                                                                                                                                                                      |
| Native shell or SQL adoption because preserved branch used them         | superseded                         | Infrastructure requires measured justification. The preserved implementation is evidence only.                                                                                                                                                                                                                                        |
| One Y.Doc per InlineContent                                             | superseded                         | The default is one logical collaborative document per Coedit document for atomic structure-plus-content operations. Sharding requires measurement.                                                                                                                                                                                    |
| Whole `.coedit` artifact as the normal IndexedDB autosave unit          | superseded                         | `.coedit` is explicit portable recovery. Browser durability uses the incremental engine repository in `BROWSER_PERSISTENCE.md`.                                                                                                                                                                                                       |
| Yjs as an unqualified permanent carrier                                 | adapted                            | Stable Yjs v13 is provisional and must pass the common gate against Automerge before carrier bytes are frozen.                                                                                                                                                                                                                        |

## 3. Closed blocker and current qualification gates

The former `TextAnchor` blocker is closed. The state-of-the-art review showed
that one generic external annotation incorrectly combined three different concerns:

- formatting is intrinsic carrier-native rich-text metadata;
- Origin provenance is protected, non-inheriting content metadata; and
- durable target holders use the Range value and engine service without making
  Range a formatting or provenance entity.

Ordinary selection remains transient. No concrete anchor is therefore required
before the browser scaffold or pure Block domain begins.

Step 3 carrier qualification remains behind Gate B. Pinned stable Yjs v13 and
Automerge must run the same formatting, Origin, copy/paste/restore, structural,
Range-feasibility, concurrency, atomicity, editor, portable, and growth suite.
Yjs is the provisional winner on integration maturity; Automerge replaces it
only if it passes and materially removes custom machinery.

The selected carrier is implemented in Step 4. Step 5 then establishes permanent
exact History and Version materialization. Step 6 implements the durable Range
service and Gate C selects its lineage representation. Do not freeze
carrier-specific or embedded Range `.coedit` version-1 bytes before both gates
pass.

These gates and their evidence are owned by `RANGE_MODEL.md`,
`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`, `MVP_VERIFICATION_PLAN.md`, and
`SCAFFOLDING_PLAN.md`. They are bounded implementation decisions and do not
reopen the completed Steps 1 and 2.

## 4. Selective implementation reuse

The preserved branch can provide implementation or test evidence after current authority is clear.

### 4.1 Copy or adapt narrowly

| Preserved path                                     | Reuse intent                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/domain/ids.ts`                                | Stable ID generation patterns after current branded-ID review.                                                                       |
| `src/domain/json.ts`                               | Generic JSON cloning/comparison helpers where still appropriate.                                                                     |
| `src/domain/tags.ts` and tests                     | Tag normalization and case-insensitive identity.                                                                                     |
| `src/editor/sanitizeRichText.ts` and tests         | Hostile rich-text/paste cases; adapt to native marks, protected Origin, private fragments, and the DOM/clipboard sanitizer boundary. |
| `src/editor/yjsEncoding.ts`                        | Binary/base64 utility evidence only.                                                                                                 |
| `src/application/serializedTaskQueue.ts` and tests | Serialized local mutation behavior if still useful.                                                                                  |
| `LICENSE`                                          | Project license.                                                                                                                     |
| `THIRD_PARTY_NOTICES.md`                           | Starting notice inventory; update for actual dependencies.                                                                           |

### 4.2 Port behavior and tests, not obsolete structure

| Preserved path                                     | Preserve                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/tree.ts` and tests                     | Move, order, cycle, and deletion invariants.                                                                                                            |
| `src/domain/visibleNodes.ts` and tests             | Deterministic visible-tree projection behavior.                                                                                                         |
| `src/persistence/memoryGateway.ts` and tests       | Atomic commit, detached History, and compensating restore lessons.                                                                                      |
| `src/application/workspaceProjection.ts` and tests | Explicit live versus historical state.                                                                                                                  |
| `src/application/draftTransition.ts` and tests     | Freeze, flush, retry, and controlled-transition behavior.                                                                                               |
| `src/editor/bodyCheckpointPolicy.ts`               | Evidence for measured edit-group tuning only; do not port the constants as architecture.                                                                |
| `src/editor/BodyEditBatchCoordinator.ts` and tests | Preserve semantic grouping, FIFO, controlled transition, atomic edit, failure, and retry cases; replace the full-artifact/two-item backpressure policy. |
| `src/editor/bodyEditTransaction.ts` and tests      | Grapheme-aware input classification and atomic edit boundaries.                                                                                         |
| `src/application/historyProjection.ts` and tests   | Grouped History presentation without ledger rewriting.                                                                                                  |
| editor ownership and canvas interaction tests      | Single-editor, focus, and keyboard behavior.                                                                                                            |

Rewrite preserved tests in current vocabulary. Do not introduce obsolete product types only to make old tests compile.

## 5. Preserved documentation evidence

Useful historical documents include:

- `docs/PRODUCT_DOMAIN_MODEL.md` for historical product rationale and the superseded range-annotation direction;
- `docs/DOCUMENT_FORMAT.md` for History, restore, `.coedit`, and corruption lessons;
- `docs/PERSISTENCE_DESIGN.md` for atomicity and storage-boundary lessons;
- `docs/SECURITY.md` for untrusted file/rich-text risks;
- `docs/TESTING.md` for data-loss and recovery cases;
- `docs/KNOWN_LIMITATIONS.md` for failure modes;
- `docs/proposals/BODY_CHECKPOINT_STRATEGY.md` for the implemented semantic text-group strategy;
- `docs/proposals/QUERY_FIRST_HISTORY.md` for query-first History behavior; and
- `docs/proposals/CONTINUOUS_BLOCK_OUTLINE.md` for continuous-workspace interaction lessons.

These documents are evidence, not current authority.

## 6. Do not carry forward by default

Do not copy these preserved assumptions into the clean scaffold unless a current specification explicitly requires them:

- `DocumentNode` title/body ontology;
- separate current `BlockContent` entity;
- Tauri gateways and host-capability abstractions;
- Rust domain duplication;
- SQLite schema;
- old format-version-1 hashes or fixtures as the new wire contract;
- direct snapshot/archive frontend APIs;
- old package manifest or lockfile;
- `LOCAL_FIRST_TREE_EDITOR_PLAN.md` as an active roadmap;
- the old AI proposal interface based on `nodeId + proposedHtml`;
- one Y.Doc per InlineContent as the default boundary;
- whole-artifact autosave and full snapshot per Contribution as target storage;
- literal inline marker characters or generic external formatting/provenance Ranges; or
- raw HTML or raw carrier state as an AI mutation interface.

## 7. Maintenance rule

If later implementation evidence changes the classification of a preserved decision, update this record and the responsible authoritative document in the same change.

Do not use this file to bypass the authority model. It records why a decision is where it is; it does not become a second place to define that decision.
