# MVP implementation specification

**Status:** Accepted private MVP implementation contract; carrier selection is subject to Gate B and Range representation is subject to Gate C.

**Applies to:** `SCAFFOLDING_PLAN.md`, Steps 1-14.

## 1. Purpose and authority

This document defines private implementation rules that are not owned by a more focused specification.

Use these focused authorities first:

- [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) for product ontology and logical content meaning;
- [`MVP_CONTRACT.md`](MVP_CONTRACT.md) for the MVP proof boundary;
- [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) for public engine behavior and component authority;
- [`CAPACITY_AND_PERFORMANCE_TARGETS.md`](CAPACITY_AND_PERFORMANCE_TARGETS.md) for cross-cutting capacity and resource semantics;
- [`INLINE_CONTENT_PAYLOADS.md`](INLINE_CONTENT_PAYLOADS.md) for Media Types, universal whole-payload replacement, and payload convergence;
- [`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) for fine-grained text, Origin, clipboard, and Range-holder behavior;
- [`RANGE_MODEL.md`](RANGE_MODEL.md) for durable allowlisted fine-grained text Range behavior, the Range service, and staged representation selection;
- [`STRUCTURAL_CARRIER_MODEL.md`](STRUCTURAL_CARRIER_MODEL.md) for flat Block placement, Block-local carrier state, structural concurrency, and position-order qualification;
- [`CODING_STYLE.md`](CODING_STYLE.md) for source structure, TSDoc, linting, formatting, dependency checks, package commands, and platform portability;
- [`MARKDOWN_INTERCHANGE.md`](MARKDOWN_INTERCHANGE.md) for Markdown import/export and round-trip behavior;
- [`PORTABLE_DOCUMENT_FORMAT.md`](PORTABLE_DOCUMENT_FORMAT.md) for `.coedit` serialization and validation;
- [`BROWSER_PERSISTENCE.md`](BROWSER_PERSISTENCE.md) for IndexedDB repository, recovery, multi-tab, and quota behavior;
- [`MVP_VERIFICATION_PLAN.md`](MVP_VERIFICATION_PLAN.md) for verification strategy;
- [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md) for post-MVP replication constraints; and
- [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md) for work order and phase gates.

[`PRESERVED_BRANCH_RECONCILIATION.md`](PRESERVED_BRANCH_RECONCILIATION.md) is supporting traceability. It records retained, adapted, superseded, and deferred preserved decisions. It is not a competing authority.

## 2. Repository and runtime baseline

The initial runtime target is a normal browser application.

Use:

- React;
- strict TypeScript;
- Vite;
- Vitest;
- Tiptap/ProseMirror as an application-level text/Markdown editor adapter;
- pinned stable Yjs v13 as the provisional collaborative carrier;
- the Markdown parser stack specified in `MARKDOWN_INTERCHANGE.md`; and
- IndexedDB for the browser-local engine repository.

The Step 1 scaffold pins the supported Node.js range and pnpm version in project metadata,
commits the lockfile, and implements the canonical command set in
`CODING_STYLE.md`. The same package scripts must work from native Windows and
Linux command lines and remain macOS-compatible by design. They must not require
an IDE, Bash on Windows, PowerShell on Unix, WSL, Docker, native packaging, or a
CI-only wrapper.

Use ESLint flat configuration with type-aware typescript-eslint, the accepted
React, accessibility, and TSDoc plugins, and `eslint-config-prettier`. Run
Prettier separately and dependency-cruiser as the architectural import/cycle
check. Enable strict TypeScript and the reviewed additional compiler rules in
`CODING_STYLE.md`. Add UTF-8/LF `.editorconfig` and `.gitattributes` policy so
the required operating systems do not generate line-ending-only changes.

The repository CI runs `npm run bootstrap`, `npm run check`, `npm run build`,
and `npm run check` again after the build on Linux for pull requests and pushes
to `main`. These commands cannot contain logic that works only in CI.

Step 3 qualifies pinned Yjs v13 against pinned Automerge using the common suites in `INLINE_CONTENT_PAYLOADS.md`, `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`, `RANGE_MODEL.md`, and `STRUCTURAL_CARRIER_MODEL.md`. Track Yjs v14 only after a stable release. Use Loro as a cursor/movable-tree benchmark, not a current production dependency. Gate B records the winner. Step 4 then implements the selected collaborative core. Do not expose either candidate through a public API or freeze carrier-specific `.coedit` bytes before Gate B.

ProseMirror/Tiptap is an application adapter. Its schema, Markdown parsing, formatting model, and rendered hierarchy are not canonical engine state. It translates user intent into Block operations and native-string text operations. The recursive Coedit Block tree remains outside ProseMirror.

Do not initially add:

- Tauri;
- Rust;
- SQLite;
- multiple frontend entry points;
- host capability variants;
- a generic payload capability/plugin registry;
- a generic structured-data CRDT;
- filesystem plugins;
- outbound network providers;
- a service worker or PWA package;
- a monorepo package graph; or
- compatibility adapters for preserved `DocumentNode` behavior.

The production browser build must make no outbound runtime request unless a later accepted capability requires one.

Do not merge or cherry-pick `tauri-experimental-orphan`. Reuse behavior or tests only as classified in `PRESERVED_BRANCH_RECONCILIATION.md`.

## 3. Source-layout direction

Start with one application. Add files when their behavior exists; do not create an empty package architecture in advance.

```text
src/
  domain/
    model.ts
    ids.ts
    tags.ts
    operations.ts
    validation.ts
    projection.ts

  history/
    model.ts
    ledger.ts
    materialize.ts
    restore.ts

  content/
    payload.ts
    coeditText.ts
    opaquePayload.ts
    carrier.ts
    origin.ts
    clipboardFragment.ts
    projection.ts

  serialization/
    portableFormat.ts
    markdownImport.ts
    markdownExport.ts

  storage/
    repository.ts
    memoryRepository.ts
    indexedDbRepository.ts
    checkpoint.ts

  application/
    DocumentEngine.ts
    lenses.ts

  editor/
    InlineContentEditor.tsx
    editGroupPolicy.ts
    editGroupCoordinator.ts

  components/
    Welcome.tsx
    DocumentWorkspace.tsx
    BlockView.tsx
    HistoryView.tsx
    ImportDiagnostics.tsx
    DomainInspector.tsx
```

The exact filenames remain implementation details; the important boundary is payload-neutral domain ownership with payload-specific content helpers. Do not split the application into packages before an independent consumer exists.

## 4. IDs, tags, and implementation capacity

Use distinct branded TypeScript types for persisted identities. The MVP needs at least:

- `DocumentId`;
- `BlockId`;
- `InlineContentId`;
- `ContributorId`;
- `CommandId`;
- `ContributionId`;
- `OriginId`;
- private `RevisionId`; and
- optional `SessionId`.

All durable user-created and domain entity IDs use canonical lowercase UUID-v4 text at the wire boundary. Trusted construction or application code allocates IDs before it invokes pure domain behavior. Production allocation uses Web Crypto, tests inject valid deterministic sequences, and pure reducers never generate IDs.

Step 2 rejects duplicate Block and InlineContent IDs in the live structural candidate. It does not keep deleted IDs, reserve submitted IDs, or maintain a lifetime-ID registry. After History exists, successful publication records enough retained identity use to reject reuse across retained lifetimes. Portable validation applies the same rule when opening a document. An ID supplied to a failed Step 2 operation group does not enter retained domain state.

Identity reuse means assigning an existing durable ID to a different entity, record, or lifetime. Reusing a reference to the same immutable Origin record during copy or restore and exactly retrying the same successful `CommandId` are not identity reuse.

Use one tag-normalization implementation for Block and InlineContent tags. Keep ownership separate.

Initial tag normalization rules are semantic:

- Unicode NFKC normalization;
- trim outer whitespace;
- collapse internal whitespace;
- case-insensitive identity;
- first-spelling preservation;
- remove empty values; and
- reject control characters.

Step 2 has no application-defined finite maximum for tag count, tag size, live Block count, live InlineContent count, or Block depth. Those dimensions are limited only by semantic validity and the actual resources of the running implementation.

Step 2 retains no finite capacity-guard branches for those dimensions. If profiling exposes a real resource constraint, add an explicit guard at the affected implementation boundary and report a capacity/resource failure; do not redefine otherwise valid input as semantically invalid.

All tree walks that can encounter user-controlled structure must be iterative,
perform work proportional to the structure they visit, and avoid recursive stack
growth. The Step 2 domain does not invent a traversal budget. A consuming
untrusted-input boundary owns any resource guard selected for that boundary.

## 5. Pure structural operations

The logical entity shape is defined by `PRODUCT_DOMAIN_MODEL.md`.

Create the initial document and its one real root through a trusted factory such as `createEmptyDocument(...)`. The factory receives already allocated durable IDs, validates the initial root, and returns a valid structural document. Root construction is not a structural operation. `CreateBlock` always creates a non-root child, so its `parentId` is required and must identify a live Block.

Use these first structural operations:

```ts
type StructuralOperation =
  | {
      readonly kind: "CreateBlock";
      readonly blockId: BlockId;
      readonly parentId: BlockId;
      readonly index: number;
      readonly tags: readonly string[];
      readonly childrenPresentation: ChildrenPresentation;
    }
  | {
      readonly kind: "MoveBlock";
      readonly blockId: BlockId;
      readonly parentId: BlockId;
      readonly index: number;
    }
  | { readonly kind: "DeleteBlock"; readonly blockId: BlockId }
  | {
      readonly kind: "CreateInlineContent";
      readonly blockId: BlockId;
      readonly inlineContentId: InlineContentId;
      readonly index: number;
      readonly tags: readonly string[];
      readonly content: InlineContentValue;
    }
  | {
      readonly kind: "MoveInlineContent";
      readonly inlineContentId: InlineContentId;
      readonly index: number;
    }
  | {
      readonly kind: "DeleteInlineContent";
      readonly inlineContentId: InlineContentId;
    }
  | {
      readonly kind: "SetBlockTags";
      readonly blockId: BlockId;
      readonly tags: readonly string[];
    }
  | {
      readonly kind: "SetInlineContentTags";
      readonly inlineContentId: InlineContentId;
      readonly tags: readonly string[];
    }
  | {
      readonly kind: "SetChildrenPresentation";
      readonly blockId: BlockId;
      readonly value: ChildrenPresentation;
    };
```

In completed Step 2, `InlineContentValue` is a typed, opaque, valid empty value. Structural code can store, preserve, move, reorder, and delete it but must not inspect or manufacture payload internals. This permits complete InlineContent structural behavior before a carrier is selected without creating partially valid attributed text or interpreting opaque payload bytes.

Step 4 evolves that opaque boundary into the Media-Type-labelled payload representation defined by `INLINE_CONTENT_PAYLOADS.md`. Runtime payloads carry an Internet Media Type. Allowlisted fine-grained text selects the fine-grained collaborative-text capability set; other supported Media Types initially use generic opaque handling. Every Step 4 creation path supplies an explicit valid Media Type; the engine has no default Media Type. The writing application can deliberately supply an allowlisted text type for ordinary authored content, and an application importing opaque bytes can supply `application/octet-stream` when it has no more specific format information. Those are application choices, not engine fallbacks. This documentation evolution does not require reopening the already completed structural semantics of Step 2.

At the public human-edit boundary, text creation supplies native string content and the engine assigns Origin from the attributed command context. A complete pre-attributed allowlisted fine-grained text value is accepted only by validated internal import, copy, restore, or remote-integration paths; it is not a client Origin-spoofing surface. Generic opaque creation/replacement likewise obtains Origin from a trusted context rather than a caller-controlled attribution side channel.

Operation rules:

- create indices use the vector before insertion and accept `0..length`;
- move indices use the destination vector after removal and accept `0..postRemovalLength`;
- invalid indices are rejected, not clamped;
- a move that resolves to the original order is `NoEffect`;
- operation groups apply sequentially to one detached candidate;
- each operation sees the preceding operation result;
- empty groups and no-effect operations are rejected;
- reducers generate neither IDs nor clocks;
- reducers validate live identity uniqueness but keep no lifetime-ID registry; and
- a failed group publishes no state and records no identity in retained domain state.

`MoveInlineContent` only reorders within its current owner in the initial MVP. Cross-Block transfer can be expressed later through explicit product operations if required.

Do not add entity tombstones or lifecycle timestamps to the logical live entities. Do not add a primitive `RestoreBlock`; whole-Version restore belongs to History.

## 6. Carrier qualification and selected collaborative core

Each InlineContent owns one Media-Type-labelled collaborative payload. The initial Media Types and universal replacement behavior are defined by `INLINE_CONTENT_PAYLOADS.md`.

Allowlisted fine-grained text stores a native source string and protected fine-grained Origin. For `text/markdown`, Markdown syntax remains in that string unless the application consumes recognized structural syntax into the Block tree. The engine does not own formatting marks, rendered rich-text state, or link interpretation.

Step 4 selects and qualifies the first production raw-media processor and its supported representation profiles. Unsupported profiles fail explicitly at raw/coarse boundaries. The processor must preserve the supplied Media Type and must not silently relabel, transcode, ignore representation-affecting parameters, repair content, or fall back to opaque handling. `INLINE_CONTENT_PAYLOADS.md` owns the exact distinction between Media Type preservation, collaboration capability, and raw representation support.

Every valid Media Type whose normalized type/subtype is not in the fine-grained allowlist initially uses generic opaque handling: exact bytes plus one payload-level Origin for the current value. An unfamiliar type is not invalid syntax and needs no decoder or renderer at this boundary. `INLINE_CONTENT_PAYLOADS.md` section 3.1 owns syntax and capability matching. The selected carrier must preserve the Media Type and bytes and support atomic whole-payload replacement. It does not need a fine-grained opaque payload CRDT.

Every InlineContent supports one whole-payload replacement operation. The logical operation targets one InlineContent, preserves its identity, validates a complete replacement against the replacement Media Type, and atomically publishes the new Media Type, Media-Type-specific content, and required Origin effect. The Media Type can stay the same or change. Allowlisted fine-grained text also supports fine-grained native-string operations; other supported Media Types initially use generic opaque handling. Payload-specific fine-grained operations reject incompatible Media Types explicitly. Do not add dynamic capability dispatch or a generic replicated object model until a concrete additional fine-grained payload contract requires one.

Under replicated qualification, whole-payload replacement follows the register invariants in `INLINE_CONTENT_PAYLOADS.md`. Gate B records its tie-break mechanism and separately selects the mixed replacement/text-edit behavior deferred in section 10.1 of that authority. Production implementation in Step 4 must not treat a candidate's mixed-operation behavior as an accepted policy before that decision. Step 5 implements permanent losing-Contribution and Version materialization.

Use one logical collaborative document per Coedit document so one engine transaction can span Block structure, several InlineContents of either capability class, Origin records, and Contribution metadata. Within that document, each `BlockId` owns one private carrier namespace for placement, a semantic activity marker, and Block-local payload. Do not create one independently committed Yjs or Automerge document per Block.

`STRUCTURAL_CARRIER_MODEL.md` owns the exact structural contract. In summary, placement is one atomic `{ position, depth }` value; structural commands map through projected preorder; a subtree move allocates fresh ordered positions and applies one depth delta; and normal allocation should avoid exact position collisions.

A semantic payload mutation, including whole-payload replacement, updates a carrier-private Block activity marker in the same logical carrier transaction or change. A semantic Block update that is concurrent with deletion of that same Block wins over deletion. The marker is not a product field, payload hash, public counter, or timestamp. Editing a descendant does not refresh each ancestor. The selected adapter can encode this rule differently for Yjs and Automerge.

Do not hash the whole Block payload into placement metadata. A payload hash would make compatible structural moves and payload edits compete on one placement register and would not reliably describe the result of merged concurrent CRDT or register payload effects.

Exact primary-position collisions are exceptional carrier cases. When insertion requires normalization of an existing collision run, that normalization is replicated as part of the structural Contribution that needs it. It is not a separate product operation or History action. Prefer deterministic normalization and suppression of normalization-only resurrection when they are inexpensive; record residual behavior if those properties would require disproportionate machinery.

Bind the text editor only to an active allowlisted fine-grained text InlineContent. An opaque payload can be projected to an application adapter, but no text editor or text operation is offered for it. Do not expose the logical document, carrier objects, raw updates, Block activity setters, or client-supplied Origin setters through the public API.

The trusted engine boundary assigns Origin for human text insertion, import, external paste, automation, AI, and whole-payload replacement. Same-document internal copy and restore preserve existing Origins according to the payload contract under fresh carrier item identities where applicable. Ordinary editor or opaque-replacement clients cannot forge another Contributor's Origin.

Step 3 runs the same carrier-neutral payload, headless text, structural, and ProseMirror-integrated suites against Yjs v13 and Automerge. Functional invariants are mandatory. Range work in this step proves only the allowlisted fine-grained text feasibility subset in `RANGE_MODEL.md`; it does not select the Range-tracking representation. Select Yjs when its Media-Type-labelled payload, attributed text/Origin, and structural carrier passes without fragile full-state repair. Select Automerge only if its richer native model materially reduces custom code and its editor/storage integrations pass the same suites. Record the selected versions, dependency/license review, replacement tie-break mechanism, fixtures, measurements, and rejected-candidate rationale.

Step 4 converts the selected candidate into the production collaborative core, selects the production raw-media processor and supported representation profiles, and retains the common suite as regression evidence. Do not retain rejected-candidate types in public or domain APIs. Do not finalize the carrier codec, portable bytes, History effect encoding, editor transaction bridge, or compaction behavior before Gate B passes.

## 7. Private MVP History

`MVP_ARCHITECTURE.md` is the public engine contract. The local implementation can use a linear private ledger; bounded in-memory tests or an identified early prototype can use full snapshots.

Private records can include:

- a Contributor catalog;
- append-only Contribution records;
- append-only revision records;
- one moving private head; and
- retained-lifetime ID-use indexes that reject durable identity reuse after successful publication;
- immutable Origin records;
- exact carrier effect/update chunks; and
- physical recovery checkpoints.

Genesis has sequence zero, contains the initial root created by the document factory, and has no Contribution. The first successful user mutation after genesis creates the first Contribution and resulting Version.

A new document requires at least one human Contributor. For the MVP, the UX asks for a free-form display name before session creation and supplies that Contributor to the engine factory. This does not create an account/profile model.

Contributor display names are trimmed and control-character-free. The MVP
defines no application-level length maximum. Any UI, storage, or
interoperability guard remains a pending selection owned by the affected
boundary's implementation step under `CAPACITY_AND_PERFORMANCE_TARGETS.md`; it is
not Contributor semantics.

The domain vocabulary retains Contributor/agent kinds `human`, `imported`, `automation`, `ai`, and `unknown`. Strict MVP creation needs human plus imported/unknown identities sufficient for Origin records. A Markdown/file import Contribution is attributed to the human/system actor that performs it; its content points to imported/unknown Origin. Post-genesis interactive registration workflows remain deferred.

Each successful durable command publishes one logical Contribution, its exact effect/update, any new Origin records, one resulting private Version, and its successful command receipt atomically. Several Contributions can share a semantic group ID for presentation.

The early in-memory implementation may use a full snapshot per Contribution for prototype and qualification fixtures that fit within actual implementation resource capacity. The Step 13 browser target uses immutable effects/update chunks, periodic physical recovery checkpoints or cached materializations, and a small CAS head. Every product Version remains exactly materializable for the lifetime of the document. A physical snapshot creates no product Version, and compaction cannot discard a Version or required text Range lineage. Product History remains independent of the physical representation.

Use globally unique `CommandId` values. Check a previously successful CommandId before stale-version rejection:

- an exact retry returns the original receipt and emits no new Contribution or notification;
- reuse with different canonical request content is an error.

Serialize local commits internally. Perform expected-Version checking inside that serialization boundary. Two concurrent local requests against the same expected Version still produce exactly one success and one stale-version failure. The post-MVP replicated whole-replacement tie-break applies to valid concurrent Contributions created on different replicas; it does not weaken local expected-Version checking.

Use canonical RFC 3339 UTC timestamps with millisecond precision for display metadata. Never use those timestamps to choose a concurrent payload replacement winner.

## 8. Durable allowlisted fine-grained text Range service

Step 6 implements the headless service defined by `RANGE_MODEL.md` after Step 5 establishes exact Version materialization.

The public boundary remains carrier-neutral and text-specific. It accepts detached creation input against the current Version visible to the caller. Every supplied target must resolve in allowlisted fine-grained text. The returned Range records that document-scoped creation Version and the original Block and InlineContent location of each member. It never returns a live Yjs relative position, Automerge cursor, carrier object, internal lineage node, or mutable engine-owned collection.

Direct creation is all-or-none. If any supplied span or position does not resolve in allowlisted fine-grained text in the named current Version, creation fails. Span creation otherwise preserves the caller's arbitrary order, overlap, duplication, adjacency, sparsity, and zero-length members without normalization. A zero-length Span uses greedy Span semantics; it does not become a Positional Range.

Resolution is valid only at the creation Version or a descendant Version in the same document. It returns surviving spans in creation and lineage order and omits unresolved, ambiguous, deleted, or non-text members. Text resolution concatenates exact stored span text without inserted structural separators or deduplication. A stored line-feed or another separator-like character remains part of the returned text because it is content. Split and merge can extend Range lineage; copy, clone, import, and paste cannot.

Parsing a serialized Range is best-effort. It resolves members in the document and Version supplied by the application, omits unresolved or ambiguous members, and rebases the returned Range to that Version. The application, not the Range service, parses an enclosing external document URI and selects the document engine.

Explicit rationalization returns a rebased Range and can merge only consecutive, exactly adjacent spans when lineage proves that a merge of adjacent Blocks or InlineContents caused the adjacency. It does not run during normal editing or resolution.

Gate C must close and record:

- exact result wrappers, all-members-omitted parsing, and optional parse diagnostics;
- split and merge rules that designate the continuing Block and InlineContent identities;
- whether references to identities consumed by a merge follow structural lineage, remain historical-only, or become unresolved;
- the deterministic identity rule when no semantic continuation is naturally designated, without using clocks or incidental replica order;
- complete one-to-many split and many-to-one merge lineage independent of the continuing entity identity;
- the zero-length Span tie-break at an exact structural split;
- Positional Range split, merge, deletion, and whole-content-replacement behavior;
- any allowlisted fine-grained text whole-payload replacement lineage rule required by the selected representation;
- document-relative fragment grammar, parse/serialize behavior, and resource-guard behavior; and
- the selected Range-tracking lineage representation.

Range holders do not register with the document. Ordinary text edits and Block moves cannot enumerate or rewrite all retained holders. Permanent Version materialization supplies the starting point for lazy lineage resolution. Resolution, rationalization, parsing, and serialization can perform work for the one supplied Range. Serialization rebases that Range against the selected Version and removes obsolete tracking evidence when the accepted representation permits it.

Applications can store or serialize Range values in comments, URLs, Markdown link destinations, navigation metadata, or other holders. Application “reinjection” consists only of placing the serialized Range value in that holder and later passing it back through the public parse/resolve API. The Range service does not own a reinjection command, holder-specific fallback, link activation, comment repair, or other holder policy. Generic opaque sub-content has no Range representation in the MVP.

## 9. Semantic Checkpoint and restore

A semantic **Checkpoint** is the `checkpointCurrent` History command defined by the architecture.

It must:

1. validate the expected base Version;
2. append one attributed Checkpoint Contribution;
3. append one resulting Version whose document material equals the base;
4. advance the private head; and
5. expose the resulting VersionToken through History.

Do not use `checkpoint` for semantic editor groups or ordinary durable editor Contributions.

Restore validates its expected current Version and historical target, then appends a new restore Contribution. In the local single-writer MVP its resulting material matches the historical target. Reinserted allowlisted fine-grained text has fresh carrier identities and preserves historical fine-grained Origin. Restored opaque payloads preserve their historical payload Origin. The new Contribution records the restoring actor and target Version. Restore never rewinds or deletes History.

The future replicated form is causal compensation against the frontier observed by the restoring actor and preserves unseen concurrent work. `COLLABORATION_MODEL.md` owns that extension.

## 10. Read isolation and notifications

Queries, History pages, summaries, exact materializations, payload reads, and editor-content reads return detached values.

No frontend API exposes private `RevisionRecord`, archive objects, engine-owned byte arrays, live Y.Doc/Automerge references, or storage collections. A detached opaque payload byte array must not alias engine-owned mutable storage.

After successful publication, emit one invalidation notification. Failed commands and exact idempotent retries emit none.

## 11. Read-only workspace and structural editing

The first browser workspace is deliberately plain.

Welcome actions:

- New blank document;
- Import Markdown;
- Open `.coedit`; and
- Open bundled sample.

Workspace behavior:

- render the continuous Block document from engine queries;
- use payload-aware rendering and treat Block/InlineContent boundaries as structural rather than implicit text;
- derive outline labels from the same selected allowlisted fine-grained text InlineContent as manuscript text when that application convention applies;
- show import diagnostics;
- support current/historical selection without mutating History;
- provide a development-only inspector; and
- retain the VersionToken returned with each projection for later edits.

Structural editing uses only `DocumentEngine.execute`. React does not mutate revisioned state directly.

Support create, move, nest, reorder, delete, tag, InlineContent selection/reordering, and `childrenPresentation` changes.

## 12. Interactive editor durability and semantic grouping

Separate durable publication from human-readable grouping. Every submitted allowlisted fine-grained text editor command that succeeds creates one immutable Contribution and Version and commits through the repository protocol. Adjacent Contributions can share one `semanticGroupId`; History can collapse them for presentation without rewriting physical History.

The editor may combine transient ProseMirror transactions before submission, but it must submit promptly at a minimal safe boundary and before a controlled transition can hide, replace, retarget, export, save, restore, or close the editor context.

Accepted behavior:

- IME composition is not split mid-composition;
- paste, cut, selection replacement, undo, and redo are atomic editor actions;
- line-break or paragraph intent is translated by the application/editor adapter into text and/or structural operations; the document model does not require a hard-break item;
- unrelated dirty work is submitted before an atomic action;
- insertion/deletion mode changes, idle, real focus/editor-owner departure, and controlled transitions seal the current semantic group;
- clean navigation creates neither a command nor a Contribution;
- submitted immutable commands retain FIFO order;
- failure retains the exact detached command and editor work needed for retry;
- degraded durability, quota, and conflict are visible;
- no later command overtakes a failed head; and
- typing is not blocked by queued whole-artifact serialization, because normal durability does not serialize the whole artifact.

**Maturity:** Experimental comparison fixtures.

**Owner:** This document.

**Promotion gate:** Step 11 editor integration and measurements.

Time, character, and memory thresholds are tunable UX/repository policy recorded
with measurements. They are not product History semantics. Use the preserved
20-grapheme, 30-second, and two-pending-capture values only as experimental
comparison fixtures until Step 11 promotes, replaces, or retires them.

## 13. Lenses and comparison

Implement lenses as application queries over an explicit Version.

Initial lenses:

- default/main: first `view:main`, otherwise first InlineContent;
- summary: first `view:summary`, otherwise default/main.

If several contents match, select the first in vector order and return a projection diagnostic. Zero contents means no own rendered content.

Initial lenses preserve the complete Block tree. They do not silently reparent Blocks.

A renderer must inspect the selected Media Type. The current Markdown/writing projection expects allowlisted fine-grained text; an opaque payload requires a payload-aware renderer or a non-representability diagnostic rather than implicit byte-to-text conversion.

Historical comparison aligns Blocks by stable `BlockId` and reports unmatched subtrees. Do not guess correspondence.

Markdown rendering belongs to `MARKDOWN_INTERCHANGE.md`.

## 14. Browser durability

The browser composition root supplies the IndexedDB implementation of the engine repository port. It stores private immutable Contribution/effect/checkpoint records plus a small compare-and-swap head. The repository is not a second semantic document authority and the UX does not parse its records.

Pre-encode and hash immutable records before opening one short IndexedDB transaction. Inside that transaction, check the expected head/generation, insert immutable records and the successful CommandId receipt, then advance the head atomically. Publish the in-memory candidate and notify only after commit.

A mismatch is a persistence conflict; do not silently overwrite another tab's work. `BroadcastChannel` can invalidate other tabs but is not an ordering authority. Use StorageManager persistence/quota capabilities where available, return typed failures, retain exact retry work, and offer explicit `.coedit` backup.

Normal autosave does not assemble or rewrite a complete `.coedit` artifact. `BROWSER_PERSISTENCE.md` owns recovery, compaction, multi-tab, quota, and verification details.

Portable-file dirty state is the comparison between the engine's current token and the token last transported successfully through explicit Save/export. Repository durability status separately compares the published engine Version with its committed repository head; they normally advance atomically.

## 15. Final infrastructure assessment

After the strict MVP vertical slice works, measure before adopting new infrastructure.

Before SQL or OPFS, require evidence about document size, payload/update/chunk growth, recovery and materialization latency, query needs, large opaque-payload/attachment needs, compaction, and atomicity limits. Do not adopt PGlite, RxDB, SQLite-WASM, or `y-indexeddb` as a substitute for Coedit's semantic repository transaction.

Before a native shell, require a concrete browser-inadequate need. Tauri can wrap the validated application through the same ports; it does not redefine the document engine or recreate a Rust domain authority. Electron requires a demonstrated need for a bundled consistent Chromium runtime.

Before networked collaboration, apply `COLLABORATION_MODEL.md` in full. Local linear History and bounded full snapshots are private MVP choices, not distributed-system contracts. One logical collaborative document per Coedit document is the default; sharding requires measured evidence and preservation of atomic multi-target Contributions.

Provenance visualization/analytics, comments, durable discussions, AI-provider integration, authenticated claims, signing, fine-grained structured-payload editing, and collaboration are post-MVP phases. Minimum Origin and whole-payload convergence behavior are part of MVP qualification and recovery.

## 16. Reuse rule

Use `PRESERVED_BRANCH_RECONCILIATION.md` as the single reuse/traceability inventory.

Do not duplicate a second salvage table here. When a preserved implementation detail conflicts with a current authority, current authority controls. When the conflict reveals a non-trivial design choice, stop and record that choice before implementation.
