# MVP architecture

**Status:** Accepted clean-slate MVP direction.

This document is authoritative for component ownership and the public document-engine boundary. Product ontology belongs in [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md). Implementation order belongs in [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md). Capacity classification belongs in [`CAPACITY_AND_PERFORMANCE_TARGETS.md`](CAPACITY_AND_PERFORMANCE_TARGETS.md). InlineContent Media Types and universal replacement belong in [`INLINE_CONTENT_PAYLOADS.md`](INLINE_CONTENT_PAYLOADS.md). Attributed allowlisted fine-grained text, durable text Range behavior, Markdown interchange, `.coedit`, and browser persistence details belong in their focused specifications. Post-MVP replication belongs in [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md).

The document engine is a logical backend. In the MVP it runs locally in the browser process. It does not need to be a server, worker, native process, or separate package.

## 1. MVP definition

The prototype has two principal components:

1. A headless document engine owns durable document state, validation, commands, queries, History, portable serialization, and change notification.
2. A browser UX renders query results, gathers edits, invokes engine commands, and handles browser capabilities and transient interaction state.

Markdown import/export, file transport, the browser repository, clipboard handling, payload-aware editors/renderers, and future AI tools are adapters around this boundary. They are not alternate document authorities.

```text
Browser UX ------------------+
Markdown importer -----------|
Markdown renderer -----------+--> public engine API --> Document engine
Payload adapters ------------|
Future AI tools -------------|                              |       |
Portable file transport -----+                    repository port  portable codec
                                                          |              |
                                                 memory / IndexedDB    .coedit bytes
```

The strict MVP can import Markdown, inspect and edit the Block tree and InlineContents, use allowlisted fine-grained text and opaque payloads, replace any InlineContent content atomically, use lenses, inspect and restore History, create semantic Checkpoints, create and resolve durable text Ranges, export Markdown, save/reopen `.coedit`, and survive browser reload.

Tauri, Rust, SQLite, AI providers, provenance visualization, comments, durable discussions, multi-user networking, fine-grained non-text editing, signed claims, and final History compaction are not MVP requirements. Minimum protected Origin metadata is an MVP foundation even though a provenance product is not.

## 2. Responsibility boundary

### 2.1 Document engine

The engine owns:

- `Block`, `InlineContent`, Media-Type-labelled InlineContent payloads, Media-Type validation, Origin records, and tags;
- the universal atomic whole-payload replacement contract for every Media Type;
- allowlisted fine-grained text canonical text state, intrinsic formatting, and protected fine-grained Origin;
- opaque payload byte state and payload-level Origin;
- document and History invariants;
- typed, attributed, version-checked, atomic command application;
- stable document, content, Contribution, and Version identities;
- current projections and exact historical materialization;
- carrier-neutral allowlisted fine-grained text Range creation, span and text resolution, rationalization, parsing, serialization, and reinjection;
- lightweight History listing and semantic changeset summaries;
- semantic Checkpoint creation;
- compensating restore;
- validation and lossless `.coedit` serialization;
- change notifications after successful publication;
- private choices about snapshots, deltas, CRDT updates, replicated registers, indexes, caching, compaction, and storage representation; and
- atomic publication through a supplied in-memory or durable repository port.

Every client-originated durable mutation enters through `execute`. No client receives a privileged persistence path.

The engine does not assign application meaning to payload text or bytes. Block and InlineContent boundaries imply no character or textual separator. Payload-aware adapters decide how content is edited and presented.

### 2.2 Browser UX

The UX owns:

- rendering query results and diagnostics;
- selecting the application editor/renderer appropriate to an InlineContent Media Type;
- selection, focus, disclosure, active lens, dialogs, and editor lifecycle;
- gathering and grouping user intent;
- translating presentation intent such as paragraph, line-break, list, or section actions into document operations;
- uncommitted editor drafts and composition state;
- semantic edit-group presentation and controlled editor transitions;
- file pickers, downloads, clipboard access, and browser-storage interactions;
- obtaining a free-form human Contributor display name before new-session creation;
- deciding where an opaque `.coedit` artifact is transported;
- presenting repository durability, quota, persistence, conflict, retry, and backup status; and
- tracking the Version most recently transported successfully.

