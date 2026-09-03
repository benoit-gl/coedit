# ADR 0004 — Intrinsic link targets

**Status:** Accepted

**Date:** 2026-08-31

**Amended:** 2026-09-03

**Authority:** [`../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) controls detailed link and range-target behavior. [`../PRODUCT_DOMAIN_MODEL.md`](../PRODUCT_DOMAIN_MODEL.md) controls product ontology.

## Context

Step 3 qualifies candidate carriers against canonical CollaborativeContent with intrinsic formatting marks. Step 4 implements the selected carrier. The initial vocabulary includes links. Earlier wording called the link destination a validated safe destination. That wording incorrectly made the document model responsible for application navigation and security semantics.

Coedit also needs document-local links. A Block has a durable `BlockId`, but a Block-only target can be too coarse for navigation to a specific passage. The durable Range contract defines shared resolution behavior across Blocks and InlineContents without freezing the tracking representation.

The domain model deliberately keeps intrinsic formatting separate from external comments and annotations. It defines a shared durable Range value, not one generic annotation entity or registry.

## Decision

A link remains an intrinsic formatting mark.

A link target has one of two forms:

1. **Opaque link metadata.** The document engine preserves a bounded carrier-neutral value without interpreting its application meaning. The presentation or integration layer decides whether and how to interpret or activate it.
2. **Internal Block target.** The link stores a document-local `BlockId`. It can optionally contain a durable Range refinement.

The optional internal-link refinement uses the shared Range value and Range service. This reuse does not create a shared `RangeAnnotation` domain entity and does not make comments intrinsic formatting.

The `BlockId` is the primary internal target. The optional Range resolves only against the current document. If it produces no resolved span or position but the Block exists, the link falls back to the Block. If the Block does not exist in the selected Version, the link remains valid canonical content but is unresolved.

An internal link is a reference only. It does not own the target, prevent deletion, or require incoming-link rewrites when the target disappears.

Internal Block targets are document-local. Cross-document transfer must reject or remove the internal target, or convert it to an external deep link. The application owns the external document URI and supplies its extracted Range fragment to that document's Range service. The Range service performs no cross-document mapping.

## Consequences

- Step 3 carrier qualification must preserve opaque link metadata without interpreting it.
- Carrier qualification must prove durable Range feasibility for internal links as well as future comments.
- Presentation code, not the document model, owns URL or navigation safety policy.
- Same-document copy and restore can preserve internal targets.
- Cross-document import or paste cannot keep an internal target as a destination-document reference without explicit application conversion to an external deep link.
- Deleting a Block can leave unresolved incoming links without causing referential-integrity mutation.
- Comment and annotation lifecycle remains external and distinct from link formatting.

## Rejected alternatives

### Make the canonical model validate URL schemes

Rejected because the document engine would then own presentation and security semantics that can vary by host and application policy.

### Represent internal links only at Block granularity

Rejected because navigation can require a stable passage-level refinement.

### Reuse a comment record as the link target entity

Rejected because comments have an external-record lifecycle and comment-specific attachment and repair state. A link is intrinsic formatting and can fall back to its primary Block target.

### Introduce a generic durable range-annotation entity or registry

Rejected because formatting, Origin, comments, and navigation have different ownership and lifecycle semantics. A shared Range value and service do not require a shared product entity or registry.
