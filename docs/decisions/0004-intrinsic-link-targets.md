# ADR 0004 — Intrinsic link targets

**Status:** Accepted

**Date:** 2026-08-31

**Authority:** [`../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) controls detailed link and range-target behavior. [`../PRODUCT_DOMAIN_MODEL.md`](../PRODUCT_DOMAIN_MODEL.md) controls product ontology.

## Context

Step 3 expands `InlineContentValue` into canonical CollaborativeContent with intrinsic formatting marks. The initial vocabulary includes links. Earlier wording called the link destination a validated safe destination. That wording incorrectly made the document model responsible for application navigation and security semantics.

Coedit also needs document-local links. A Block has a durable `BlockId`, but a Block-only target can be too coarse for navigation to a specific passage. The existing comment design already defines stable cursor, affinity, quote/context, and approximate-position mechanics for a range inside an InlineContent.

The domain model deliberately keeps intrinsic formatting separate from external comments and annotations. It does not define one generic durable range entity for all concerns.

## Decision

A link remains an intrinsic formatting mark.

A link target has one of two forms:

1. **Opaque link metadata.** The document engine preserves a bounded carrier-neutral value without interpreting its application meaning. The presentation or integration layer decides whether and how to interpret or activate it.
2. **Internal Block target.** The link stores a document-local `BlockId`. It can optionally contain a range refinement inside an `InlineContent` owned by that Block.

The optional internal-link range uses the same targeting mechanics as `CommentTarget`: stable start/end cursors, affinities, quote/context evidence, and an optional approximate position. This is behavioral and implementation reuse only. It does not create a shared `RangeAnnotation` domain entity and does not make comments intrinsic formatting.

The `BlockId` is the primary internal target. If the range cannot resolve but the Block exists, the link falls back to the Block. If the Block does not exist in the selected Version, the link remains valid canonical content but is unresolved.

An internal link is a reference only. It does not own the target, prevent deletion, or require incoming-link rewrites when the target disappears.

Internal Block targets are document-local. Cross-document transfer must not bind a source `BlockId` to an equal UUID in the destination document without an explicit mapping protocol.

## Consequences

- Step 3 carrier qualification must preserve opaque link metadata without interpreting it.
- Carrier qualification must prove stable range-target feasibility for internal links as well as future comments.
- Presentation code, not the document model, owns URL or navigation safety policy.
- Same-document copy and restore can preserve internal targets.
- Cross-document import or paste requires explicit future target mapping before internal links can remain live references.
- Deleting a Block can leave unresolved incoming links without causing referential-integrity mutation.
- Comment and annotation lifecycle remains external and distinct from link formatting.

## Rejected alternatives

### Make the canonical model validate URL schemes

Rejected because the document engine would then own presentation and security semantics that can vary by host and application policy.

### Represent internal links only at Block granularity

Rejected because navigation can require a stable passage-level refinement.

### Reuse `CommentTarget` as the link target entity

Rejected because comments have external-record lifecycle and explicit attached/ambiguous/orphaned repair semantics. A link is intrinsic formatting and can fall back to its primary Block target.

### Introduce a generic durable range-annotation entity

Rejected because formatting, Origin, comments, and navigation have different ownership and lifecycle semantics. Shared cursor mechanics do not require a shared product entity.