The UX does not mutate returned domain objects, read a private ledger/archive, reconstruct History, parse `.coedit`, or apply raw replication state as durable truth.

### 2.3 Adapters

Adapters translate between an external concern and the engine:

- the Markdown importer plans ordinary typed allowlisted fine-grained text and structural operations plus imported Origin claims;
- the Markdown renderer queries an explicit Version and emits Markdown plus diagnostics;
- the allowlisted fine-grained text editor translates editor transactions into fine-grained text operations;
- a future opaque payload or structured-data application adapter can use universal whole-payload replacement without receiving direct carrier authority;
- file adapters transport opaque `.coedit` artifacts;
- the browser repository persists private immutable engine records behind its port;
- clipboard adapters validate private Coedit text fragments and sanitize ordinary HTML; and
- a future AI adapter queries explicit Versions and submits attributed commands.

Authority, not deployment, defines the boundary.

### 2.4 Semantic interpretation and capacity boundaries

Canonical document state stores durable document facts and accepted product semantics. Adapters and consumers derive judgments that depend on current source syntax, payload format, host capabilities, security policy, renderer behavior, or implementation capacity.

Before a new classification becomes durable state, ask:

1. Is it an objective fact about the document, or a judgment made by the current adapter, environment, policy, or implementation?
2. Would it still mean the same thing in another renderer, host, importer version, security policy, payload consumer, or future application?
3. Is there a real document workflow that requires it to survive independently of the component that derived it?

A contextual classification that can change with the consumer and has no durable workflow normally remains a diagnostic, projection result, activation decision, or other boundary result. ADR 0005 records the rationale and examples.

The same rule applies to capacity. `CAPACITY_AND_PERFORMANCE_TARGETS.md` owns the detailed classification and default rule. The domain has no arbitrary finite size ceiling only because one carrier, parser, codec, browser, payload handler, or storage implementation has finite resources. An actual implementation constraint returns an explicit capacity/resource failure and does not make larger content semantically invalid. Any public engine error can report that a local bound or capacity limit caused the operation to fail when applicable. The error must identify that cause as a capacity/resource failure so that clients do not mistake it for a statement that the document or requested state is semantically invalid. This rule does not require the MVP to define a complete error taxonomy in advance. Hostile external inputs still require bounded processing at the consuming boundary.

## 3. Public engine behavior

The public API promises behavior rather than storage layout. It is asynchronous from the start.

The following TypeScript is illustrative. The semantic boundary is normative; exact names are not.

