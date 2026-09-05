# Collaboration and replicated History model

**Status:** Accepted post-MVP direction and compatibility constraints. Networked
collaboration is not part of the MVP. Exact transport and causal-envelope
algorithms remain future decisions.

This document records how collaboration should fit around the document engine
and what eventual consistency must mean for Coedit. It complements
[`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md), which defines the local engine API,
[`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md), which
defines content attribution and comment-target behavior,
[`STRUCTURAL_CARRIER_MODEL.md`](STRUCTURAL_CARRIER_MODEL.md), which defines the
accepted Block carrier and structural merge semantics,
[`CAPACITY_AND_PERFORMANCE_TARGETS.md`](CAPACITY_AND_PERFORMANCE_TARGETS.md),
which defines capacity classification and resource-guard semantics, and
[`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md), which defines the current
implementation order.

## 1. Decision summary

- Each editing client normally owns one local `DocumentEngine` replica for an
  open document.
- A UX talks only to its local engine through commands, queries, and change
  subscriptions.
- Engines synchronize through a private replication adapter, normally using an
  authenticated relay/service. The network protocol is not part of the frontend
  API or pure domain vocabulary.
- The engine validates, integrates, and atomically publishes remote effects.
  React never exchanges, interprets, or applies CRDT updates or remote
  changesets.
- Product History consists of immutable, attributed Contributions. It is not
  reconstructed from carrier updates, editor transactions, debounce boundaries,
  relay batches, wall-clock timestamps, or packet-arrival order.
- One logical collaborative document normally contains the Block registry and
  all InlineContents so structure, text, formatting, Origin, and Contribution
  effects can publish atomically.
- Block structure uses the accepted flat placement carrier in
  `STRUCTURAL_CARRIER_MODEL.md`: one placement per `BlockId`, preorder-plus-depth
  projection, Block-local payload state, and semantic-update-over-delete
  behavior.
- Content Origin answers who or what created material. Contribution actor
  answers who performed the operation. Copy and restore preserve Origin while
  recording the new actor and derivation.
- Semantic checkpoints are ordinary Contributions. They must converge and
  replicate like edits and restores.
- Eventual consistency must cover the causal Contribution graph and internal
  collaborative state, not merely equal rendered text.
- A permanent global numeric revision sequence is not part of the public
  contract. Versions are identified by opaque tokens that may represent causal
  frontiers.
- Presence, cursors, selections, and typing indicators are ephemeral, lossy
  collaboration state. They are not Contributions and are absent from portable
  document History.
- The MVP's single head, linear ledger, and optional full snapshots are a private
  special case hidden behind the engine API.

This is a known family of distributed-systems solutions, but it is not
“automatic.” CRDTs and causal change graphs provide the machinery; Coedit must
still define transport, causal publication, restoration, checkpointing,
authorization, retention, and failure handling explicitly.

## 2. Topology and ownership

```text
+------+     commands / queries / events     +------------------+
| UX A | <---------------------------------> | Local engine A   |
+------+                                     +--------+---------+
                                                      |
                                             private replication
                                                      |
                                             +--------+---------+
                                             | adapter / outbox |
                                             +--------+---------+
                                                      |
                                             authenticated relay
                                                      |
                                             +--------+---------+
                                             | adapter / inbox  |
                                             +--------+---------+
                                                      |
+------+     commands / queries / events     +--------+---------+
| UX B | <---------------------------------> | Local engine B   |
+------+                                     +------------------+
```

The relay may provide authentication, authorization, routing, persistence,
deduplication, offline catch-up, quotas, acknowledgements, and optional ordering.
It need not be the sole merge authority or the only component able to
materialize a document.

The replication adapter can be composed beside a pure engine core for testing.
“The engines collaborate” describes the authority boundary: replication is
below the UX and remote durable effects become engine state only after engine
validation and atomic integration.

### Alternatives not chosen as the default

A single central engine shared by every UX can simplify ordering, but it makes
offline work harder, adds interaction latency, and turns server availability
into editor availability. It remains a possible deployment mode, not the
foundation of the client API.

Frontends exchanging changes directly would leak causal dependencies,
idempotency, retry, authorization, CRDT state, and conflict handling into UI
components. That is explicitly rejected for durable work. Presence rendering
may be UX-adjacent, but its channel remains separate and ephemeral.

## 3. Four distinct kinds of state

| Layer             | Purpose                                                                                | Portable/product History?                     |
| ----------------- | -------------------------------------------------------------------------------------- | --------------------------------------------- |
| Logical document  | Blocks, InlineContents, tags, CollaborativeContent, Origins, durable comments/overlays | Yes                                           |
| Product History   | Immutable attributed Contributions and materializable Versions                         | Yes                                           |
| Replication state | CRDT identities, placements, activity markers, tombstones/delete sets, causal metadata | Only what exact recovery/convergence requires |
| Presence          | Online state, cursors, selections, typing indicators                                   | No                                            |

These layers may be stored together internally, but their semantics must remain
separate.

Carrier updates provide convergence mechanics. Contributions preserve product
meaning, attribution, summaries, and user-visible History. One Contribution may
require several network frames, and one network frame may batch several
Contributions. Neither changes the logical Contribution boundary.

A Contribution that touches the Block tree and several InlineContents becomes
visible atomically to engine queries. The replication ingress buffers incomplete
payloads or missing dependencies rather than publishing a partial state.

Internal placements, activity markers, tombstones, and causal metadata do not
violate the logical domain decision that live `Block` and `InlineContent`
entities have no carrier fields. They are private replication/storage machinery.

Inbox/outbox acknowledgements, connection retries, and buffered dependency
requests are transport bookkeeping, not a fifth kind of document truth. They may
need restart-durable local storage, but need not travel in a portable document.
An authored durable Contribution that has not yet synchronized is document state
and must not be confused with its delivery bookkeeping.

## 4. Local and remote change flows

### Local work

```text
user intent
  -> attributed, idempotent command against a VersionToken
  -> engine validation and invariant checks
  -> immutable Contribution + exact convergence effects
  -> atomic repository commit and local publication
  -> change notification to the UX
  -> replication outbox
```

The UX re-queries after the notification. It does not receive a raw replication
payload to apply.

Before networked collaboration ships, Step 3 carrier behavior is necessary but
not sufficient to permit offline publication. The pre-network gate must also
prove the exact causal envelope, dependency handling, authorization,
resource-capacity handling, restart-safe transport, and atomic integration
behavior.

Checkpoint creation uses the same flow. A checkpoint created locally is a
semantic Contribution against the exact frontier observed by its author. It does
not claim that the frontier is globally latest.

### Remote work

```text
authenticated remote envelope
  -> deduplication and causal-dependency check
  -> schema, authorization, resource, and domain validation
  -> private remote-integration path
  -> preserve original Contribution ID, parents, attribution, and effects
  -> atomic publication
  -> change notification with change source "remote"
```

Remote work is not reissued as a new local user command, which would duplicate
History and attribution. The local-command and remote-integration paths do share
schema validation, invariants, resource-capacity checks, contribution
verification, and atomic publication rules.

Delivery is idempotent. An already integrated Contribution is a no-op; reusing
its ID with different content is corruption. Missing parents are buffered or
requested. Invalid or unauthorized records are rejected without partially
changing visible state. A record that exceeds one receiver's implementation
capacity is not thereby invalid: the receiver must retain or visibly quarantine
enough information to retry, or stop incompatibly, rather than silently discard
the record and integrate a different valid set.

**Maturity:** Pending selection.

**Owner:** This document.

**Promotion gate:** The post-MVP network-collaboration gate.

That gate selects the exact persistence, retry, quarantine, relay, and recovery
mechanics. This MVP direction fixes only the non-semantic classification,
visibility, and convergence requirements.

## 5. Product History is a causal Contribution graph

The local MVP may store a one-parent chain. Replicated History generalizes it to
an immutable causal graph:

```text
        A
       /
G ----                   current frontier = {A, B}
       \
        B

A -----\
        >--- C           C observes and joins both branches;
B -----/                 current frontier = {C}
```

`A` and `B` are concurrent Contributions based on `G`. Neither is “really
second.” The combined version is the causal frontier `{A, B}` plus its causal
closure. It is a named/materializable Version even though no synthetic merge
Contribution or fake History row exists. `C` names both heads as parents and
joins the graph.

Use these terms consistently:

- **Contribution:** an immutable, attributed semantic action and graph node;
- **Version:** a materializable causal frontier and its closure;
- **History:** the causal Contribution graph;
- **VersionToken:** an opaque public identifier for a Version; and
- **Checkpoint:** a semantic Contribution whose resulting Version has document
  material identical to its declared base/frontier.

A conceptual replicated Contribution envelope contains:

```text
stable Contribution ID (and possibly a content hash)
command ID and idempotency identity
document ID
causal parent frontier
acting Contributor identity and authenticated principal claim where applicable
originating replica identity
schema/capability version
semantic kind and optional semantic group ID for presentation
exact convergence payload or verified content-addressed effect reference
affected targets
optional source Version, Origin, and derivation references
optional human summary
authored wall-clock time for display only
```

The precise hash, signature, and wire encoding remain open. IDs must be globally
unique and immutable; content-addressing is attractive but not yet selected.

A human-authored summary deliberately stored on a Contribution is immutable,
replicated metadata. A summary derived later by a local heuristic or LLM is a
disposable projection unless a separate attributed command deliberately
persists it. Replicas must not silently persist independent derived summaries
under the same Contribution identity.

`VersionToken` may internally encode or hash a canonical frontier. Public clients
must treat it as opaque so the MVP's revision ID can later become a frontier
without changing query, checkpoint, restore, or save workflows.

## 6. Why arrival order cannot be global History

Two replicas can receive the same concurrent events in different orders:

```text
Replica A observes: G -> A -> B
Replica B observes: G -> B -> A
```

Both may converge to the same visible document while retaining incompatible
claims about a supposedly permanent linear History. Packet order, local commit
row number, and wall-clock timestamp therefore cannot define shared causal
identity.

A deterministic topological display order may be derived from causal order plus
a stable tie-breaker. That order is presentation only:

- it is not version or Contribution identity;
- a late concurrent event may appear between rows already displayed;
- row numbers must not be restore or checkpoint targets; and
- the same causal graph, not the incidental arrival order, is authoritative.

If the product later requires a final global sequence number assigned at commit
time, it needs coordination through a sequencer, consensus system, or other
central authority. Offline Contributions would be provisional until accepted by
that authority. This is a valid alternative, but it is a different availability
tradeoff and is not silently provided by eventual consistency.

## 7. Convergence contract

Equal rendered text is necessary but insufficient. Two replicas might render
identically while differing in CRDT identities, deletion history, relative
anchors, or product History, causing later edits to diverge.

Once two authorized replicas possess the same complete set of valid
Contributions, they must have:

1. the same immutable causal Contribution graph and metadata;
2. collaborative-state-equivalent carrier state, including identity, placement,
   Block activity, delete, formatting, Origin, and stable-cursor behavior, even
   if byte encodings differ;
3. the same validated Block tree, ordering, tags, and CollaborativeContent
   projection;
4. the same materialization for every advertised causal frontier; and
5. the same durable current frontier: the canonical set of maximal integrated
   heads.

This implies convergence tests must compare Contribution sets/graphs, causal
frontiers, CRDT state equivalence, and logical materializations. A screenshot or
plain-text comparison cannot establish correctness.

Storage snapshots, update merging, caches, indexes, and compaction may differ
between replicas. They are physical representations, not part of equality, as
long as they preserve the same advertised causal graph and exact materialization
behavior. Physical compaction must not make a user-visible Version impossible to
identify, materialize, or restore unless a future explicit retention policy
first changes that product promise; an advertised token is not silently
invalidated.

Semantic checkpoint Contributions are different. They are part of Product
History and therefore must converge like any other Contribution.

## 8. CollaborativeContent and Block structure use one carrier boundary

Convergent rich-text changes and structural placement have different semantics,
but Step 3 qualifies them inside one logical collaborative document.
`STRUCTURAL_CARRIER_MODEL.md` owns the structural contract.

The accepted structural representation uses one Block-local namespace per
`BlockId` with one atomic `{ position, depth }` placement, a private semantic
activity marker, and Block-local payload. The recursive tree is projected by
global position plus depth. There is no authoritative replicated parent pointer.
This projection makes every surviving Block visible exactly once and prevents a
structural cycle in the projected tree.

Structural commands map to preorder placement. A new or moved Block root receives
`parent.depth + 1`; insertion follows the complete previous sibling subtree. A
subtree move allocates a fresh ordered run and applies one depth delta while
preserving Block identity and relative order.

The accepted concurrency preference is non-destructive:

- a move concurrent with deletion of the same Block keeps the moved Block alive;
- a semantic payload update concurrent with deletion of the same Block keeps the
  updated Block alive;
- payload mutation updates the Block's private activity marker in the same
  logical carrier change; and
- activity is local to the Block that changed, so editing a descendant does not
  keep every ancestor alive.

If a parent is deleted while a descendant survives, the flat projection can place
the descendant under another preceding shallower Block. Visible repairable
mis-parenting is preferred over unreachable surviving content.

Position allocation should avoid exact primary-position collisions. Stable
identity supplies a deterministic tie-break if a collision occurs. Insertion
inside an existing collision run can require replicated normalization of later
placements before the dependent insertion. Normalization is a private effect of
the structural Contribution, not a separate product move or History action.
Deterministic normalization and suppression of normalization-only resurrection
are preferred when inexpensive, but residual behavior can be accepted and
recorded because exact collisions should be exceptional.

These accepted carrier semantics close the former representation-level questions
for Step 3. They do not by themselves complete the network protocol. Before real
clients connect, the system must still qualify causal Contribution envelopes,
transport, dependency buffering, authorization, restart recovery, hostile input,
restore overlap, and exact integration rules.

### Collaborative-document and annotation boundaries

Use one logical collaborative document per Coedit document by default. It holds
the Block registry and Block-local payload namespaces so one transaction can
publish structure, several text values, Origins, and Contribution effects
atomically. An editor binds only one active InlineContent; the recursive Block
tree is not a ProseMirror tree.

This is a private carrier boundary, not a public `Y.Doc` or Automerge type.
Subdocuments or sharding require measured evidence and must preserve atomic
multi-target behavior and portable recovery.

Formatting and Origin do not use external anchors. Future CommentTargets use
carrier-stable cursors and explicit affinity as their primary location, combined
with quote/prefix/suffix/position evidence for validated repair. Copying content
creates new carrier identities; same-document copy retains Origins but comment
targets do not silently migrate to the copy. Moving an InlineContent while
preserving its identity and carrier state can preserve its comment cursors.

## 9. Frontend-facing History behavior

The collaboration model preserves the same public behavior as the local MVP.
The frontend can:

- list lightweight Contribution summaries without materializing historical
  documents and separately identify advertised Versions;
- see attribution, semantic kind, affected targets, and concurrency;
- identify checkpoint Contributions and their exact resulting Versions;
- query the current frontier as an opaque `VersionToken`;
- materialize any advertised token read-only;
- restore a selected version through a new mutation; and
- subscribe to invalidation/change hints and re-query.

Raw carrier updates, causal storage rows, placements, activity markers,
tombstones, inbox/outbox entries, and relay packets never cross this boundary.
The portable document is also opaque to the UX even when it contains causal and
CRDT state.

## 10. Restore, checkpoints, and undo under concurrency

Restore preserves its **product** semantics: it never rewinds or deletes History.
It creates a new attributed compensating Contribution that targets a stable
`VersionToken` and declares the frontier from which it was authored.

A replicated restore does not install an old carrier snapshot or resurrect old CRDT
state wholesale. It emits fresh deterministic text/tree effects relative to its
declared base. The resulting logical material may equal the historical target
while its hidden CRDT identities, deletes, and anchors differ in a way that is
correct for the new causal context.

A restore command names target Version `T` and the author-observed frontier `B`.
When applied to current merged frontier `H`, it compensates only effects known at
`B` that differ from `T`; it does not delete material introduced outside `B`.
Historically deleted material is inserted under fresh carrier identities while
retaining its historical Origin. The restore Contribution records the actor,
`T`, `B`, and its exact causal effect.

Same-region or structural overlap that cannot be reconciled under deterministic
semantics is surfaced as an explicit conflict. A separately authorized and
coordinated "restore for everyone" can provide a global-reset workflow, but an
ordinary restore never claims that effect or silently erases disconnected work.
The exact text/structural overlap representation and UX must pass the pre-network
gate before collaboration ships.

A checkpoint targets the exact causal frontier from which it is authored. It is
itself a new immutable Contribution and produces a new Version with logically
identical document material. Later edits do not mutate that checkpoint Version.
Several concurrent or incomparable checkpoints can exist without conflict. They
are independent historical statements, not competing claims for one global
"accepted" state.

Local editor undo and product History restore are different operations. Undo may
generate a compensating edit in current collaborative state; it must not delete
already replicated Contributions or rewrite the causal graph.

## 11. Identity, authorization, and presence

Keep these identities distinct:

- account/security principal (`UserId` or `PrincipalId`);
- durable attribution identity (`ContributorId`);
- replica/device identity (`ReplicaId`);
- browser/editor session identity (`SessionId`); and
- transient transport connection identity.

A user may have several replicas and sessions. An AI or automation Contributor
may act under a human principal's authorization. Wall-clock timestamps are
display metadata, not causality or authorization evidence.

Contributor registration and identity metadata referenced by a Contribution
must also converge: it is causally replicated document metadata or is backed by
verifiable authorization claims available to every receiver. A remote
Contribution whose contributor is not yet known is buffered or rejected; a
replica never invents a local substitute identity.

The relay and receiving engine validate document access, envelope authenticity,
schema/capability versions, and selected resource-capacity guards. Offline work
created before an authorization change may need to be provisional, quarantined,
or rejected; that policy is open and must be visible rather than silently
dropping work.

Replicas must also converge on which envelopes are valid. Schema/capability and
authorization decisions cannot depend on unsynchronized local clocks or
different silent policy versions; they require verifiable context, replicated
policy state, or relay finality. An incompatible replica stops or quarantines
the affected records visibly instead of integrating a different valid set.

Credentials, relay addresses, connection state, acknowledgements, retry queues,
and presence do not enter portable document truth. Unsynchronized durable
Contributions are document state and must survive restart; delivery bookkeeping
is not product History.

Presence uses a separate lossy channel. Dropped cursor or typing updates never
create a Contribution, change a version, or affect save/recovery.

Provenance trust has three distinct levels: descriptive local Origin claims;
authenticated engine/relay-enforced attribution; and future signed publication
attestations. Carrier peer/client IDs never establish any of those identities.
Stable attribution IDs reference separately managed profile/display data so
retention and anonymization do not require rewriting content or causal identity.

## 12. Protocol capabilities required later

The future replication protocol will need, at minimum:

- document, replica, Contribution, update, and message identities;
- schema and capability negotiation;
- causal dependencies/frontiers and, where useful, CRDT state vectors;
- idempotent delivery and content-conflict detection;
- acknowledgements plus durable outbox/inbox recovery;
- authenticated authorization and resource-capacity guards;
- dependency requests, catch-up, and bootstrap-snapshot transfer;
- atomic envelopes for multi-target Contributions;
- Origin, source, and derivation records plus their authorization rules;
- deterministic validation/rejection semantics; and
- an explicit relationship between logical Contribution metadata and exact CRDT
  or structural effects.

These fields are private protocol concerns. They must not turn the UX-facing
`VersionToken` into a structure the frontend interprets.

The exact capacity guard values and retry/quarantine protocol remain pending
until the network-collaboration gate has implementation and fault-injection
evidence. They are not preselected by the local MVP.

## 13. What the MVP must preserve now

The MVP does not implement networking. It does establish the following seams:

- a deployment-neutral, headless engine boundary;
- asynchronous commands and queries;
- opaque `VersionToken` values rather than public sequence/head assumptions;
- globally unique document, entity, command, Contribution, and contributor IDs;
- atomic attributed commands whose Contributions may share a semantic group ID;
- one logical collaborative document boundary with atomic structure-plus-content effects;
- the accepted flat Block placement and Block activity compatibility contract;
- intrinsic formatting and protected, non-inheriting Origin semantics;
- first-class checkpoint Contributions;
- History listing, summary, exact materialization, and compensating restore;
- change subscriptions followed by re-query;
- opaque lossless serialization/opening;
- separate durable and ephemeral state; and
- no frontend dependency on snapshots, CRDT logs, a single parent, or a global
  revision order.

The private MVP implementation may still use one head and one parent per
private Version record. Complete snapshots are limited to bounded tests or an identified early
prototype; the browser target uses immutable effects plus periodic physical
checkpoints. Contract tests and types keep all of these private.

## 14. Staged implementation path

1. Qualify Yjs v13 against Automerge with the attributed-content and structural
   carrier suites, then retain the selected carrier suite as regression evidence.
2. Build and validate the local-only MVP behind the engine and repository boundaries.
3. Replace chunk/checkpoint details behind those same contracts as measurements require.
4. Build an in-process two-engine replication test bus before using a network.
5. Replicate immutable Contributions, including checkpoint Contributions, and
   carrier effects under duplication, delay, reordering, partition, and
   reconnect.
6. Prove that the accepted structural carrier and Block activity semantics remain
   correct when effects travel through the causal Contribution envelope.
7. Add an authenticated relay, durable catch-up, and visible sync status.
8. Add the independent ephemeral presence channel.
9. Add or tune checkpoints, deltas, structural sharing, and compaction without
   changing frontend behavior.

No network phase begins merely because carrier convergence works. The
History/convergence, transport, authorization, restore, and structural gates must
pass together.

## 15. Required future tests

- duplicate, delayed, missing, and out-of-order delivery;
- dependency buffering and catch-up after partition;
- the same Contribution ID with a conflicting payload;
- offline edits followed by reconnect;
- equal Contribution sets produce the same graph, frontiers, collaborative
  state, and every advertised materialization;
- identical rendering with different hidden CRDT state is detected as
  insufficient;
- atomic publication of a Contribution spanning structure and several
  InlineContents;
- concurrent insert, delete, formatting, Block move, and Block payload-update
  operations;
- semantic Block update versus delete keeps the updated Block alive;
- collision normalization remains a private carrier effect of its structural
  Contribution and converges under delayed/reordered delivery;
- Origin never inherits or spoofs under concurrent insertion, copy, paste,
  formatting clear, or restore;
- stable CommentTarget cursors and explicit ambiguous/orphan behavior converge;
- restore concurrent with unseen work;
- concurrent checkpoints remain independently materializable and attributable;
- unauthorized, revoked, malformed, and oversized remote records;
- relay bootstrap/compaction preserves advertised History and semantic
  checkpoint Contributions; and
- presence loss or reordering never changes durable state.

## 16. Explicitly unresolved decisions

- exact Contribution envelope, content hash, and signature scheme;
- exact `VersionToken` representation;
- remote authorization and offline revocation policy;
- exact same-region and structural conflict representation/UX for causal restore;
- History retention and CRDT tombstone garbage collection;
- checkpoint labels or other optional checkpoint metadata beyond ordinary
  Contribution context;
- end-to-end encryption;
- criteria and migration for any future sharding of the one logical collaborative document;
- document forks versus continuation under one document ID; and
- whether any workflow eventually requires a coordinated canonical sequence.

The flat Block carrier, command-to-placement mapping, semantic-update-over-delete
preference, and exceptional collision-normalization policy are no longer
unresolved replication choices. `STRUCTURAL_CARRIER_MODEL.md` owns those rules.

## 17. Technical references

- [Yjs document updates](https://docs.yjs.dev/api/document-updates) describes
  update commutativity, associativity, idempotency, state vectors, and update
  merging.
- [Yjs Awareness](https://docs.yjs.dev/getting-started/adding-awareness)
  separates ephemeral presence from persisted document state.
- [Yjs relative positions](https://github.com/yjs/docs/blob/main/api/relative-positions.md)
  provides stable carrier-local cursor semantics.
- [A highly-available move operation for replicated trees](https://martin.kleppmann.com/papers/move-op.pdf)
  illustrates the broader replicated-tree problem and alternatives to Coedit's
  accepted flat placement projection.
- [Automerge glossary](https://automerge.org/docs/reference/glossary/) and
  [changes and History](https://automerge.org/automerge-swift/documentation/automerge/changesandhistory/)
  provide examples of immutable changes, dependencies, heads, and materializing
  versions from a change graph.
- [Merkle-CRDTs](https://research.protocol.ai/publications/merkle-crdts-merkle-dags-meet-crdts/psaras2020.pdf)
  is background on combining causal Merkle DAGs with CRDT state.
- [Etherpad attributed text](https://docs.etherpad.org/api/changeset_library.html)
  validates content origin stored with text plus a separate revision actor.
- [W3C Web Annotation](https://www.w3.org/TR/annotation-model/) and
  [Hypothesis anchoring](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/html.ts)
  inform stable-cursor plus quote/context CommentTargets.
- [Automerge rich text](https://automerge.org/docs/reference/documents/rich-text/)
  and [Loro movable trees](https://www.loro.dev/docs/tutorial/tree) inform the
  carrier and structural qualification gates.
- [W3C PROV-DM](https://www.w3.org/TR/2013/REC-prov-dm-20130430/)
  supplies the Entity/Activity/Agent and derivation distinctions used by Origin
  and Contributions.
