# Structural carrier model

**Status:** Accepted structural carrier contract; the allocator and carrier are
qualified in Step 3 and implemented for the selected carrier in Step 4.

**Applies to:** `SCAFFOLDING_PLAN.md`, Steps 3-4, and future replicated structural
editing.

## 1. Purpose

This document defines how Coedit maps the Step 2 Block tree into a private
collaborative carrier. Step 3 qualifies both candidates and Step 4 implements the
winner. This document defines required structural meaning and qualification
criteria. It does not select the Yjs or Automerge adapter, transport protocol, or
position-allocation algorithm.

Use these documents with this contract:

- [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) owns the logical Block
  ontology;
- [`MVP_IMPLEMENTATION_SPEC.md`](MVP_IMPLEMENTATION_SPEC.md) owns private MVP
  implementation rules;
- [`MVP_VERIFICATION_PLAN.md`](MVP_VERIFICATION_PLAN.md) owns executable evidence;
- [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md) owns post-MVP causal History
  and replication constraints; and
- [`decisions/0003-flat-structural-placement.md`](decisions/0003-flat-structural-placement.md)
  preserves the rationale and rejected alternatives.

## 2. Context

Step 2 implements one recursive logical Block tree. Step 3 proves that each
candidate can carry attributed InlineContent and publish one atomic change across
structure and several InlineContents. Step 4 implements that behavior for the
selected carrier.

Yjs and Automerge both provide structured collaborative data. The Block tree does
not need to be serialized as JSON, YAML, indentation text, or another textual
format before it enters the carrier.

The main structural risk is therefore not storage. It is convergence under
concurrent structural work. A generic CRDT map or sequence does not know Coedit's
requirements for one visible Block identity, deterministic order, and recoverable
behavior after conflicting moves or deletes.

The qualified and selected representation must also avoid fixing a full network protocol or
post-MVP conflict UX before qualification evidence exists.

## 3. Accepted logical carrier representation

Use one logical collaborative document per Coedit document. Do not create a
separate Yjs document, Automerge document, or other independently committed CRDT
universe for each Block.

Within that collaborative document, give each Block one Block-local logical
carrier namespace keyed by its durable `BlockId`:

```text
BlockId -> BlockCarrierEntry

BlockCarrierEntry = {
  placement,
  activity,
  payload
}
```

This shape is a logical decomposition, not a required physical nesting layout.
The selected adapter can store the values at different carrier levels when that
is necessary to implement the required merge semantics. In particular, a Block
liveness effect can need to participate at the same replicated conflict boundary
as Block existence instead of living only inside a nested value that disappears
when the outer Block entry is deleted.

`payload` is the Block-local namespace for replicated Block data. It can contain
Block tags, `childrenPresentation`, InlineContents, their canonical collaborative
content, and adapter-private metadata. Exact nesting is an implementation choice.
The `BlockId` namespace does not create another product entity.

`activity` is the logical carrier-private semantic-update marker. It records that
the Block received a semantic update. It does not describe the payload and is not
a public counter, timestamp, or payload hash. Its physical representation can be
a separate liveness effect if the selected carrier requires one. The exact
encoding is a carrier qualification choice.

`placement` contains two logical values:

```text
Placement = {
  position,
  depth
}
```

`position` is a carrier-private sortable order key. `depth` is a positive integer
for every non-root Block.

The root has these special rules:

- it is the first projected Block;
- it has depth `0`;
- its placement is immutable; and
- it cannot be deleted or moved.

The durable `BlockId` identifies one canonical live structural placement per
Block identity. The physical carrier must not represent the same Block as several
independent live list items.

`position` and `depth` form one logical placement value. A move replaces the
complete placement. The carrier adapter must not expose a merge result that
combines `position` from one concurrent move with `depth` from another.

Do not put a hash of the whole Block payload into `Placement`. A whole-payload
hash would make an otherwise compatible move and payload edit compete on the
same placement register. A merged CRDT payload can also differ from every hash
that concurrent writers observed before convergence.

## 4. Tree projection

Project the logical Block tree by sorting all live non-root placements by
`position`, with a deterministic stable-identity tie-break when primary order
keys compare equal.

For each sorted Block, its parent is the nearest preceding Block whose depth is
smaller. If no non-root preceding Block has a smaller depth, the root is the
parent.

Depth values do not need to increase by one. For example:

```text
(root, 0)
(A,    1)
(B,    3)
(C,    1)
```

projects `B` directly under `A`. No anonymous depth-2 Block exists.

The projection must be deterministic for the same complete carrier state.
Because parentage is derived from preceding shallower Blocks, the projected tree
cannot contain a structural cycle.

## 5. Command-to-placement mapping

The Step 2 structural command language remains the product-level mutation
language. Map `CreateBlock(parentId, index)` and `MoveBlock(parentId, index)` to
flat placement by using preorder tree order.

For a destination parent `P`:

1. The destination Block root has depth `P.depth + 1`.
2. If the destination child index is `0`, the destination run starts immediately
   after `P` in projected preorder.