```ts
type VersionToken = string & { readonly __brand: "VersionToken" };

interface Versioned<T> {
  readonly documentId: DocumentId;
  readonly version: VersionToken;
  readonly observedAt: VersionToken;
  readonly value: T;
}

interface ContributionContext {
  readonly contributorId: ContributorId;
  readonly sessionId?: SessionId;
  readonly semanticGroupId?: SemanticGroupId;
  readonly summary?: string;
}

interface CommandRequest {
  readonly commandId: CommandId;
  readonly expectedVersion: VersionToken;
  readonly command: DocumentCommand;
  readonly context: ContributionContext;
}

type DocumentCommand =
  | {
      readonly kind: "operations";
      readonly operations: readonly DocumentOperation[];
    }
  | {
      readonly kind: "importMarkdown";
      readonly operations: readonly DocumentOperation[];
      readonly source: ImportSourceMetadata;
    }
  | { readonly kind: "checkpointCurrent" }
  | { readonly kind: "restore"; readonly target: VersionToken };

interface CommandReceipt {
  readonly commandId: CommandId;
  readonly contributionId: ContributionId;
  readonly resultingVersion: VersionToken;
}

interface DocumentEngine {
  execute(
    request: CommandRequest,
  ): Promise<Result<CommandReceipt, CommandError>>;
  currentVersion(): Promise<VersionToken>;
  query(
    request: DocumentQuery,
  ): Promise<Result<Versioned<DocumentProjection>, QueryError>>;
  listHistory(
    request: HistoryListQuery,
  ): Promise<Result<HistoryPage, QueryError>>;
  summarizeChanges(
    request: ChangesetQuery,
  ): Promise<Result<ChangesetSummary, QueryError>>;
  materialize(
    version: VersionToken,
  ): Promise<Result<Versioned<MaterializedDocument>, QueryError>>;
  createRange(request: CreateRangeRequest): Promise<Result<Range, RangeError>>;
  resolveRange(
    request: ResolveRangeRequest,
  ): Promise<Result<Versioned<RangeResolution>, RangeError>>;
  resolveRangeText(
    request: ResolveRangeRequest,
  ): Promise<Result<Versioned<string>, RangeError>>;
  rationalizeRange(
    request: ResolveRangeRequest,
  ): Promise<Result<Range, RangeError>>;
  serializeRange(
    request: SerializeRangeRequest,
  ): Promise<Result<SerializedRange, RangeError>>;
  parseRange(request: ParseRangeRequest): Promise<Result<Range, RangeError>>;
  serializePortableDocument(
    request: SerializeRequest,
  ): Promise<Result<PortableDocument, SerializationError>>;
  subscribe(listener: DocumentChangedListener): Unsubscribe;
}

interface DocumentEngineFactory {
  create(
    request: CreateDocumentRequest,
  ): Promise<Result<DocumentEngine, CreateError>>;
  openPortableDocument(
    input: PortableDocumentInput,
  ): Promise<Result<DocumentEngine, OpenError>>;
}

interface CreateRangeRequest {
  readonly expectedVersion: VersionToken;
  readonly input: SpanRangeInput | PositionalRangeInput;
}

interface ResolveRangeRequest {
  readonly version: VersionToken;
  readonly range: Range;
}

interface SerializeRangeRequest {
  readonly version: VersionToken;
  readonly range: Range;
}

interface ParseRangeRequest {
  readonly value: SerializedRange;
  readonly version: VersionToken;
}

interface PortableDocument {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly suggestedExtension: ".coedit";
  readonly version: VersionToken;
}

interface SerializeRequest {
  readonly expectedVersion: VersionToken;
}

interface PortableDocumentInput {
  readonly bytes: Uint8Array;
  readonly mediaType?: string;
}
```

The universal whole-payload replacement operation belongs to the ordinary `DocumentOperation` family. It preserves the target `InlineContentId` while atomically replacing the complete payload value: Media Type, Media-Type-specific content, and the required Origin effect. The Media Type can stay the same or change, and capability dispatch after success follows the resulting Media Type. Payload-specific fine-grained operations reject incompatible Media Types explicitly. Exact operation names and request shapes remain implementation details until their implementation step freezes them.

`RANGE_MODEL.md` owns allowlisted fine-grained text Range behavior. The selected `DocumentEngine` supplies document context. Step 6 Gate C finalizes result wrappers, parse diagnostics, resource-guard behavior, and serialization types without exposing carrier-native objects.

`PORTABLE_DOCUMENT_FORMAT.md` owns the exact `.coedit` wire contract. The UX treats `bytes` as opaque. No specific MIME type is part of the accepted MVP design yet.

## 4. Version and command contract

`VersionToken` is equality-comparable, document-scoped, opaque, and not orderable or decodable by clients.

Every VersionToken remains stable and exactly materializable for the lifetime of its document, including across a lossless `.coedit` Save/Open round trip. A VersionToken remains document-scoped; it need not be globally unique.

The trusted document factory creates genesis with one real root from supplied durable IDs and no Contribution. Root creation is not a structural command. The first successful user mutation creates the first Contribution and resulting Version.

Commands are typed, validated, attributed, atomic, and checked against an expected VersionToken.

