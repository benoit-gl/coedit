# Structural carrier model

**Status:** Accepted Step 3 structural carrier contract; exact position-allocation
algorithm remains a qualification decision.

**Applies to:** `SCAFFOLDING_PLAN.md`, Step 3, and future replicated structural
editing.

## 1. Purpose

This document defines how Coedit maps the Step 2 Block tree into the private
collaborative carrier during Step 3. It defines the required structural meaning
and qualification criteria. It does not select the final Yjs or Automerge
adapter, transport protocol, or position-allocation algorithm.

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

Step 2 implements one recursive logical Block tree. Step 3 introduces a
collaborative carrier for attributed InlineContent and must also prove that one
logical collaborative document can publish an atomic change that spans structure
and several InlineContents.

Yjs and Automerge both provide structured collaborative data. The Block tree does
not need to be serialized as JSON, YAML, indentation text, or another textual
format before it enters the carrier.

The main structural risk is therefore not storage. It is convergence under
concurrent structural work. A generic CRDT map or sequence does not know Coedit's
requirements for one visible Block identity, deterministic order, and recoverable
behavior after conflicting moves or deletes.

The Step 3 representation must also avoid fixing a full post-MVP replicated-tree
algorithm before qualification evidence exists.

## 3. Accepted logical carrier representation

Represent live Block placement as one carrier map entry per `BlockId`:

```text
BlockId -> Placement
```

A `Placement` contains two logical values:

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

The carrier map key is the durable `BlockId`. This gives one canonical live
placement register per Block identity and avoids representing the same Block as
several independent list items.

`position` and `depth` form one logical placement value. A move replaces the
complete placement. The carrier adapter must not expose a merge result that
combines `position` from one concurrent move with `depth` from another.

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

## 5. Safety preference

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

## 6. Delete and move concurrency

The required semantic preference is non-destructive:

> A concurrent placement change of a Block wins over deletion of that same Block.

This rule applies to structural placement concurrency. It does not imply that any
unrelated content edit automatically resurrects a deleted Block.

The Yjs and Automerge qualification adapters must prove the exact carrier effect
that implements this rule. Do not assume undocumented last-writer behavior is a
product contract.

## 7. Position-order requirements

The position scheme is not frozen by this document. Step 3 must qualify an
established dense-order technique instead of inventing an ad hoc alphabetic
midpoint format.

The selected scheme must provide these properties:

1. **Dense allocation.** A new position can normally be generated between two
   existing positions without relabeling unrelated Blocks.
2. **Deterministic convergence.** Equal or concurrent primary positions have a
   deterministic total order. Stable `BlockId` is an acceptable final
   tie-breaker.
3. **Practical key growth.** Repeated insertion or movement into narrow gaps must
   stay within measured storage and comparison budgets. No fixed theoretical
   upper bound is required, but pathological growth must be measured.
4. **Fresh placement on move.** A move allocates a fresh destination position. It
   does not append historical prefixes to the old position.
5. **Run allocation.** A subtree or another ordered Block run receives a fresh
   ordered set of destination positions. The old positions do not accumulate in
   the new keys.
6. **Non-interleaving.** Blocks placed together by one structural operation must
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

## 8. Structural operation semantics

The Step 2 structural command language remains the product-level mutation
language. The carrier representation is a private implementation of its logical
result.

A `MoveBlock` does not need a carrier-native list `move()` primitive. It needs one
atomic logical replacement of the target Block's complete `Placement`.

A subtree move preserves the identities and relative logical order of all Blocks
in the subtree. Qualification may implement this as one carrier transaction or
change containing several placement assignments, but the published operation is
all-or-none at the engine boundary.

The same atomic-publication rule applies to one Contribution that spans Block
structure and several InlineContents.

## 9. History and recovery

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

## 10. Step 3 qualification requirements

Run the same structural carrier suite against the pinned Yjs and Automerge
candidates. At minimum verify:

- root immutability and root-first projection;
- one visible placement per live `BlockId`;
- deterministic projection from `position` and `depth`;
- non-sequential depth behavior;
- concurrent move of one Block to different destinations;
- concurrent move versus delete, with move winning;
- concurrent insertion into one destination gap;
- exact-position collision and deterministic `BlockId` tie-break;
- insertion between Blocks that previously collided;
- subtree move with identity and internal-order preservation;
- concurrent subtree/run moves into one destination gap;
- non-interleaving behavior or measured residual interleaving;
- all-or-none publication of a multi-Block placement change;
- all-or-none publication of structure plus several InlineContent changes;
- repeated narrow-gap insertion and move stress;
- maximum and average position-key length;
- comparison/sort cost and serialized carrier growth; and
- equal projected structure after duplicate, delayed, reordered, partitioned,
  and reconnected carrier updates.

Use qualification surrogates for later History, restore, and portable-format
machinery that does not exist in Step 3. Repeat the real cross-subsystem tests
when those later steps are implemented.

## 11. What remains open

Step 3 must still select or implement the concrete position allocator and prove
its behavior. The exact encoded `Placement` scalar, carrier transaction format,
and adapter-private metadata are implementation decisions.

Network transport, authorization, causal envelope encoding, retained-History
storage, and the complete post-MVP offline structural-conflict UX remain outside
this contract.

The accepted flat placement model is a compatibility constraint for Step 3. It
is not a claim that every future collaboration conflict can be resolved without
product policy or further research.
