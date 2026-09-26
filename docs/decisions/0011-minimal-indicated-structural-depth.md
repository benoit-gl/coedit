# ADR 0011: Use minimum indicated depth for created and moved runs

**Status:** Accepted

**Date:** 2026-09-25

**Supersedes in part:** [ADR 0003](0003-flat-structural-placement.md)

**Replacement scope:** This decision replaces only ADR 0003's command-to-placement rule that forced a moved root to `parent.depth + 1` and preserved every descendant depth difference.

## Context

ADR 0003 selected flat structural placement with one replicated `position` and
`depth` per live non-root Block. It also required structural moves to rewrite
the moved root to `parent.depth + 1` and preserve descendant depth differences.

Step 3 qualification showed that projection does not require indicated depth to
equal logical tree depth. Parentage depends only on the nearest preceding Block
with a smaller indicated depth. This tolerance is useful after concurrent
replication. A merged state can contain non-minimum indicated depths and still
project to one valid, visible tree.

A `MoveBlock` already allocates fresh positions and replaces the complete
placement of every Block in the moved run. Preserving larger historical depths
therefore does not avoid placement writes or placement-level conflicts. It can
also make represented depth grow as a function of edit history.

## Decision

Treat replicated structural depth as indicated placement depth. Effective logical
depth is derived from projected parentage and can differ from indicated depth.
Projection accepts non-minimum indicated depths when they otherwise satisfy the
structural carrier contract.

For `CreateBlock` and `MoveBlock`, assign the minimum valid indicated depths
to the semantic run after it is spliced into target projected preorder.

- For the created or moved run root, use the smallest indicated depth that makes
  the requested destination parent the nearest preceding shallower Block and
  preserves the projected parentage of stationary Blocks.
- For each descendant in the moved run, use its planned parent's indicated depth
  plus one.
- Do not preserve a larger historical indicated depth only because projection
  would accept it.
- Do not rewrite indicated depths of stationary Blocks. Position-collision
  normalization preserves the stationary Block's indicated depth.
- Do not normalize the whole carrier after a merge. A converged non-minimum
  indicated depth is valid carrier state unless a later semantic operation
  rewrites that Block's run.
- If global depth rationalization is added later, define it as separate explicit
  document-model behavior.

A move still allocates fresh ordered destination positions, preserves Block
identities, and preserves projected relative order inside the moved run. The
planner must validate the complete resulting projection before publication.

All other decisions in ADR 0003 remain accepted.

## Rationale

Tolerant indicated depth lets concurrent carrier state resolve to a valid visible
tree without requiring repair writes. Minimum-depth semantic writes serve a
different purpose: they keep new local structural work compact and independent
of unnecessary historical depth.

A move already rewrites every complete placement in its semantic run. Assigning
minimum valid depth to those placements does not add placement writes or enlarge
the placement-level conflict footprint. Keeping stationary depths unchanged
avoids unrelated replicated churn.

## Consequences

- Structural planning needs the indicated depths of stationary Blocks around the
  destination interval.
- Created and moved runs do not retain larger historical depth values.
- Concurrently merged or otherwise stationary non-minimum depths remain valid and
  are not repaired automatically.
- Tests must cover tolerant projection, minimum-depth semantic writes, and
  preservation of stationary indicated depths.
- The flat placement, liveness, collision, and allocator decisions from ADR 0003
  remain unchanged.

## Authority

[`../STRUCTURAL_CARRIER_MODEL.md`](../STRUCTURAL_CARRIER_MODEL.md) owns the current
structural placement and command-mapping contract.
[`../MVP_VERIFICATION_PLAN.md`](../MVP_VERIFICATION_PLAN.md) owns the required
executable evidence.
