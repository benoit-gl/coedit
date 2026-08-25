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

| Preserved decision or evidence | Classification | Current treatment and authority |
|---|---|---|
| One recursive structural tree with stable identities | adapted | Retained as the recursive `Block` tree; current vocabulary and invariants are in `PRODUCT_DOMAIN_MODEL.md`. |
| Separate `BlockContent` identity wrapping `InlineContent` | superseded | `InlineContent` now owns stable content identity and tags directly. `PRODUCT_DOMAIN_MODEL.md` is authoritative. |
| Title/body `DocumentNode` ontology | superseded | Structural context determines title, heading, body, and list-item presentation. `PRODUCT_DOMAIN_MODEL.md` controls. |
| Tauri/Rust/SQLite as current runtime/storage | deferred | They are not MVP requirements. Reconsider only after measured evidence in the final MVP assessment step. |
| `.coedit` as the public document extension | retained | The clean-slate portable artifact uses `.coedit`. `PORTABLE_DOCUMENT_FORMAT.md` controls the new format; preserved SQLite bytes are not compatible. |
| Append-only History and compensating restore | retained | Preserved semantic behavior remains. `PRODUCT_DOMAIN_MODEL.md`, `MVP_ARCHITECTURE.md`, and `MVP_IMPLEMENTATION_SPEC.md` control. |
| Historical viewing is a non-mutating query | retained | Current architecture requires exact detached read-only materialization. `MVP_ARCHITECTURE.md` controls. |
| Semantic text edit groups with physical safety captures | adapted | Retain the policy and behavior. Rename old physical "checkpoints" to **physical edit captures** so they cannot be confused with semantic History Checkpoints. `MVP_IMPLEMENTATION_SPEC.md` and `MVP_VERIFICATION_PLAN.md` control. |
| 20-grapheme insertion threshold | retained | Retained as the initial semantic-group policy default. `MVP_IMPLEMENTATION_SPEC.md` controls; `MVP_VERIFICATION_PLAN.md` defines regression cases. |
| 30-second idle seal | retained | Retained as the initial semantic-group policy default. |
| Two detached pending body checkpoints high-water mark | adapted | Retained as two pending **physical edit captures**. The name changes; integrity/backpressure behavior does not. |
| Atomic IME/paste/cut/format/undo/redo edit boundaries | retained | Retained in current edit-group behavior and verification. |
| Controlled transition freeze/flush/drain before editor invalidation | retained | Retained. `MVP_ARCHITECTURE.md` owns the UX/engine boundary; implementation and tests are in the MVP implementation and verification specs. |
| Exact retry of failed queued editor persistence work | retained | Retained for physical edit capture recovery. |
| Formatting and provenance share a generic external range abstraction | retained | Current domain uses external `RangeAnnotation<T>` concepts. Formatting is required in the MVP; provenance is post-MVP. `PRODUCT_DOMAIN_MODEL.md` controls. |
| Formatting and provenance have different mutation/inheritance semantics | retained | Retained. MVP implements formatting only; provenance rules remain deferred. |
| Yjs relative positions as a plausible `TextAnchor` implementation | deferred | No concrete anchor representation is accepted yet. `TextAnchor` remains opaque. This is an implementation-blocking Step 0 decision. |
| Formatting persisted only as ProseMirror/Yjs marks | superseded | This was introduced during the clean-slate documentation refactor without adequate reconciliation. The current direction restores external formatting ranges as domain authority. Editor-native marks can be a transient adapter representation only if consistent with the accepted Step 3 design. |
| `collaborativeStateEquivalent` based on Yjs CRDT internals/delete sets | superseded | No such generic comparison is currently authoritative. Exact portable verification must follow the accepted Step 3/TextAnchor design. `PORTABLE_DOCUMENT_FORMAT.md` deliberately leaves this open until Step 0 closes. |
| Markdown import through structured parsing rather than regex | retained | `MARKDOWN_INTERCHANGE.md` controls. |
| Markdown is not the native recovery format | retained | `.coedit` is lossless recovery; Markdown is interchange. |
| Current Markdown import grouping for body plus subsections | adapted | Retained as the canonical Markdown-representable Coedit structure. Export must invert it. `MARKDOWN_INTERCHANGE.md` controls. |
| Markdown export can be lossy | adapted | Arbitrary Coedit structures can still be non-representable, but every successfully imported Markdown document must satisfy the exact normalized Coedit round-trip invariant after export/re-import. |
| Human Contributor exists at document bootstrap | adapted | MVP UX asks for a free-form human display name before session creation. No account/profile design is required. `MVP_IMPLEMENTATION_SPEC.md` controls. |
| Imported Contributor identity | retained | Markdown import creates/uses an imported Contributor and attributes the import Contribution to it. |
| Post-genesis Contributor registration for AI/automation | deferred | Not needed for strict MVP. Design with AI/provenance work later. |
| Production provenance, comments, and durable discussions | deferred | Removed from strict MVP completion. They are post-MVP experiments. |
| Full snapshot per revision | retained for MVP only | Allowed as a private simplicity choice, not a public domain or distributed contract. |
| Query-first History projection and grouped human-readable History | retained/adapted | Non-mutating queries and semantic edit-group presentation remain; physical rows are never rewritten by grouping. |
| Native shell or SQL adoption because preserved branch used them | superseded | Infrastructure requires measured justification. The preserved implementation is evidence only. |