3. Otherwise, the destination run starts after the complete subtree of the
   previous sibling at `index - 1`.
4. The upper bound is the next sibling when one exists. At the end of the child
   vector, the upper bound is the first Block after `P`'s complete subtree, or
   the end of the document order.
5. Allocate the moved or created Block run inside that destination interval.

A subtree move applies one depth delta to the moved subtree so its root has the
required destination depth. It preserves descendant depth differences, Block
identities, and projected relative order. Allocate fresh ordered destination
positions for the moved run. Do not carry old position prefixes into the new
run.

A Block creation is a run of one Block. A subtree move can contain many Blocks.
The published command is all-or-none at the engine boundary.

## 6. Safety preference

Every surviving Block must remain visible exactly once in the projected tree.

Concurrent structural work can produce a placement that is semantically
surprising. For example, if one collaborator moves `A` under `B` while another
collaborator deletes `B`, `A` can project under a different preceding shallower
Block after convergence.

This failure mode is accepted in preference to making `A` unreachable or
invisible. Incorrect parentage is visible and repairable. Loss of reachable
authored content is not an acceptable default.

Do not add an authoritative `parentId` only to preserve the previous parent
relationship. An authoritative parent reference can dangle after concurrent
delete and can hide surviving content unless a second repair system exists.

Do not add a parent hint unless qualification proves that it provides a concrete
recovery benefit that cannot be obtained from History and the visible
projection.

## 7. Block update and delete concurrency

The required semantic preference is non-destructive:

> A semantic update of a Block that is concurrent with deletion of that same
> Block wins over the deletion.

Every semantic Block update must therefore emit a carrier effect that participates
directly in the replicated conflict that determines whether that `BlockId` is
live. This is the Block liveness effect. It is a carrier mechanism, not another
product operation or logical entity.

A structural move is a semantic Block update. Its placement replacement can serve
as the liveness effect only when it participates directly in the same existence
conflict as deletion. Otherwise, the adapter must emit a separate carrier-private
liveness effect in the same logical change.

A semantic payload mutation must update the logical Block activity marker and
emit the required liveness effect in the same logical carrier transaction or
change. A nested activity mutation is insufficient when deletion of its enclosing
Block entry can discard that mutation before it participates in the existence
conflict.

The activity/liveness effect is local to the Block that changed. Editing a
descendant does not update each ancestor. If a parent is deleted while a
descendant receives a concurrent semantic update, the descendant can survive and
project at another visible location under the safety rule.

A subtree delete applies delete effects to the target Block and the descendants
observed by that delete. A concurrent semantic update can keep an affected Block
alive independently of its ancestors.

The carrier adapter must prove the exact effect that implements update-over-delete
semantics. Do not rely on an undocumented last-writer rule, on writing the same
payload value again, or on a nested mutation that can vanish with its enclosing
entry. Yjs and Automerge can use different private encodings if they preserve the
same logical result.

Position normalization described below is allocator work, not user intent. When
it is inexpensive, an adapter should avoid letting normalization alone defeat a
concurrent semantic delete. This is a preferred property, not a mandatory
invariant. If preserving that distinction requires disproportionate machinery,
qualification must document the residual case where normalization can keep a
Block alive.

## 8. Position-order requirements

The position scheme is not frozen by this document. Step 3 must qualify an
established dense-order technique instead of inventing an ad hoc alphabetic
midpoint format.

The selected scheme must provide these properties:

1. **Dense allocation.** A new position can normally be generated between two
   existing positions without relabeling unrelated Blocks.
2. **Collision avoidance.** Normal allocation must use algorithm-native unique
   identifiers, jitter, or an equivalent technique so exact primary-position
   collisions are exceptional rather than routine.
3. **Deterministic convergence.** Equal or concurrent primary positions have a
   deterministic total order. Stable `BlockId` is an acceptable final
   tie-breaker.
4. **Practical key growth.** Repeated insertion or movement into narrow gaps must
   stay within measured storage and comparison budgets. No fixed theoretical
   upper bound is required, but pathological growth must be measured.
5. **Fresh placement on move.** A move allocates a fresh destination position. It
   does not append historical prefixes to the old position.
6. **Run allocation.** A subtree or another ordered Block run receives a fresh
   ordered set of destination positions. The old positions do not accumulate in
   the new keys.
7. **Non-interleaving.** Blocks placed together by one structural operation must
   preserve their internal order and should remain contiguous relative to a
   concurrent run placed at the same logical destination. If the selected
   algorithm cannot guarantee this property, qualification must measure and
   document the residual interleaving risk and repair behavior.

Fractional indexing, LSEQ-family approaches, and non-interleaving sequence
algorithms such as Fugue/FugueMax are relevant prior art. They are qualification
inputs, not accepted dependencies or required implementations.

Do not specify a fixed percentage of the destination gap, such as 10 percent or
1 percent, as product behavior. Compact sub-interval allocation is a useful
heuristic, but the requirement is non-interleaving behavior, not one numerical
mechanism.

## 9. Exact-position collision normalization