Each successful command atomically publishes one logical Contribution, its exact content/structure effect, any new Origin records, one resulting Version, and its successful idempotency receipt. When a durable repository is attached, publication occurs only after the repository transaction commits. A failed command publishes nothing.

Whole-payload replacement is one such durable command effect. It preserves the target InlineContent identity and atomically publishes the replacement Media Type, Media-Type-specific content, and required Origin effect. Under later replication, a causally later replacement supersedes replacements it observed and concurrent replacements select one deterministic current winner. That winner cannot depend on wall-clock time or delivery order. The losing Contributions and Versions remain in History.

Several immutable Contributions can share a semantic group ID for History presentation. Grouping never changes their identities, Versions, or durability.

Command idempotency survives `.coedit` Save/Open. A successful `CommandId` exact retry returns the original receipt and emits no new Contribution or notification. Reuse of the same CommandId with different canonical request content is an error.

The implementation checks an existing successful CommandId before stale-base rejection.

## 5. Query and History contract

A query that returns document state returns both:

- the Version from which the value was materialized; and
- the current engine frontier at which the selector/policy was evaluated.

An edit derived from a current query uses the returned correlated token as its expected base. The UX must not issue a separate version read and assume it is atomic with the projection read.

Initial query behavior supports:

- current or exact document projection;
- outline projection;
- local document descriptor;
- one current payload-aware InlineContent projection;
- one current allowlisted fine-grained text editor-content projection;
- lens/subtree projection;
- exact historical materialization;
- paginated History summaries; and
- semantic changeset summaries.

Checkpoint Contributions are ordinary History entries with an exact resulting VersionToken.

Historical materialization is detached and read-only. Restore always enters through a new command against the current Version.

## 6. Payload and editor-content boundary

A query can return a detached InlineContent payload value sufficient for an application adapter to inspect the Media Type and render or replace the content without carrier access.

The rich-text editor boundary is specifically for allowlisted fine-grained text. Conceptually:

```ts
interface CoeditTextEditorContentValue {
  readonly inlineContentId: InlineContentId;
  readonly mediaType: "allowlisted fine-grained text";
  readonly content: DetachedCoeditText;
}
```

`DetachedCoeditText` contains authored text, native formatting semantics, and protected fine-grained Origin information required for correct editing. It has no document-level `HardBreak` variant. Characters such as line feed remain ordinary text data. It is carrier-neutral at the public boundary.

The editor adapter can reconstruct or bind transient ProseMirror/Tiptap/carrier state from this value or a controlled engine session. Mutating detached local state does not mutate engine state. Requesting a text-editor session for an opaque payload fails explicitly or is not offered by the application.

A durable fine-grained text commit must pass through `execute` and preserve the accepted atomic text-plus-formatting-plus-Origin contract. The client can request ordinary editing intent but cannot assign arbitrary Origin through formatting or raw carrier updates.

An opaque payload adapter receives detached bytes and payload metadata. It can request universal whole-payload replacement but receives no fine-grained opaque-payload mutation or raw carrier authority.

Do not expose a live engine-owned Y.Doc/Automerge object, a formatting-only side channel, an Origin mutation side channel, or a generic payload capability registry merely to support the collaborative-text and generic opaque capability classes.

## 7. Change notification contract

Notifications are invalidation hints, not an alternate state stream.

Conceptually:

```ts
interface DocumentChanged {
  readonly version: VersionToken;
  readonly changeSources: readonly ("local" | "remote")[];
  readonly causes: readonly ("edit" | "import" | "checkpoint" | "restore")[];
  readonly contributionIds: readonly ContributionId[];
  readonly affectedBlockIds: readonly BlockId[];
  readonly affectedInlineContentIds: readonly InlineContentId[];
}
```

The MVP need not emit the `remote` change source. Implementations can coalesce notifications. Failed commands and exact idempotent retries emit none.

## 8. Required workflows

### Interactive allowlisted fine-grained text editing