## 3. Current blocking decision

### `TextAnchor` representation

The domain requires an opaque `TextAnchor` construct for external formatting ranges.

The preserved branch identified Yjs relative positions as plausible, but did not establish them as the final durable contract. The clean-slate refactor later introduced Yjs/ProseMirror marks and a CRDT-internal equality contract without an explicit supersession decision. That change is withdrawn.

Before Step 1 begins, research must select and document:

- the concrete `TextAnchor` representation;
- how anchors behave across insertion, deletion, replacement, split, merge, undo, redo, copy, and restore;
- how formatting range updates are expressed atomically with collaborative text updates;
- how anchor validity and resource limits are checked;
- how exact historical materialization preserves compatible anchor state; and
- how format version 1 serializes and verifies anchors.

Until then:

- `TextAnchor` remains opaque;
- no implementation may infer offsets, ProseMirror positions, Yjs relative positions, or another representation;
- no generic `collaborativeStateEquivalent` algorithm is accepted; and
- Step 0 remains open.

## 4. Selective implementation reuse

The preserved branch can provide implementation or test evidence after current authority is clear.

### 4.1 Copy or adapt narrowly

| Preserved path | Reuse intent |
|---|---|
| `src/domain/ids.ts` | Stable ID generation patterns after current branded-ID review. |
| `src/domain/json.ts` | Generic JSON cloning/comparison helpers where still appropriate. |
| `src/domain/tags.ts` and tests | Tag normalization and case-insensitive identity. |
| `src/editor/sanitizeRichText.ts` and tests | Hostile rich-text/paste cases; adapt to current formatting authority. |
| `src/editor/yjsEncoding.ts` | Binary/base64 utility evidence only. |
| `src/application/serializedTaskQueue.ts` and tests | Serialized local mutation behavior if still useful. |
| `LICENSE` | Project license. |
| `THIRD_PARTY_NOTICES.md` | Starting notice inventory; update for actual dependencies. |

### 4.2 Port behavior and tests, not obsolete structure

| Preserved path | Preserve |
|---|---|
| `src/domain/tree.ts` and tests | Move, order, cycle, and deletion invariants. |
| `src/domain/visibleNodes.ts` and tests | Deterministic visible-tree projection behavior. |
| `src/persistence/memoryGateway.ts` and tests | Atomic commit, detached History, and compensating restore lessons. |
| `src/application/workspaceProjection.ts` and tests | Explicit live versus historical state. |
| `src/application/draftTransition.ts` and tests | Freeze, flush, retry, and controlled-transition behavior. |
| `src/editor/bodyCheckpointPolicy.ts` | Accepted text-group policy defaults. |
| `src/editor/BodyEditBatchCoordinator.ts` and tests | Semantic grouping, physical capture, backpressure, failure, and retry behavior. |
| `src/editor/bodyEditTransaction.ts` and tests | Grapheme-aware input classification and atomic edit boundaries. |
| `src/application/historyProjection.ts` and tests | Grouped History presentation without ledger rewriting. |
| editor ownership and canvas interaction tests | Single-editor, focus, and keyboard behavior. |

Rewrite preserved tests in current vocabulary. Do not introduce obsolete product types only to make old tests compile.

## 5. Preserved documentation evidence

Useful historical documents include:

- `docs/PRODUCT_DOMAIN_MODEL.md` for product rationale and range-annotation direction;
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
- `LOCAL_FIRST_TREE_EDITOR_PLAN.md` as an active roadmap; or
- the old AI proposal interface based on `nodeId + proposedHtml`.

## 7. Maintenance rule

If later implementation evidence changes the classification of a preserved decision, update this record and the responsible authoritative document in the same change.

Do not use this file to bypass the authority model. It records why a decision is where it is; it does not become a second place to define that decision.
