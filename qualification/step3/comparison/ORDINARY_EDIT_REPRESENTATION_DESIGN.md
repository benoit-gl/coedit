# Ordinary-edit representation design

## Decision and status

Step 3 unit 10 will qualify an immutable-run representation through the supported public APIs of pinned Yjs
13.6.32 and Automerge 3.4.1, inside one native document per candidate. Native-library changes, forks,
subdocuments and a cross-document commit coordinator are outside this design. The document's Blocks,
InlineContents, tags, Media Types and attribution requirements remain unchanged.

This is the design/planning change preceding a separate unit 10 implementation PR. It selects a qualification
representation and its experimental sequence protocol, not a production carrier, structural allocator or Gate
C Range representation. Implementation and measured eligibility are outstanding. The
[current negative results](ORDINARY_EDIT_RESULT.md) remain failures. A design merge cannot turn them into
passes.

The [assessment](MERGE_10_DESIGN_ASSESSMENT.md) records the source-bound counterexamples and alternatives. The
user selected the public-API direction after comparing native-library maintenance with a richer internal
representation. The additional sequence and projection machinery below is an explicit cost of this direction.

The [scaffolding plan](../../../SCAFFOLDING_PLAN.md) owns work order; the
[verification plan](../../../docs/MVP_VERIFICATION_PLAN.md#66-performance-qualification) owns the mandatory
ordinary-edit criterion. Existing payload, structural, Origin, History and Range authorities continue to
control observable behavior. Neither an internal size parameter nor a native-operation count becomes a product
capacity limit.

## Why immutable runs

A fixed live length does not bound a mutable native text object's retained formatting, deletion or insertion
history. Putting such objects in a native array can also move the positional search into the array. A derived
index does not remove either native operation. The proposed path therefore never edits an already published
source run and never uses a numeric native sequence insertion to locate existing text.

Each insertion creates bounded, immutable authored runs. Source text remains an exact ECMAScript string in the
record algebra below and must pass the candidate's existing text-domain/exact-preservation preflight. Its
attribution is fixed. Canonical record serialization does not widen that domain or normalize, repair or
transcode source text. Subsequent insertions attach new runs to source boundaries; deletion adds facts
identifying exactly the observed source intervals to hide. The original source and anchors remain available.
Only the local derived index splits or coalesces its display segments.

This is a carrier-private RGA-family text sequence protocol. Coedit owns its ordering, deletion visibility and
derived projection. Yjs and Automerge supply replicated record storage and native atomic publication; their
native text convergence and cursor guarantees do not prove this protocol correct. Its implementation and
maintenance cost must be included in unit 11's adapter-complexity comparison. It is not an already qualified
replacement for native text.

## Private state

The new qualification variant has an explicit layout discriminator, `step3-immutable-runs-v1`. It keeps the
existing logical Block registry and payload descriptors, with text descriptors naming a fresh payload
generation. A fixed native namespace stores immutable records, including the metadata appended during ordinary
editing:

```text
native document
  layout discriminator
  structural registry and payload descriptors
  immutable records
    authored runs and observed-source deletions
    Block / InlineContent liveness additions and observed retirements
    qualification contexts, authored envelopes and v2 payload-effect evidence
    command manifests, causal readiness joins and qualification transition mappings
  existing explicit retained-state qualification captures

derived instance state, never serialized as authority
  validated entity / generation / effect indexes
  run-parent and sibling-order indexes
  visible-length rope and source-interval indexes
  instance-local revision receipts
```

Every record has a fresh carrier-private UUID, a kind, its target scope and a content-committed immutable
body. The source string is authoritative in that committed body; no mutable native text object is source
authority. These UUIDs are not Block IDs, InlineContent IDs or public Range identities. Logical actor/effect
pairs retain their current identity, idempotency and conflicting-reuse rules; a private record UUID does not
replace those checks. Existing qualification envelope and payload-effect semantics remain in force.

Ordinary edits append directly addressed records instead of updating broad liveness, context or evidence maps.
Liveness is still the existing observed-token rule: an edit adds fresh live tokens; a deletion retires the
tokens it observed. Unseen concurrent additions survive. The new storage shape must preserve that rule rather
than replace it with a last-writer flag. Structural transitions can do broader work, which is measured
separately.

Run source size is an implementation parameter to profile, not a chosen value in this design. Its direct owner
is the new qualification representation. Values and their change rule must be recorded in the implementation
profile under [capacity maturity rules](../../../docs/CAPACITY_AND_PERFORMANCE_TARGETS.md). No logical payload
is rejected merely because it spans many runs. The existing derived index's 256-unit pieces are not evidence
for a native run-size limit.

## Versioned record algebra and equality

The private layout uses closed JSON tuples rather than native object property order:

```text
Record = ["coedit-step3-record", 1, id, kind, scope, clock, base, effect, batch, ordinal, body]
Ref = [recordUUID, sha256Hex]
RootRef = Ref naming a genesis/command manifest or causal join
Scope = ["text", inlineContentUUID, generationUUID]
      | ["block", blockUUID] | ["inline", inlineContentUUID] | ["document"]
Clock = [counterDecimal, privateReplicaUUID] | null
Base = [acceptedRootRef, previousSameGenerationSourceMemberRefOrNull] | null
Effect = [actorIdString, effectIdString] | null
Ordinal = [operationCategory, operationIndex, memberIndex] | null
Anchor = [runRef, sourceEndOffset] | null
Origin = [qualificationKindString, originIdString]
```

Every tuple has exactly the displayed arity and primitive types. UUIDs use canonical lowercase UUID-v4
spelling; commitments are 64 lowercase hexadecimal characters. Counters are arbitrary-precision nonnegative
decimal strings, without leading zeros except `"0"`, compared numerically rather than lexically or as JS
floating-point numbers. Offsets/indices are nonnegative safe integers excluding negative zero. Strings compare
by exact ECMAScript UTF-16 units without trimming or Unicode normalization. Origin contains precisely the
kind/id fields validated by `assertQualificationOrigin`; this introduces no product Origin-catalog format.

| Kind                | Scope and special fields                                            | Exact body tuple                                                              |
| ------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `manifest`          | Document; clock/base/ordinal null; batch equals id; Effect required | Genesis or command body below                                                 |
| `join`              | Document; clock/base/effect/batch/ordinal null                      | `[sortedUniqueInputRootRefs]`                                                 |
| `generation`        | Text; counter `"0"`; Base required; id equals generation UUID       | `[exactMediaTypeString]`                                                      |
| `run`               | Text; Clock and Base required                                       | `[Anchor, exactSourceString, Origin]`                                         |
| `erase`             | Text; Clock and Base required                                       | `[canonicalObservedIntervals]`                                                |
| `live`              | Block or InlineContent; clock/base null; id is its token UUID       | `[]`                                                                          |
| `retire`            | Same entity scope; clock/base null                                  | `[sortedUniqueLiveRefs]`                                                      |
| `context`           | Document; clock/base null                                           | `[canonicalEncodedContext]`                                                   |
| `envelope`          | Document; clock/base null                                           | `["apply" or "restore", canonicalEncodedEnvelope]`                            |
| `payload-effect-v2` | Document; clock/base null                                           | `[effectIdentityString, acceptedAncestryRootRef, canonicalEncodedOperations]` |
| `transition-v1`     | Document; clock/base null                                           | Transition tuple defined below                                                |

All non-root records require a non-null Effect, batch UUID and ordinal, and exactly one containing command
manifest. Joins contain no semantic members or effects. The sole bootstrap manifest is the only
predecessor-free root. Unknown kinds/layouts/record versions, extra tuple elements and object-valued
extensions are invalid.

Existing qualification context and applied/restore envelope encoders define their embedded strings.
Reconstruct their admitted primitive fields and require exact re-encoding equality: unknown/duplicate embedded
JSON fields are rejected, not discarded by a permissive decoder. Effect must match the embedded logical
actor/effect identity. Ordered operation and placement arrays retain the existing codec order. The v2 payload
operations string is the `operations` array produced by the existing payload-effect operation encoding, with
exactly its allowed per-kind fields, types, Origin encoding and optional replacement-base fields; parse,
reconstruct through that operation codec and require exact JSON re-encoding equality. Its ancestry field is
separately defined below; the old flattened-parent encoder is not used for v2 ordinary publication.

An observed interval is `[runRef, start, end]`, with `start < end`, permitted source boundaries and source
material visible in the accepted base plus preceding same-generation members. Authoring unions
overlapping/touching intervals on one Ref and sorts by UUID, digest, start and end. Received lists must
already be canonical and nonempty. No-op text deletion emits no erase record; existing command/context
behavior remains. Retirement Refs must identify observed live tokens in the identical entity scope. Set-like
Ref lists sort by UUID then digest and contain no duplicates.

Construct fresh primitive tuples after validation, then `C = JSON.stringify(tuple)` without whitespace.
Receive C only when parsing, validation and reconstruction return exactly C; no caller `toJSON` hooks or
native object IDs participate. JSON's well-formed escaping preserves source UTF-16 units. UTF-8 encoding of
that canonical, well-formed JSON string is the digest input. Let `H = SHA-256(UTF8(C))`; a storage key is
`H + ":" + C`, with marker exactly boolean `true`. Record equality is equality of C, not hashes alone.
Recompute H before trusting a key or Ref. Including full C keeps different bodies enumerable even under forced
UUID/hash collisions. One UUID may have only one canonical body; equal duplicates deduplicate and unequal
bodies invalidate the candidate before publication.

Refs commit anchors, interval endpoints, predecessors, roots, lineage mappings and private positions to their
exact source bodies. A missing/mismatched Ref invalidates state, or is unresolved when a live position targets
an obsolete generation. Compare previously accepted keys with a staged incoming state before adoption; removed
commitments, observable non-true markers, equivocation and broken Refs refuse the merge. Cold loading
validates all supplied keys, Refs, memberships and captures, but cannot authenticate a wholly replaced
self-consistent history without a trusted external commitment. This qualification introduces integrity within
its admitted protocol, not authentication.

The implementation will declare direct qualification dev dependency `lib0@0.2.117` (MIT, already transitive in
the lockfile), using public `lib0/hash/sha256` for synchronous digests. Verify Node/browser exports with
known-answer and record fixtures. This planning change edits no dependency files. Digest time, source-copy
work and bundle size count in evidence; this avoids inventing a hash or adding an asynchronous publication
queue.

### Closed command membership and exact base

```text
GenesisBody = ["genesis", rootBlockUUID, ["settings", 1, runSourceUnits], canonicalBootstrapContext]
CommandBody = ["apply" or "restore", acceptedBaseRootRef, contextRef, envelopeRef,
               payloadEvidenceRefOrNull, orderedOperationRows,
               exactStructuralOutputs, exactDescriptorOutputs]
OperationRow = [operationCategory, operationIndex, orderedOutputMemberRefs]
```

Genesis is admitted only as the layout's unique initial trusted root construction, with no
InlineContent/source members or predecessor. It has an explicit synthetic qualification identity matching its
bootstrap context; this is not a product Contribution. Semantic commands require the normal actor/effect pair.
Existing fixtures that omit it must supply a marked synthetic qualification context through the same command
path; the new variant does not admit unbound authored records or a privileged production mutation path.
Capture is an observation of committed state under the existing retained-state seam, not a semantic member;
restore uses a normal attributed command manifest. The settings value `runSourceUnits` is a positive safe
integer. Runs are nonempty and at most that many UTF-16 units, with permitted boundaries; empty payloads have
a generation but no run. Longer logical inputs are partitioned, not rejected. Record the experimental value in
the profile rather than promoting it into a payload-size limit.

Allocate batch UUID before preparing members. A member carries that UUID, not the manifest digest. Hash
members first, then the manifest commits their exact Refs. This avoids a member/manifest hash cycle. Manifest
id equals batch UUID; all members have its Effect. Operation categories, in the existing apply order, are
`block-delete`, `placement`, `inline-create`, `payload`, then optional `transition`; a restore has the single
`restore` operation. Indices are dense within each canonical input vector; payload order remains authored
order. Context, envelope and optional payload evidence occupy reserved metadata ordinals (`context`,
`envelope`, `payload-evidence`, each index/memberIndex zero). All other member ordinals equal their operation
row and position. Metadata Refs in CommandBody plus output rows are the exact member set; none may repeat, and
no other record bearing that batch UUID is admissible.

Validate bidirectionally: every member exists with matching batch, Effect, scope and ordinal; every semantic
record belongs to exactly one valid manifest. Each actor/effect pair and batch UUID identifies one authored
manifest; conflicting reuse rejects even if net visible text happens to agree. A replay reuses the same
committed members/manifest. There is one context and one matching apply/restore envelope, and payload evidence
exactly when the existing command semantics require it. The envelope authoring nonce equals batch UUID.
Dangling, surplus and mismatched members reject atomically.

Replay the envelope and ordered payload operations against the manifest's accepted base using an independent
model. For each insertion/replacement, output runs in member order must concatenate to exactly its submitted
source/Origin; erase outputs must equal its observed source selection, with no extra cancelling run/erase
pairs. New generations occur only for the corresponding whole-text creation/replacement or fixture transition.
Every real payload mutation adds both its owning Block and InlineContent liveness records in that same
operation row; no-op exceptions and structural/restore token additions or observed retirements match the
existing qualified rules. Validate ownership in the deterministic command prefix: the accepted base plus
exactly the earlier `inline-create` rows of this manifest. This admits creating an InlineContent under a Block
and initializing its text or opaque payload in one command. Reject conflicting ownership at creation; payload
members and both liveness records must bind to that prefix's owner. Later rows and concurrent winning owners
cannot substitute for it. A forged extra liveness refresh is invalid.

Structural outputs are closed tuples `['placement', BlockId, canonicalEncodedPlacement]`,
`['inline-create', InlineContentId, BlockId]` or `['block-delete', BlockId]`, in the envelope's existing
order. Output lists contain only the registry/descriptor writes required by that command. Ordinary appends to
an existing text generation leave both lists empty when those registers do not change; never serialize
unaffected descriptors or the document tree into an ordinary manifest. Descriptor outputs, ordered by
InlineContentId, are `['text', InlineContentId, exactMediaType, generationRef]` or
`['opaque', InlineContentId, exactMediaType, canonicalByteArray, Origin]`. Byte entries are integers 0..255.
Compare these with the command's prepared native writes and accepted-base semantics, including the native
replacement/effect proofs already exercised; do not compare an author's output to a later concurrent winner.
Restore's decoded target supplies its exact expected material. All member, structural and descriptor outputs
publish in the one native change.

For generation G, the accepted source base is precisely `projectG(closure(acceptedBaseRoot))` plus preceding
source members of this batch in G, in manifest order. Each source member's Base contains that same accepted
root and exactly the immediately preceding same-generation source member, or null for the first. No arbitrary
parent subset is allowed. A fresh generation has counter zero; a run/erase counter is one greater than that
base's maximum in G. Its anchor must resolve there, and deletion intervals must match the command's actual
visible selection. Validate against the manifest and its evidence, not a record's unverified claim to have
observed a smaller frontier. Cache projections/maxima on the honest authoring path; receive/load validation
may expand and replay. This commits to an exact accepted base, not proof of what an arbitrary author
psychologically saw or omitted from an external history.

### Private replica identity

Allocate a fresh UUID-v4 with trusted Web Crypto for each new authoring instance/branch, including reload and
clone. Store it in its authored clocks, never in a shared mutable replica register; loaded record identities
stay unchanged. It is distinct from Contributor/Origin identity and need not equal the native Automerge actor
or Yjs client ID. Source counters derive from accepted roots and preceding batch members, not from a reset
local timer. Validate canonical replica UUID spelling and clock consistency at load/receive. Correctness does
not assume random collision is impossible: the final run UUID breaks equal counter/replica ties; a repeated
run UUID is either the identical committed record or invalid equivocation. Forced duplicate replica IDs and
complete-rank collisions are qualification cases, never an excuse to order by arrival.

## Causal readiness roots and bounded ordinary metadata

A root's closure is its causal ancestry plus its own members. A join's closure is the union of its input root
closures; it introduces no source, liveness, semantic effect, Contribution, Version or product Checkpoint.
Join inputs are nonempty, sorted, unique valid RootRefs in the same bootstrap lineage. Reject cycles, foreign
genesis roots and invalid members. A join may be wide because it is a transition operation, not ordinary
publication.

After load/merge or explicit recovery, validate the record set and maximal accepted roots, construct their
exact union and generation indexes, persist a join when multiple roots remain, then cache the single resulting
root before issuing an edit-ready receipt. A warm command references that cached root once, publishes its
members/manifest atomically and makes its manifest the next cached root. It never enumerates/sorts/hashes a
maximal source frontier, the document's generation map, or transitive ancestors. Generation maxima and
owner/effect indexes update incrementally.

Persist v2 payload evidence as `[effectIdentity, acceptedAncestryRootRef, canonicalOperations]`, rooted at the
manifest's same accepted base. Project ancestry through joins onto manifests that carry actual payload-effect
evidence under the existing qualification rules; joins and restore-only/capture metadata do not invent
payload-effect IDs. The legacy `RecordedPayloadEffect.parents` result remains available only for explicit
inspection/capture/comparison by expanding roots to maximal real effect IDs, or through equivalent root-aware
policy readers. Update the new variant's replacement/DAG readers accordingly. Neither flattening ancestors nor
the old sorted-parent encoder is allowed on ordinary apply. Older variants/encodings retain their existing
codecs and negative disposition.

Automerge recovery must also leave one native head before readiness. Persisting a join is a real native change
and joins observed heads; when no stored write is needed but multiple native heads remain, use public
`emptyChange` as an explicit recovery action. A no-write read callback does not collapse heads. Verify one
head and unchanged semantic material; this internal native join is not product Checkpoint/history activity.
Ordinary publication may not call `emptyChange`, rebuild readiness, serialize a wide native head list or use
whole-state encoding as a shortcut.

Charge join construction, conflict-union traversal, native-head joining and any replay to transition evidence.
Capture first/following edits and realistic inbound schedules. A merge before every key cannot disappear under
transition accounting; if the actual ordinary path performs whole-document work, the route fails. Lack of
readiness refuses an edit and requires explicit recovery; it is not permission for a per-keystroke rebuild.
Test N-way fan-in followed by recovery and one-unit edits: source/evidence/root metadata in those edits must
stay bounded independently of N, while transition costs and retained join growth remain visible.

## Sequence protocol for qualification

A run records its generation, source text, fixed Origin, insertion anchor and a total ordering rank. Its run
identity is its UUID plus canonical-body digest, not the UUID alone. The anchor is the generation's start
sentinel or a source boundary immediately after an existing source unit. Boundaries use the adapter's private
UTF-16 offsets and existing permitted splice boundaries; they are not a public text-coordinate API. Source
units remain addressable after deletion. A run is divisible in the derived view, not indivisible text.

Resolve an insertion's accepted visible offset to its immediately preceding visible source unit; when there is
none, use the generation start sentinel. An anchor never names an arbitrary zero-offset start inside another
run. This choice is made against the revision receipt, before concurrent integration can change visible
offsets.

Conceptually, a run's first unit is a child of the insertion anchor; each subsequent unit continues after its
previous source unit. Children at one anchor sort by descending `(counter, private replica UUID, run UUID)`
from the record clock and identity. The counter advances beyond every counter in the generation's accepted
base, including preceding source members of its own batch. It is a causal ordering device, not wall-clock
time, and does not choose the continuing Block or InlineContent identity in a logical split/merge.

Validate the source Base against its containing manifest and accepted readiness root so rank and anchor
dependencies are auditable. Keep the observed maximum in derived instance state; do not enumerate old ranks on
a warm edit. Counter encoding and overflow/malformed-input checks are part of the protocol implementation, not
an excuse to order records by arrival or silently wrap a counter.

The canonical sequence is the deterministic depth-first traversal of those conceptual source units.
Continuation units use their run's rank, so a causally later insertion appears before the observed
continuation at its chosen gap. Concurrent siblings have a deterministic order without packet-arrival
arbitration. Runs created for one insertion chain through their preceding run's final source boundary. A
source boundary inside a run can receive new children without copying or retiring the original run.

A deletion record names exactly the source intervals observed in the accepted base, not a numeric interval to
be reapplied to a later projection. Visibility subtracts the union of those intervals. It never deletes an
unseen run merely because that run later appears between the same visible offsets. A fine-grained replacement
publishes its observed deletion and new insertion together.

For example, starting with `ab`, concurrent insertions after `a` both appear once before `b`, in rank order. A
concurrent deletion of the observed `b` removes that source unit while retaining either new insertion.
Inserting into `abcd` at offset 2 attaches after the source boundary following `b`; it does not require a
replicated split of the source run.

This protocol is a mechanism to exercise, not an eligibility proof. Its reference model and differential tests
must cover two- and three-way insert/delete/replace, adjacent boundaries, delayed higher-ranked siblings,
duplicate replay, deep nesting and delivery permutations. A missing causal dependency prevents
activation/publication of that state; the adapter must not guess an anchor or publish a partially resolved
projection. Same-ID/different-body records, invalid ranks, cross-generation anchors, invalid boundaries and
cycles fail validation atomically.

No structural position allocator is selected or reused as text semantics. An existing allocator's code or
interface shape may inform a separately reviewed implementation helper, but structural depth, liveness and
Block-order contracts must not enter text ordering accidentally.

## Native storage routes

### Yjs

Use one genesis-created `Y.Map` of canonical storage keys with scalar `true` markers in the existing `Y.Doc`.
Distinct bodies use distinct keys, even when a deliberately reused UUID would otherwise make Yjs hide a map
conflict. Group the publicly enumerable keys by their embedded record UUID and apply the canonical
duplicate/equivocation rule. There is no mutable `Y.Text` or mutable object value holding authoritative
source, and no native array of run positions. A temporary native text object may exercise source-domain
preflight; it is not the persisted authored source.

Add new keys and required descriptor/structural changes in one prepared `document.transact`. Observe
record-key changes and deep changes to other authoritative native namespaces to invalidate stale receipts;
observers never project the complete map during a warm edit. Invalid incoming updates are merged into a staged
candidate and validated before adoption. Direct mutation of an accepted source's committed body is impossible
without changing its storage key; an attempted delete/replacement is caught by monotone-key/Ref validation
before a candidate is published.

All expected validation, ID/token allocation and source preparation precede live mutation, as in the existing
adapter. Yjs callback exceptions are not rollback: partial keys can remain, native observers can fire and a
raw encoded update can contain the partial write. Receipt invalidation alone does not contain that state.

Keep the native document private behind an engine-owned publication gate. Before entering `transact`, mark it
pending and buffer its native update chunks and notifications. Native listeners only collect private data;
they invoke no application, network, persistence or other externally supplied callback. Every public read,
capture, encode/export and edit entry checks the gate before touching the document; pending or quarantined
state refuses access. After normal transaction return and successful internal commit bookkeeping, adopt the
staged index/root, accept the buffered chunks, and release the owned outbox/notifications. Consumer errors
after this commit do not retroactively report a failed mutation. Never expose raw Yjs observers or the raw
`Y.Doc` through the qualification adapter.

For recovery, retain a trusted native baseline from create/load/validated adoption and an in-memory journal of
only successfully accepted native update chunks. Append chunks using constant-work links; do not copy the
previous journal, encode the full document or build a disposable full-document clone per edit. Establishing a
fresh baseline and clearing the journal belongs to an explicit validated transition. This qualification
recovery journal is not a product durability or History service; count its retained bytes and allocations.

If an unexpected exception follows an attempted native write, discard the pending outbox, quarantine and
retire that document, invalidate all receipts, and report failure without exposing its bytes or adopting its
index. Explicit recovery creates a fresh private document from the trusted baseline and accepted chunks,
validates the exact last accepted root/material/evidence, rebuilds indexes, and obtains a fresh authoring
identity before reopening the gate. Never export or replay chunks from the failed transaction. Charge replay
and reconstruction to this exceptional recovery, never an ordinary-edit fallback. Expected preparation
failures leave the accepted instance unchanged. Process termination or inability to retain recovery data has
no universal rollback guarantee; the route must fail closed. Reject the Yjs route if supported APIs and this
owned boundary cannot provide the required observable atomicity.

The growing native map, native transaction cleanup, retained source and serialization costs still require
direct qualification. Keyed insertion alone is not proof of bounded total Yjs work. Private native-item
instrumentation may observe diagnostics for the pin, but production mutation must use supported APIs.

### Automerge

Use one genesis-created record namespace in the existing Automerge document. Route a UUID's complete
hexadecimal digits through 32 levels of map keys, with at most 16 child keys at each prefix. Each terminal map
contains its canonical storage key and scalar `true` marker; a valid UUID has one body. Multiple different
bodies under that UUID are a rejected state, not a growing valid collision bucket. Record bodies have their
fixed schema and operation-sized values. This bounds the intended ancestor-map width rather than creating
unbounded hash-prefix collision buckets. It is a layout parameter, not a resource-admission ceiling.

Validate every prefix key and terminal depth: a terminal path must equal its record UUID's complete
hexadecimal digits. No arbitrary keys or early terminal buckets are valid.

In the worst case a fresh UUID creates 32 prefix maps before its terminal map/key; concurrent prefix creation
can retain additional native objects. Bounded width is therefore a significant allocation/storage tradeoff,
not a claim of small memory use. Count native object/encoded growth and reject an unsafe route; do not
silently replace it with an unqualified compressed or mutable trie protocol.

A naive lazily created trie is incorrect: two replicas can create different native objects at the same prefix,
and ordinary materialization shows only one object. A record below the other object then disappears from that
view. This design instead gives the namespace **append-only conflict-union semantics**:

- Never replace, clear or delete an existing prefix, or mutate a published record.
- Append new records through the currently materialized winner path, creating only missing prefixes.
- Semantic reads recursively union the winner and every object alternative returned by public `getConflicts`
  in the proxy traversal context specified below. Ordinary native materialization is not the semantic record
  set.
- Deduplicate equal record IDs with equal canonical bodies; unequal bodies or malformed alternatives are
  invalid. Visitation tracks native object identity so shared traversal paths do not duplicate facts or
  recurse indefinitely.

This union is necessary at nested conflicts as well as at the first prefix. In the pin, `getConflicts` outside
a change callback reifies object alternatives as frozen plain objects, which cannot expose their nested
conflicts. Therefore perform the complete recursive traversal inside a **no-write `Automerge.change`
callback**, where alternatives are native proxies and public `getObjectId` supplies visited-object identity.
Copy only validated primitive canonical keys/markers out of the callback; never retain a proxy or mutate it.
Assert identical returned document, unchanged heads and no emitted change. If those assertions fail, the
traversal is not an admissible read and the route fails.

Public `getConflicts`, `getObjectId`, `change` and save/load provide this route. Losing alternatives must
remain reachable after further winner-path appends and reopen. Neither this read callback, a repair write nor
enumeration of alternatives belongs in a warm edit. Each actual publication appends all prepared keys in one
separate `Automerge.change`.

Full union/validation can be expensive; bounded map width does not bound the number of conflicting
alternatives or native WASM commit/history work. Load and merge must validate the semantic union before
publishing a ready projection. The implementation must measure conflict growth, native copying and transition
cost explicitly. If the pin cannot preserve or expose the required alternatives, or ordinary publication still
copies/traverses unrelated state, this route fails. The design does not silently fall back to the current
flat-map representation and call it eligible.

## Derived index and publication

Reuse the existing staged-edit and receipt discipline. Maintain a per-instance balanced visible-length index,
source interval indexes and ordered children at insertion anchors. Source segments can split locally at
attachment and deletion boundaries; there is no replicated rebalancing operation. Native records remain
immutable.

Ordinary eligibility retains the existing explicit opt-in for a pure, deterministic, lifetime-stable concrete
position decoder. Preserve the general stateful decoder's observable fallback behavior and classify that path
ineligible; do not silently narrow the structural allocator interface.

The index needs stable subtree entry/exit handles or an equivalent dynamic-order representation. A newly
inserted child goes before the next sibling's subtree in rank order, or at the appropriate end boundary when
no successor exists. It must not find a subtree end by walking an ancestor chain or all descendants. It must
skip deleted source using aggregate visible lengths rather than visiting tombstones one by one. Initial
construction may examine the complete state; ordinary offset lookup and staged changes must follow balanced
paths plus affected source segments.

The intended adapter work is logarithmic index navigation plus operation-sized record encoding/hashing,
inserted text and intervals necessarily touched by the requested operation. Cached causal roots keep frontier
width out of ordinary record bodies; count every metadata copy rather than excluding evidence work from the
bound. This is a design obligation, not a claim about measured native complexity. Do not expand every source
character into a replicated record or add one retained Range-holder entry per edit. Profile derived memory,
boundary fragmentation, retained history and all native publication work separately.

For an ordinary edit:

1. Require an active, validated instance/generation/revision receipt. Resolve its visible offsets through the
   index.
2. Prepare exact text/Origin, observed source intervals, anchors, ranks, record IDs, liveness and existing
   qualification evidence. Stage index changes without changing published state.
3. Append the complete batch in one native transaction/change. Publication includes no save, full projection,
   record-set scan, conflict-union traversal or retained-holder rewrite.
4. Adopt the staged index only on success and issue the next instance-local receipt. Preserve the previous
   published state for preparation failures. An attempted unsuccessful native mutation invalidates the
   receipt/index; Yjs additionally quarantines its private document and requires the explicit journal recovery
   above before any further public access. No partial state or pending update crosses the publication gate.

Merge/load/replacement/restore invalidate stale receipts before any further edit. Validate and recover the
index at an explicit transition boundary. A stale mounted action refuses without publication and recovers
through the existing controlled editor path. Recovery must not become an automatic full rebuild on each
keystroke. Record representative inbound schedules and first/following edits: labelling work as a transition
cannot hide routine document-wide work.

## History, logical split/merge and Range compatibility

Distinguish three layers: the Block/InlineContent model, this carrier-private source representation, and the
eventual product History/Range services. Internal source segmentation creates no Block or InlineContent. Local
index splits, joins and balancing create no product Contribution, Version or new authorship. A user edit
retains its one normal semantic publication; supporting native records are its private effects.

Retained qualification captures must materialize the exact record set at their captured native state/frontier,
including conflict alternatives, generations and deletion facts. A logical counter is not a Version selector.
Existing detached capture/materialization surrogates remain surrogates: this unit introduces no product
History API, permanent Version implementation, physical checkpoint policy or public run-ID encoding.

Logical Block/InlineContent split and merge remain attributed operations. The
[accepted lineage behavior](../../../docs/RANGE_MODEL.md#7-structural-lineage-deletion-and-copy) follows
movement, split and lineage-preserving merge, in creation/lineage order, but not copying. Origin is distinct
from that lineage. Qualification fixtures must preserve the before/after source mappings they exercise
independently of whichever structural identity continues. Same-document copying and restore use fresh private
run identities while preserving required Origin; equal text or Origin cannot silently reattach an old
position.

Whole-payload replacement creates a fresh generation. Fine-grained facts retain the generation against which
they were authored, including losing replacement alternatives. Preserve and exercise the existing
replacement/effect evidence mechanisms; do not first select a winner or mixed-operation policy in this design.
A current position from an obsolete generation becomes unresolved. Reload retains valid source identities but
creates a new local receipt.

The existing native-position qualification seam needs new opaque private handles tied to generation/source
boundaries and affinity, with equivalent tested behavior. These are not serialized public Ranges. Greedy Span
boundaries, preceding-sticky positions and replacement versus equivalent delete/insert behavior remain
required feasibility tests. An implementation cannot call its changed anchor semantics equivalent without
exercising those tests.

[Step 6/Gate C](../../../docs/RANGE_MODEL.md#11-implementation-sequence-and-gates) still selects the Range
lineage representation, continuing logical identity rules, merged-away reference behavior, exact
split-boundary tie-breaks and wire/API details. Retain enough immutable source and qualification derivation
facts to keep those choices feasible; do not claim these run IDs automatically implement the final service.
Any compaction must preserve every required retained Version, Origin and lineage; no pruning or canonical
repacking is part of this unit's ordinary-edit path.

### Persisted qualification transition seam

The closed `transition-v1` member uses this tuple, committed with its ordinary command manifest:

```text
Transition = [1, kind, sourceRootRef, orderedSourceScopes, orderedDestinationScopes,
              orderedSpanMappings, orderedBoundaryMappings]
kind = "split" | "merge" | "copy" | "restore"
TransitionScope = [blockUUID, inlineContentUUID, generationRef]
SpanMapping = [sourceScope, sourceRunRef, sourceStart, sourceEnd,
               destinationScope, destinationRunRef, destinationStart, destinationEnd, relation]
Boundary = ["at", runRef, offset] | ["empty", generationRef]
BoundaryMapping = [sourceScope, sourceBoundary, destinationScope, destinationBoundary, relation]
relation = "lineage" | "copy" | "restore"
```

These are exact tuple arities; offsets obey the record grammar and permitted source boundaries. Scope lists
are ordered, duplicate-free and checked against actual Block ownership and generation descriptors in the
declared source root and resulting command state. Span mappings use positive-length intervals of equal length
with exactly equal source text and Origin. Boundary offsets can be zero; this differs from a run insertion
Anchor, which names a preceding source unit. An empty boundary names an empty generation, not an invented
source character. Source/destination Refs must resolve in those scopes. Unlike ordinary run anchors, this
explicit seam permits cross-generation references.

For split, there is one source and at least two destinations; for merge, at least two sources and one
destination. This fixture version exercises pure text-preserving split/merge with the same exact allowlisted
Media Type. Its ordered mappings must cover every selected live source unit and destination unit exactly once
in declared lineage order. Complete source-boundary correspondences follow those intervals, including the two
sides of a split and explicit empty destinations. Do not sort them by current tree order or manufacture
zero-length spans. Broader compatibility policies remain with their existing owners; this fixture subset is
not a new product Media Type restriction.

Only split/merge mappings use `lineage`. Copy and restore use their respective relation tags, preserve Origin
and use fresh destination run identities. Copy may map one source into several explicitly ordered
destinations, each covered exactly; those derivation edges do not authorize Range continuation. Restore names
the root of a validated retained capture as source. Split/merge use the command's accepted base root; copy
uses its resolved source effect or retained capture root, which may be historical. Restore edges alone do not
silently reattach old positions or select the later Range resumption rule.

Bind derivation to the existing `context.source`, not merely to equal text or Origin. Restore requires kind
`restore`; resolve its exact retained-state token in this document/layout and require that capture root to
equal `sourceRootRef` and its material to equal the restore envelope's decoded target. Copy requires kind
`copy`; resolve its reference unambiguously through the existing canonical actor/effect-identity or
retained-token namespace. An effect reference resolves to that authored manifest/root, and a capture token to
its captured root. Require equality with `sourceRootRef`, and validate every mapped source scope/run/interval
in that root. The referent must belong to the same trusted bootstrap lineage and be available in the accepted
base's retained ancestry. Reject missing, ambiguous, foreign, wrong-kind or mismatched references atomically.
A copy from a joined state without an authored effect for that root must use its capture token. Synthetic
qualification contexts must likewise name actual referents. Maintain scoped referent indexes so warm
preparation does not scan history; complete load/receive validation may traverse retained ancestry. This adds
no public Version token encoding or production History resolver.

The fixture supplies its logical source/destination Block and InlineContent identities explicitly. It does not
establish which identity continues by default, how merged-away entity references behave or the final
exact-boundary/affinity tie-breaks. Boundary correspondences retain the available facts, including multiple
correspondences at a split; a qualification probe's explicitly supplied boundary policy is not a Gate C
decision.

Implement the seam through existing atomic primitives where expressible, or a qualification-private atomic
fixture transition with an explicit before/after target and the same manifest validation. It is not a new
production split/merge API. Primitive payload operations create destination generations/runs; mappings
reference those exact members and retained source Refs. For apply commands, the manifest's transition row
contains the mapping member, while primitive mutations occupy their corresponding payload/structural rows. For
restore commands, all restore outputs, including a transition-v1 member, occupy the single restore row;
metadata retain their reserved ordinals. There may be no extra source replacement, mapping, identity reuse or
liveness change outside that closed output set. Publish all of it in one native transaction/change.

For example, a fixture splits `abcd` in `(I1,G1)` into `(I1,G2):ab` and `(I2,G3):cd`, with fresh destination
runs. Its persisted maps carry old `[0,2)` to the left run and `[2,4)` to the right. A retained pre-split span
can therefore resolve through the qualification mapping after reopen even though ordinary run anchors never
cross generations. The simple live-editor position seam still refuses obsolete generations; the separate
retained-Range probe follows explicit lineage facts. Copying `cd` instead emits only copy derivation, so the
old Range cannot follow it.

Reload and retained materialization reconstruct the complete transition set from the chosen committed root.
Test one-to-many/many-to-one mappings, changed tree order, empty boundaries, copy/restore non-reattachment,
atomic failure, invalid coverage/Origin/ownership, mismatched or unresolved copy/restore references and
mappings forged to another command's destination. The public Range service, continuing-identity rules and
portable encoding remain Step 6/Gate C work.

## Compatibility and implementation sequence

Keep the current snapshot, targeted and incremental variants and their negative probes. The new layout is an
explicit qualification variant, never an implicit reinterpretation of old native bytes. Existing loaders
continue to read their own encodings. Compare variants from the same logical genesis; record different native
layout IDs and fresh private identities. Reopening or restoring an old qualification capture uses its original
variant. This design promises no cross-layout cursor migration and freezes no `.coedit` format. Future
production migration belongs to its owning step.

After this planning change lands, the separate unit 10 implementation proceeds in this order:

1. Implement canonical record/hash, manifest, causal-root/v2 evidence and transition fixtures, the reference
   sequence model and native record primitives. First exercise same-UUID equal/different bodies, forced
   identity collisions, post-publication source/marker changes, committed-key deletion, broken Ref commitments
   and save/reopen. Exercise conflicting trie-prefix creation and nested alternatives through the no-write
   proxy traversal, then additional appends/reopen; instrument copied map widths and native work. For Yjs,
   exercise growing record maps, one-time source construction and transaction cleanup. Inject a throw after
   the first native write: raw observers may see it internally, but the owned outbox must emit nothing, public
   reads/encoding must refuse, and journal recovery must reproduce the last accepted state exactly. Reject a
   failing native route before integrating the full adapter.
2. Implement and differentially qualify the derived index/protocol, including adverse deep/tombstoned/boundary
   states, causal dependency handling, idempotency and malformed state. Prove the intended local work with
   independent counters.
3. Integrate each surviving route behind the qualification carrier and incremental editor seams; preserve all
   mixed atomic, attribution, replacement, liveness and capture tests, including same-command InlineContent
   creation followed by text/opaque initialization and forged-owner rejection. Measure transition and
   first/following/warm edits.
4. Commit the profile, environment, methods, raw completion/failure references and durable findings. A
   carrier/layout pair remains failed or inconclusive unless the complete mandatory evidence passes. Shared
   protocol tests alone cannot qualify either native backend. If neither survives, stop and return to
   planning; do not invent a fallback, resource cap, fork or alternate sequence protocol to claim closure.

This is one unit 10 implementation objective, not an additional numbered merge unit. If the scoped
implementation cannot remain one coherent PR, revise the work order through the normal planning process before
splitting it. Units 11 and 12 retain final common-revision comparison and selection of exercised eligible
combinations.

## Required evidence and costs

The implementation profile must independently vary target source length, run/Origin boundaries, repeated
same-gap edits, deeply nested anchors, deleted source/history, unrelated Blocks/text/opaque values,
liveness/effect records, causal fan-in and Automerge conflicting prefixes. Preserve raw work observations
separately from timings.

Require exact text/Origin or atomic refusal; causal replay and duplicate/reordered/partitioned delivery;
independent sequence-model agreement; malformed-record rejection; one all-or-none mixed structure/text/opaque
command; stale receipt refusal; replacement alternatives and losing-branch edits; retained
capture/materialization/restore; native save/reopen; private position and logical split/merge feasibility;
mounted editor following edits and affected IME-event, clipboard and undo/redo behavior. Keep existing
expected-failure checks rather than weakening them for the new representation.

Counter coverage must include native publication and hidden work, growing-map/conflict traversal, text
projection, index visits/rebuilds, source copies and metadata enumeration. A native source-code argument or
fast stopwatch is insufficient. Avoid accepting an invasive diagnostic's own overhead as a timing result;
record blind spots and the pin/browser/runtime. Ordinary edits must not scan unrelated state, whole
target/history or retained holders.

Costs include more retained source/record objects, a custom sequence protocol, local balanced indexes and
source boundary bookkeeping, conflict-union validation, Yjs publication gating/recovery storage, a new native
encoding and additional differential/lifecycle tests. Measure encoded growth, allocations/RSS,
replay/activation/merge time and index memory as well as edit time. Preserve failed native routes and compare
their maintenance burden openly. No calendar estimate, reliable tail claim, maximum fragment size or
production resource guard follows from this design document.