```text
UX holds transient editor/composition state
  -> a minimal safe editor action is ready for durable commit
  -> UX submits one attributed command and semantic group ID against observed VersionToken
  -> engine validates text + formatting + Origin atomically
  -> repository commits immutable effect/Contribution + CAS head
  -> engine publishes one logical Contribution and Version
  -> engine emits invalidation
  -> UX re-queries
```

IME is not split mid-composition, and paste/cut/replacement/formatting/undo/redo are atomic editor actions. A renderer or editor can interpret text characters or structural operations as presentation breaks, but that interpretation does not add a hard-break entity to the document model. Idle/focus/mode boundaries seal semantic groups; they do not create a second durability ledger. A physical recovery checkpoint is not a semantic History Checkpoint.

If a commit fails, canonical state is unchanged and the UX retains recoverable transient work or presents an explicit retry/discard path.

### Whole-payload replacement

```text
payload-aware client intent
  -> validated replacement for the target Media Type + Origin context
  -> one attributed command against observed VersionToken
  -> engine replaces the complete payload value atomically
  -> repository commits immutable effect/Contribution + CAS head
  -> engine publishes one logical Contribution and Version
  -> engine emits invalidation
```

This workflow is available for every Media Type under the payload contract. It preserves InlineContent identity and can keep or change the Media Type atomically with the content and Origin effect. Fine-grained opaque-payload mutation is not an MVP operation. Mixed replacement/text-edit concurrency remains a Gate B decision under `INLINE_CONTENT_PAYLOADS.md`.

### Semantic Checkpoint

```text
current VersionToken
  -> checkpointCurrent
  -> one Checkpoint Contribution
  -> one new content-identical Version
  -> one invalidation
```

### Markdown import

```text
Markdown bytes
  -> parser/planner
  -> diagnostics + ordinary operations
  -> candidate engine
  -> one atomic imported Contribution
  -> active session replaced only after success
```

`MARKDOWN_INTERCHANGE.md` owns detailed rules. Markdown import initially creates allowlisted fine-grained text; it does not require an opaque payload interchange convention.

### Markdown export

```text
VersionToken + optional lens/subtree
  -> engine query/materialization
  -> Markdown renderer
  -> Markdown + diagnostics
  -> UX transports output
```

For imported/canonical Markdown-representable allowlisted fine-grained text structures, export/re-import must satisfy the normalized Coedit round-trip invariant. Unsupported Media Types produce the focused Markdown non-representability behavior rather than being silently decoded as text.

### `.coedit` Save and Open

```text
UX commits required editor work
  -> supplies observed VersionToken
  -> engine verifies expected Version
  -> engine assembles retained logical records into opaque .coedit bytes + metadata
  -> UX transports bytes
```

If the engine advanced before serialization begins, return `VersionConflict`.

Open validates into a candidate engine. Only a successful open replaces the active session.

### Browser durability

The browser composition root supplies an IndexedDB repository to the engine. Normal commits append immutable Contribution/effect records and advance a small compare-and-swap head in one short transaction. Periodic physical checkpoints bound recovery. Explicit `.coedit` serialization is not the autosave path.

The UX uses StorageManager capabilities where available, reports quota/persistence status, retains retryable work after failure, and offers explicit `.coedit` backup. `BROWSER_PERSISTENCE.md` owns detailed behavior.

## 9. Committed and transient state

Serialization and export observe committed engine state.

Before Save, export, navigation, restore, editor-owner transfer, or another operation that can invalidate active editor context, the UX must use the accepted controlled-transition policy: freeze, submit required work, drain required durable commands, then continue or expose a deliberate discard decision.

Selection, focus, disclosure, active lens, dialogs, presence, cursor state, retry UI, and unfinished input are transient unless a later feature explicitly makes them durable.

## 10. History representation is private

The public promise is:

> Every Contribution can be listed and summarized. Every VersionToken can be materialized exactly and restored through the engine API for the lifetime of its document.

