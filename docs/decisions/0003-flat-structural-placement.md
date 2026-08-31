# ADR 0003: Flat structural placement in the collaborative carrier

**Status:** Accepted

**Date:** 2026-08-31

## Context

Step 2 represents the document as one recursive Block tree. Step 3 must introduce
Yjs or Automerge for attributed CollaborativeContent and must also prove that one
logical collaborative document can publish structure and several InlineContents
atomically.

Both carrier candidates support structured shared data. The Block tree therefore
does not need to be serialized to text before collaboration. The design problem
is how to represent structural placement so concurrent moves, payload edits, and
deletes fail in a recoverable way.

Several alternatives were considered.

### Recursive child lists

A direct representation can store each parent's child IDs in a collaborative
list. This gives natural sibling order, but a move becomes removal from one list
and insertion into another. Concurrent moves can preserve more than one live
placement of the same Block unless additional uniqueness machinery exists.

### Explicit parent and sibling position

Another representation can store one map record per Block:

```text
BlockId -> { parentId, siblingPosition }
```

Using `BlockId` as the map key gives one visible placement record. However, a
concurrent move under `B` and deletion of `B` can leave a surviving Block with a
dangling parent reference. A projection must then hide the Block or introduce a
separate repair policy.

For Coedit, hiding surviving authored content is a worse default than visible
mis-parenting.

### Serialized indentation text

The tree can be flattened to an indentation string, but a text CRDT preserves the
character sequence, not the indentation grammar. Concurrent character edits can
produce malformed or semantically unintended structure. Stable Block IDs help
detect damage but do not remove the need for repair.

### Flat ordered placement

The remaining alternative stores one placement value per Block and derives the
tree from global order plus depth:

```text
BlockId -> { position, depth }
```

The carrier map key provides structural uniqueness. There is no authoritative
parent reference that can dangle. Every surviving Block remains somewhere in the
global sequence.

## Decision

Use the flat ordered-placement model as the Step 3 structural carrier contract.

Each live non-root `BlockId` has one complete logical `Placement` containing a
sortable `position` and a `depth`. The root is immutable, first, and has depth
`0`.

Project the tree by sorting placements and assigning each Block to the nearest
preceding Block with a smaller depth. Depth values do not need to be sequential.
A gap in depth does not create an anonymous Block.

`position` and `depth` are one logical placement register. A move replaces the
complete placement. The adapter must not merge the position from one concurrent
move with the depth from another.

Map structural commands to flat order using projected preorder. A new or moved
Block root has `parent.depth + 1`. Insert the run after the complete previous
sibling subtree, or immediately after the parent at child index zero. A subtree
move preserves relative order and descendant depth differences while allocating
fresh destination positions.

Use one logical collaborative document per Coedit document. Within it, each
`BlockId` owns one private carrier namespace containing placement, payload, and a
small semantic-activity marker. Payload can contain Block scalars and its
InlineContents without creating a separate collaborative document per Block.

A semantic update to a Block wins over a concurrent delete of that Block. A move
expresses activity through its replacement placement. A payload mutation updates
the Block activity marker in the same logical carrier change. Descendant activity
does not keep each ancestor alive.

Do not put a whole-payload hash into `Placement`. That would make compatible
payload edits and moves compete on one register, and a merged CRDT payload can
differ from every hash observed by concurrent writers.

The exact position-allocation algorithm remains a Step 3 qualification choice.
It must support dense order, collision avoidance, deterministic tie-breaking,
practical key growth, and ordered run placement. It should prevent or minimize
interleaving of Blocks that one structural operation places together. Fractional
indexing, LSEQ-family algorithms, and Fugue/FugueMax are prior art to evaluate;
none is selected by this ADR.

Do not make a fixed fractional-gap percentage part of the product contract.
Compact allocation inside a destination interval is an implementation heuristic.
The required behavior is preservation of run order and non-interleaving where
practical.

Exact primary-position collisions should be exceptional. If insertion must occur
inside a collision run, the allocator can reposition the minimum necessary later
part of the run while preserving the existing projected order, then allocate the
requested insertion. That normalization is replicated carrier state and belongs
to the structural Contribution that required it; it is not a separate
user-requested move or History action.

Deterministic normalization and preventing normalization alone from defeating a
concurrent delete are preferred when inexpensive. They are not hard product
requirements because normal allocation is expected to avoid exact collisions.
Qualification records any residual behavior.

## Rationale

The representation makes the preferred failure mode a structural property:
`BlockId` remains a live map key with a position, so the Block remains reachable
without a parent-repair layer.

It also keeps the carrier representation flat. The recursive product tree remains
a deterministic projection rather than a second collaborative object graph.
This reduces the number of structural invariants that the carrier must preserve.

Using preorder plus depth gives one direct mapping from the existing Step 2 tree
commands to the carrier without creating an authoritative parent pointer. The
logical tree remains the product model; flat placement remains private carrier
state.

Using a dense position key separates ordering from Block identity. A move can
allocate a fresh position at the destination without carrying historical path or
prefix data. Repeated moves therefore do not inherently lengthen the position
key; key growth depends mainly on destination density and the selected allocator.

Run/subtree movement introduces a separate sequence problem. Concurrent runs
placed in one gap should not interleave element by element because depth makes
adjacency semantically significant. This is a known CRDT sequence problem, so
Step 3 must qualify existing non-interleaving approaches rather than invent a
Coedit-specific percentage heuristic as normative behavior.

The Block activity marker keeps liveness semantics separate from payload
contents. It allows a concurrent text/tag/content update to compete with deletion
without hashing or copying the complete payload into placement metadata. The
exact marker representation stays private to each carrier adapter.

Deep Product History remains the recovery mechanism for disruptive merges. A
future UX can identify large remote structural changes and guide the user to
before/after Versions. A separate automatic recovery-point subsystem is not
required.

## Consequences

- Step 3 must qualify one atomic logical placement value per Block in both Yjs
  and Automerge.
- Step 3 must qualify one logical collaborative document with Block-local payload
  namespaces and atomic structure-plus-content changes.
- Payload mutations require a carrier-private Block activity effect so a semantic
  update can win over a concurrent Block delete.
- The carrier adapter needs a dense-order allocator with normal collision
  avoidance and a stable identity tie-break.
- Exceptional exact-position collisions can require replicated normalization
  before insertion.
- Structural tests must include command-to-placement mapping, concurrent move,
  payload-update/delete, collision normalization, subtree/run movement,
  interleaving, and key-growth stress.
- The Step 2 recursive tree remains the logical product model and command
  language; the flat carrier state is private representation.
- Exact network transport and complete post-MVP structural-conflict UX remain
  deferred.
- The final position algorithm and activity-marker encoding are not frozen until
  qualification evidence exists.

## Authority

[`../STRUCTURAL_CARRIER_MODEL.md`](../STRUCTURAL_CARRIER_MODEL.md) owns the Step 3
technical contract. [`../PRODUCT_DOMAIN_MODEL.md`](../PRODUCT_DOMAIN_MODEL.md)
owns logical Block meaning. [`../COLLABORATION_MODEL.md`](../COLLABORATION_MODEL.md)
owns post-MVP causal History and replication constraints. This ADR preserves the
context, alternatives, and rationale and does not replace those authorities.
