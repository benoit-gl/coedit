# ADR 0002: Global durable identity and empty genesis root

**Status:** Accepted

**Date:** 2026-08-28

## Context

Step 2 requires a trusted document factory and distinct branded TypeScript ID
types. Two details require explicit interpretation so later implementation does
not infer application policy inside the document engine.

First, durable UUID text can be compared across entity types even though normal
code rarely needs that comparison. A collision between two durable entity types
must not create two entities with the same UUID text.

Second, every document must contain exactly one real root Block. The root is an
engine invariant, not authored application content. Creating a title or another
InlineContent during genesis would make an application convention part of the
agnostic document engine.

## Decision

All durable user-created and domain entity UUID text belongs to one global
identity namespace. The same UUID text cannot identify two different live
durable entities, including entities with different branded TypeScript ID types.
History and portable validation later extend the non-reuse rule across retained
lifetimes.

Canonical durable entity IDs remain lowercase UUID-v4 text. The UUID text does
not encode, and does not have to reveal, the entity type. Branded TypeScript
types prevent accidental API misuse at compile time only. Internal diagnostics
or tests can show type context, but type information is not part of the UUID
format or an external API contract.

`createEmptyDocument(...)` creates exactly one real root Block. The new root is
completely empty: it has no tags, no InlineContents, and no child Blocks. The
factory does not create a title, placeholder content, default authored unit, or
other application material. Trusted construction supplies the root identity and
the required structural `childrenPresentation` value; the domain factory does
not choose an application presentation convention.

Root construction remains outside the structural-operation model. The first
successful user mutation occurs after genesis.

## Consequences

- Step 2 live validation uses one UUID-text namespace across durable domain
  entity types.
- ID brands remain TypeScript-only distinctions and do not change serialized UUID
  text.
- Production UUID generation remains outside the pure domain boundary.
- Application code must add any initial title, authored empty unit, or other
  starter content through ordinary document operations after genesis.
- Tests must verify that genesis has no tags, InlineContents, or child Blocks and
  that cross-type UUID collisions fail.

## Authority

[`../PRODUCT_DOMAIN_MODEL.md`](../PRODUCT_DOMAIN_MODEL.md) controls product
ontology. [`../MVP_IMPLEMENTATION_SPEC.md`](../MVP_IMPLEMENTATION_SPEC.md)
controls the private implementation rules. Exported TSDoc on the implemented
Step 2 factory and ID contracts is the direct as-implemented source contract.
This ADR preserves the rationale and does not replace those authorities.