A complete private snapshot per Contribution is acceptable only in bounded in-memory tests or an explicitly identified early prototype because it is simple to verify. It is not the Step 13 browser target, a public data type, or a long-term storage contract.

The browser target uses immutable Contributions/effect chunks, periodic physical recovery checkpoints or cached materializations, and a small CAS head. The engine can change structural sharing, chunking, caches, indexes, checkpoint cadence, or compaction only if it preserves every Version and the text lineage needed by Range resolution. Physical snapshots create no product Versions.

## 11. Compatibility with later consumers

A future AI tool queries an explicit Version and submits typed attributed commands. AI content receives software-agent Origin according to the target payload contract; human acceptance is a separate Contribution. It has no privileged mutation or raw-carrier path.

A future structured payload can initially use the same whole-payload replacement boundary without adding fine-grained CRDT operations. Additional payload-specific editing or content-local addressing requires an explicit focused contract.

For collaboration, each UX talks to a local engine. Replication integrates remote work through private engine machinery and surfaces ordinary invalidation notifications.

Product Contributions remain distinct from carrier transport effects. `COLLABORATION_MODEL.md` defines the later distributed constraints.

## 12. MVP architecture verification

The MVP must prove:

- core commands, queries, History, and serialization require no React, file API, or IndexedDB;
- allowlisted fine-grained text and representative opaque Media Types are explicit Media Types and no payload-specific operation silently coerces between them;
- whole-payload replacement succeeds for both the collaborative-text and generic opaque capability classes, preserves InlineContent identity, can keep or change Media Type, assigns the required Origin, and fails atomically;
- concurrent whole-payload replacements choose the same deterministic winner on every replica with the same valid causal input, independent of arrival order and wall-clock time;
- every losing concurrent replacement remains represented by immutable History and exactly materializable Versions;
- interactive text edits and Markdown import use the same validation, attribution, atomicity, and History boundary;
- text and formatting cannot publish in mismatched state;
- every live fine-grained allowlisted fine-grained text unit has one protected Origin, and ordinary formatting cannot alter it;
- each current opaque payload value has its required payload-level Origin;
- copy and restore preserve Origin according to the payload contract while attributing their new Contributions to the acting Contributor;
- no Block or InlineContent boundary manufactures a character or textual separator;
- line-feed, carriage-return, or another text character is not invalid merely because an application can present it as a break;
- semantic Checkpoints publish one attributed Contribution and one content-identical Version;
- historical materialization is exact, detached, and read-only;
- the headless Range service accepts only allowlisted fine-grained text, records each Range's creation Version, rejects direct creation when any supplied target is unresolved or non-text, preserves arbitrary source order and multiplicity, resolves surviving spans in creation and lineage order, concatenates exact stored text without inferred separators, and never follows copied content;
- explicit rationalization merges only consecutive exact adjacency caused by a lineage merge;
- best-effort parsing omits unresolved or ambiguous members without speculative rebinding, and document-relative serialization round trips each surviving member;
- Range operations expose no live carrier object, document-wide holder registry, or universal opaque payload locator;
- editor-content and payload values are detached and cannot mutate engine state;
- restore appends instead of rewinding;
- `.coedit` serialization checks its expected Version;
- a failed Save/Open does not claim success or replace the active engine;
- `.coedit` round trip preserves Media Types, opaque payload bytes, Origins, current and historical behavior, and command idempotency;
- repository commit and CAS-head advancement are atomic, and failure publishes no partial in-memory state;
- IndexedDB recovery, competing-tab conflict, quota denial, and explicit backup paths are verified;
- Markdown imported documents satisfy the export/re-import normalized equivalence property for their allowlisted fine-grained text subset; and
- a different private History representation can pass the same public contract suite.

The strict MVP deliberately does not prove the complete network protocol, a provenance UI, Comment records or repair UX, authenticated attribution, signed claims, fine-grained non-text collaboration, or AI-provider collaboration. It does prove Media-Type-labelled payload replacement/convergence, the reusable headless text Range service, minimum Origin invariants, and carrier feasibility those capabilities require.
