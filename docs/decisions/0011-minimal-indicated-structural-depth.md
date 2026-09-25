# ADR 0011: Preserve indicated structural depth when possible

**Status:** Accepted

**Date:** 2026-09-25

**Supersedes in part:** [ADR 0003](0003-flat-structural-placement.md)

**Replacement scope:** This decision replaces only ADR 0003's command-to-placement rule that forced a moved root to `parent.depth + 1` and preserved every descendant depth difference.

## Context

ADR 0003 selected flat structural placement with one replicated `position` and
`depth` per live non-root Block. It also required structural moves to rewrite
the moved root to `parent.depth + 1` and preserve descendant depth differences.

Step 3 qualification showed that the projection does not require indicated depth
to equal logical tree depth. Parentage depends only on the nearest preceding Block
with a smaller indicated depth. A command can therefore preserve more existing
carrier state while producing the same requested logical tree.

Rewriting depth when projection does not require it creates extra replicated
changes. It also makes an ordinary move perform implicit depth rationalization
that is not part of the user command.

## Decision

Treat replicated structural depth as indicated placement depth. Effective logical
depth is derived from projected parentage and can differ from indicated depth.

For `CreateBlock` and `MoveBlock`, change only the indicated depths required to
produce the requested Step 2 tree after the run is spliced into projected
preorder.

- Preserve each existing indicated depth when the target projection permits it.
- When a moved Block must change depth, use the nearest valid indicated depth.
- For a new Block, use the smallest indicated depth that preserves its requested
  parentage and the parentage of stationary Blocks.
- Do not rewrite descendants only to make indicated depth equal effective logical
  depth.
- Keep depth rationalization separate. If it is added later, make it an explicit
  document-model behavior.

A move still allocates fresh ordered destination positions, preserves Block
identities, and preserves projected relative order inside the moved run. The
planner must validate the complete resulting projection before publication.

All other decisions in ADR 0003 remain accepted.

## Rationale

This rule makes the carrier change match the semantic change. It avoids replicated
depth writes that do not affect the requested tree and reduces unnecessary
conflict surface during concurrent work.

The rule also keeps indicated depth as carrier state instead of silently treating
it as a canonical tree-depth encoding. Explicit projection validation prevents a
smaller carrier delta from changing the requested logical parentage.

## Consequences

- Structural planning needs the current indicated depths of moved and stationary
  Blocks.
- Tests must cover non-sequential indicated depths and moves that preserve,
  increase, or otherwise minimally adjust them.
- A structural move does not rationalize unrelated depth values.
- A future rationalization command must be explicit and separately specified.
- The flat placement, liveness, collision, and allocator decisions from ADR 0003
  remain unchanged.

## Authority

[`../STRUCTURAL_CARRIER_MODEL.md`](../STRUCTURAL_CARRIER_MODEL.md) owns the current
structural placement and command-mapping contract.
[`../MVP_VERIFICATION_PLAN.md`](../MVP_VERIFICATION_PLAN.md) owns the required
executable evidence.
