# MVP implementation specification

**Status:** Accepted private MVP implementation contract; carrier-dependent work is subject to the Step 3 qualification gate.

**Applies to:** `SCAFFOLDING_PLAN.md`, Steps 1-12.

## 1. Purpose and authority

This document defines private implementation rules that are not owned by a more focused specification.

Use these focused authorities first:

- [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) for product ontology and logical attributed-content meaning;
- [`MVP_CONTRACT.md`](MVP_CONTRACT.md) for the MVP proof boundary;
- [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) for public engine behavior and component authority;
- [`CAPACITY_AND_PERFORMANCE_TARGETS.md`](CAPACITY_AND_PERFORMANCE_TARGETS.md) for cross-cutting capacity and resource semantics;
- [`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) for formatting, Origin, clipboard, and comment-target behavior;
- [`STRUCTURAL_CARRIER_MODEL.md`](STRUCTURAL_CARRIER_MODEL.md) for Step 3 flat Block placement, Block-local carrier state, structural concurrency, and position-order qualification;
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
- Tiptap/ProseMirror as the interactive editor adapter;
- pinned stable Yjs v13 as the provisional collaborative-content carrier;
- the Markdown parser stack specified in `MARKDOWN_INTERCHANGE.md`;
- DOMPurify or an equivalently reviewed sanitizer at DOM/clipboard boundaries; and
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

There is no CI implementation in the current baseline. A future Linux CI
process runs `npm run bootstrap`, `npm run check`, and `npm run build`; those
commands cannot contain logic that works only in CI.

Step 3 qualifies pinned Yjs v13 against pinned Automerge using the common suites in `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` and `STRUCTURAL_CARRIER_MODEL.md`. Track Yjs v14 only after a stable release. Use Loro as a cursor/movable-tree benchmark, not a current production dependency. Do not make the provisional Yjs choice part of a public API or freeze carrier-specific `.coedit` bytes before qualification.

The ProseMirror/Tiptap schema for one InlineContent is deliberately flat: text, hard breaks, and the supported inline marks. The recursive Coedit Block tree remains outside ProseMirror.

Do not initially add:

- Tauri;
- Rust;
- SQLite;
- multiple frontend entry points;
- host capability variants;
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
    collaborativeContent.ts
    carrier.ts
    formatting.ts
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
    sanitizeRichText.ts

  components/
    Welcome.tsx
    DocumentWorkspace.tsx
    BlockView.tsx
    HistoryView.tsx
    ImportDiagnostics.tsx
    DomainInspector.tsx
```

Do not split the application into packages before an independent consumer exists.

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

The Step 2 source keeps its earlier guard branches for now, but sets their thresholds to `Number.MAX_SAFE_INTEGER` so they are effectively disabled before ordinary runtime or allocation constraints. The source marks those branches as candidates for a later cruft-cleanup pass. Remove them if later evidence shows that no explicit guard is useful. If profiling exposes a real resource constraint, add an explicit implementation guard and report a capacity/resource failure; do not redefine the input as semantically invalid.

All tree walks that can encounter user-controlled structure must be iterative and bounded by the implementation's current resource budget.

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

In Step 2, `InlineContentValue` is a typed, opaque, valid empty CollaborativeContent value. Obtain it through a typed trusted constructor rather than representing it with `{}`, `unknown`, raw text, or a partially attributed placeholder. Structural code can store, preserve, move, reorder, and delete it but must not inspect or manufacture content internals. This permits complete InlineContent structural behavior before a carrier is selected without creating partially valid attributed content.

Step 3 expands the same `InlineContentValue` type with text, hard breaks, intrinsic marks, protected Origin, and carrier-neutral behavior. Its private carrier representation is finalized by the carrier qualification gate. At the public human-edit boundary, creation supplies visible content and formatting intent and the engine assigns Origin from the attributed command context. A complete pre-attributed value is accepted only by validated internal import, copy, restore, or remote-integration paths; it is not a client Origin-spoofing surface.

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

## 6. Attributed collaborative-content and structural-carrier boundary

Each InlineContent owns canonical CollaborativeContent. The selected carrier stores visible text/hard breaks, intrinsic formatting marks, and protected Origin in one atomic collaborative state. HTML, plain text, ProseMirror JSON, and rendered Origin runs are derived. Do not persist any of them as a parallel authority.

Use one logical collaborative document per Coedit document so one engine transaction can span Block structure, several InlineContents, Origin records, and Contribution metadata. Within that document, each `BlockId` owns one private carrier namespace for placement, a semantic activity marker, and Block-local payload. Do not create one independently committed Yjs or Automerge document per Block.

`STRUCTURAL_CARRIER_MODEL.md` owns the exact Step 3 structural contract. In summary, placement is one atomic `{ position, depth }` value; structural commands map through projected preorder; a subtree move allocates fresh ordered positions and applies one depth delta; and normal allocation should avoid exact position collisions.

A semantic payload mutation updates a carrier-private Block activity marker in the same logical carrier transaction or change. A semantic Block update that is concurrent with deletion of that same Block wins over deletion. The marker is not a product field, payload hash, public counter, or timestamp. Editing a descendant does not refresh each ancestor. The selected adapter can encode this rule differently for Yjs and Automerge.

Do not hash the whole Block payload into placement metadata. A payload hash would make compatible structural moves and payload edits compete on one placement register and would not reliably describe the result of merged concurrent CRDT payload edits.

Exact primary-position collisions are exceptional carrier cases. When insertion requires normalization of an existing collision run, that normalization is replicated as part of the structural Contribution that needs it. It is not a separate product operation or History action. Prefer deterministic normalization and suppression of normalization-only resurrection when they are inexpensive; record residual behavior if those properties would require disproportionate machinery.

Bind the interactive editor only to the active InlineContent. Do not expose the logical document, carrier objects, raw updates, Block activity setters, or client-supplied Origin setters through the public API.

Formatting follows the vocabulary and boundary defaults in `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`. Carrier adapters translate those logical policies to native marks/attributes and must prove exact round trip. Clearing formatting cannot change Origin.

The trusted engine boundary assigns Origin for human typing, import, external paste, automation, and AI. Same-document internal copy and restore preserve existing Origins under fresh carrier item identities. Ordinary editor operations cannot forge another Contributor's Origin.

Step 3 runs the same headless and ProseMirror-integrated suites against Yjs v13 and Automerge. Functional invariants are mandatory. Select Yjs when its protected attributed-content and structural carrier passes without fragile full-state repair. Select Automerge only if its richer native model materially reduces custom code and its editor/storage integrations pass the same suites. Record the selected versions, dependency/license review, fixtures, measurements, and rejected-candidate rationale.

Do not finalize the carrier codec, portable bytes, history effect encoding, editor transaction bridge, or compaction behavior before this gate passes.

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

Contributor display names are trimmed and control-character-free. The MVP defines no application-level length maximum. A real UI, storage, or interoperability constraint can add an explicit boundary guard later under `CAPACITY_AND_PERFORMANCE_TARGETS.md`; that guard is not Contributor semantics.

The domain vocabulary retains Contributor/agent kinds `human`, `imported`, `automation`, `ai`, and `unknown`. Strict MVP creation needs human plus imported/unknown identities sufficient for Origin records. A Markdown/file import Contribution is attributed to the human/system actor that performs it; its content points to imported/unknown Origin. Post-genesis interactive registration workflows remain deferred.

Each successful durable command publishes one logical Contribution, its exact effect/update, any new Origin records, one resulting private Version, and its successful command receipt atomically. Several Contributions can share a semantic group ID for presentation.

The early in-memory implementation may use a full snapshot per Contribution for bounded prototype and qualification fixtures. The Step 11 browser target uses immutable effects/update chunks, periodic physical recovery checkpoints, and a small CAS head. Product History remains independent of either representation.

Use globally unique `CommandId` values. Check a previously successful CommandId before stale-version rejection:

- an exact retry returns the original receipt and emits no new Contribution or notification;
- reuse with different canonical request content is an error.

Serialize local commits internally. Perform expected-Version checking inside that serialization boundary. Two concurrent requests against the same base produce exactly one success.

Use canonical RFC 3339 UTC timestamps with millisecond precision.

## 8. Semantic Checkpoint and restore

A semantic **Checkpoint** is the `checkpointCurrent` History command defined by the architecture.

It must:

1. validate the expected base Version;
2. append one attributed Checkpoint Contribution;
3. append one resulting Version whose document material equals the base;
4. advance the private head; and
5. expose the resulting VersionToken through History.

Do not use `checkpoint` for semantic editor groups or ordinary durable editor Contributions.

Restore validates its expected current Version and historical target, then appends a new restore Contribution. In the local single-writer MVP its resulting material matches the historical target. Reinserted content has fresh carrier identities and preserves historical Origin; the new Contribution records the restoring actor and target Version. Restore never rewinds or deletes History.

The future replicated form is causal compensation against the frontier observed by the restoring actor and preserves unseen concurrent work. `COLLABORATION_MODEL.md` owns that extension.

## 9. Read isolation and notifications

Queries, History pages, summaries, exact materializations, and editor-content reads return detached values.

No frontend API exposes private `RevisionRecord`, archive objects, engine-owned byte arrays, live Y.Doc/Automerge references, or storage collections.

After successful publication, emit one invalidation notification. Failed commands and exact idempotent retries emit none.

## 10. Read-only workspace and structural editing

The first browser workspace is deliberately plain.

Welcome actions:

- New blank document;
- Import Markdown;
- Open `.coedit`; and
- Open bundled sample.

Workspace behavior:

- render the continuous Block document from engine queries;
- derive outline labels from the same selected InlineContent as manuscript text;
- show import diagnostics;
- support current/historical selection without mutating History;
- provide a development-only inspector; and
- retain the VersionToken returned with each projection for later edits.

Structural editing uses only `DocumentEngine.execute`. React does not mutate revisioned state directly.

Support create, move, nest, reorder, delete, tag, InlineContent selection/reordering, and `childrenPresentation` changes.

## 11. Interactive editor durability and semantic grouping

Separate durable publication from human-readable grouping. Every submitted editor command that succeeds creates one immutable Contribution and Version and commits through the repository protocol. Adjacent Contributions can share one `semanticGroupId`; History can collapse them for presentation without rewriting physical History.

The editor may combine transient ProseMirror transactions before submission, but it must submit promptly at a minimal safe boundary and before a controlled transition can hide, replace, retarget, export, save, restore, or close the editor context.

Accepted behavior:

- IME composition is not split mid-composition;
- paste, cut, selection replacement, formatting, undo, and redo are atomic editor actions;
- unrelated dirty work is submitted before an atomic action;
- insertion/deletion mode changes, idle, real focus/editor-owner departure, and controlled transitions seal the current semantic group;
- clean navigation creates neither a command nor a Contribution;
- submitted immutable commands retain FIFO order;
- failure retains the exact detached command and editor work needed for retry;
- degraded durability, quota, and conflict are visible;
- no later command overtakes a failed head; and
- typing is not blocked merely because two whole-artifact serializations are pending, because normal durability does not serialize the whole artifact.

Time, character, and memory thresholds are tunable UX/repository policy recorded with measurements. They are not product History semantics. The preserved 20-grapheme, 30-second, and two-pending-capture constants remain test evidence only.

## 12. Lenses and comparison

Implement lenses as application queries over an explicit Version.

Initial lenses:

- default/main: first `view:main`, otherwise first InlineContent;
- summary: first `view:summary`, otherwise default/main.

If several contents match, select the first in vector order and return a projection diagnostic. Zero contents means no own rendered content.

Initial lenses preserve the complete Block tree. They do not silently reparent Blocks.

Historical comparison aligns Blocks by stable `BlockId` and reports unmatched subtrees. Do not guess correspondence.

Markdown rendering belongs to `MARKDOWN_INTERCHANGE.md`.

## 13. Browser durability

The browser composition root supplies the IndexedDB implementation of the engine repository port. It stores private immutable Contribution/effect/checkpoint records plus a small compare-and-swap head. The repository is not a second semantic document authority and the UX does not parse its records.

Pre-encode and hash immutable records before opening one short IndexedDB transaction. Inside that transaction, check the expected head/generation, insert immutable records and the successful CommandId receipt, then advance the head atomically. Publish the in-memory candidate and notify only after commit.

A mismatch is a persistence conflict; do not silently overwrite another tab's work. `BroadcastChannel` can invalidate other tabs but is not an ordering authority. Use StorageManager persistence/quota capabilities where available, return typed failures, retain exact retry work, and offer explicit `.coedit` backup.

Normal autosave does not assemble or rewrite a complete `.coedit` artifact. `BROWSER_PERSISTENCE.md` owns recovery, compaction, multi-tab, quota, and verification details.

Portable-file dirty state is the comparison between the engine's current token and the token last transported successfully through explicit Save/export. Repository durability status separately compares the published engine Version with its committed repository head; they normally advance atomically.

## 14. Final infrastructure assessment

After the strict MVP vertical slice works, measure before adopting new infrastructure.

Before SQL or OPFS, require evidence about document size, update/chunk growth, recovery and materialization latency, query needs, attachment needs, compaction, and atomicity limits. Do not adopt PGlite, RxDB, SQLite-WASM, or `y-indexeddb` as a substitute for Coedit's semantic repository transaction.

Before a native shell, require a concrete browser-inadequate need. Tauri can wrap the validated application through the same ports; it does not redefine the document engine or recreate a Rust domain authority. Electron requires a demonstrated need for a bundled consistent Chromium runtime.

Before networked collaboration, apply `COLLABORATION_MODEL.md` in full. Local linear History and bounded full snapshots are private MVP choices, not distributed-system contracts. One logical collaborative document per Coedit document is the default; sharding requires measured evidence and preservation of atomic multi-target Contributions.

Provenance visualization/analytics, comments, durable discussions, AI-provider integration, authenticated claims, signing, and collaboration are post-MVP phases. Minimum Origin carrier behavior is part of MVP qualification and recovery.

## 15. Reuse rule

Use `PRESERVED_BRANCH_RECONCILIATION.md` as the single reuse/traceability inventory.

Do not duplicate a second salvage table here. When a preserved implementation detail conflicts with a current authority, current authority controls. When the conflict reveals a non-trivial design choice, stop and record that choice before implementation.