The stable-identity tie-break makes an exact primary-position collision readable
and deterministic. It does not create a dense primary-position gap between the
colliding Blocks. Normal allocation must avoid this case when practical.

If a requested insertion must occur inside an exact-position collision run, the
allocator can first reposition the minimum necessary later part of that run. The
normalization must preserve the projected order that existed before the
insertion and must create a usable destination interval for the new Block or run.
This rule applies to collisions of two or more Blocks.

Normalization changes replicated carrier state. It is not local-only repair. If
normalization and insertion can publish in one carrier transaction or change,
use that form. If the carrier requires separate changes, the insertion must have
a causal dependency on the required normalization so a peer does not interpret
the insertion before the destination interval exists.

Normalization does not represent a user-requested `MoveBlock` and does not create
a separate product History action. It is an internal effect of the structural
Contribution that required the new position.

Deterministic normalization and suppression of normalization-only resurrection
are desirable when they are inexpensive. They are not hard product requirements
because exact collisions are expected to be exceptional. Qualification must
record any residual behavior when concurrent normalizations or normalization
versus delete produce different but valid carrier effects.

## 10. Structural operation semantics

A `MoveBlock` does not need a carrier-native list `move()` primitive. It needs one
atomic logical replacement of the target Block's complete `Placement` and fresh
ordered placement for the moved subtree run.

A subtree move preserves the identities and relative logical order of all Blocks
in the subtree. Qualification may implement this as one carrier transaction or
change containing several placement assignments, but the published operation is
all-or-none at the engine boundary.

The same atomic-publication rule applies to one Contribution that spans Block
structure and several InlineContents. One logical collaborative document must
therefore contain the Block registry and the Block-local payload namespaces that
the Contribution can affect.

Do not create a separate product operation class for collision normalization,
activity/liveness refresh, or other carrier-internal effects. The adapter can
organize those effects as private implementation helpers.

## 11. History and recovery

Do not introduce a second automatic recovery-point mechanism for disruptive
remote structural integration.

Product History already preserves materializable Versions. In the future
replicated model, History is a causal Contribution graph, not packet-arrival
order. A semantic Checkpoint targets the exact causal frontier observed by its
author and produces a content-identical Version for that frontier.

If remote integration causes surprising structural placement, the UX can later
surface a disruptive-change warning and direct the user to the relevant before
and after Versions. Detection and presentation are separate from the durable
History mechanism.

## 12. Step 3 qualification and Step 4 regression requirements

Run the same structural carrier suite against the pinned Yjs and Automerge
candidates. At minimum verify:

- root immutability and root-first projection;
- one visible placement per live `BlockId`;
- one Block-local logical payload namespace inside one collaborative document;
- deterministic projection from `position` and `depth`;
- non-sequential depth behavior;
- preorder command-to-placement mapping at the first, middle, and last child
  positions;
- subtree move with the correct depth delta, identity preservation, and internal
  order preservation;
- concurrent move of one Block to different destinations;
- concurrent move versus delete, with move winning after full peer convergence;
- concurrent payload update versus delete, with the payload update keeping that
  Block alive after full peer convergence;
- move and payload-update liveness effects participate directly in the replicated
  conflict that determines Block existence;
- a nested-only activity representation is rejected if deletion of its enclosing
  entry can discard the activity before existence resolution;
- payload mutation, logical activity update, and required liveness effect publish
  together;
- update-over-delete behavior survives the candidate's supported
  serialization/reload and garbage-collection or compaction path;
- descendant activity does not keep a deleted ancestor alive;
- concurrent insertion into one destination gap;
- collision avoidance during ordinary allocation;
- exact-position collision and deterministic `BlockId` tie-break;
- insertion inside two-way and multi-way exact-position collision runs;
- replicated collision normalization and its dependency on insertion;
- any residual normalization-versus-delete behavior;
- concurrent subtree/run moves into one destination gap;
- non-interleaving behavior or measured residual interleaving;
- all-or-none publication of a multi-Block placement change;
- all-or-none publication of structure plus several InlineContent changes;
- repeated narrow-gap insertion and move stress;
- maximum and average position-key length;
- comparison/sort cost and serialized carrier growth; and
- equal projected structure after duplicate, delayed, reordered, partitioned,
  and reconnected carrier updates.

Use qualification surrogates for later History, Range, restore, and portable-format
machinery that does not exist in Step 3. Step 4 retains the suite for the selected
carrier. Repeat the real cross-subsystem tests when those later steps are
implemented.

## 13. What remains open

Step 3 must select the concrete position allocator and prove its behavior. Step
4 implements it behind the accepted allocator abstraction. The exact encoded
`Placement` scalar, activity/liveness encoding, payload nesting,
existence-conflict mapping, carrier transaction format, and adapter-private
metadata are implementation decisions.

Network transport, authorization, causal envelope encoding, retained-History
storage, and the complete post-MVP offline structural-conflict UX remain outside
this contract.

The accepted flat placement model is a compatibility constraint for Steps 3-4
and later work. It is not a claim that every future collaboration conflict can
be resolved without product policy or further research.
