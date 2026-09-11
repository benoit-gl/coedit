# ADR 0005 — Semantic interpretation boundaries

**Status:** Accepted; link and formatting examples refined by ADR 0010

**Date:** 2026-08-31

**Authority:** [`../MVP_ARCHITECTURE.md`](../MVP_ARCHITECTURE.md) controls component authority. [`../PRODUCT_DOMAIN_MODEL.md`](../PRODUCT_DOMAIN_MODEL.md) controls durable product meaning. Focused adapter specifications control import, export, clipboard, transport, and other boundary behavior. [`0010-typed-inline-content-payloads.md`](0010-typed-inline-content-payloads.md) refines the payload, formatting, and link boundaries established after this ADR.

## Context

During Step 3 design, the earlier link model exposed a layering problem. Earlier documentation required the canonical document model to distinguish safe and unsafe link destinations. That classification depends on the host, renderer, activation context, and current policy. It is not an enduring fact about the document.

A related Markdown rule persisted `import:markdown-literal` as an InlineContent tag when the importer could not represent source syntax directly. That tag described an importer's interpretation of a source representation, not durable authored meaning. It also had no clear lifecycle after later edits.

The same class of error can recur when new adapters, security policies, AI integrations, importers, renderers, or storage systems are added. The project needs an explicit test for deciding which layer owns a classification.

ADR 0010 later removed engine-owned formatting and link objects from InlineContent entirely. Links are application interpretations of payload syntax or application metadata. The engine exposes generic document structure and durable text Range facilities; an application can use a Range as part of a local target without making the Range service aware that the holder represents a link.

## Decision

Canonical document state stores durable document facts and accepted product semantics. A boundary or consumer derives judgments that depend on its current context, policy, capabilities, or source representation.

Before persisting a classification, apply this design test:

1. **Fact or judgment:** Is the value an objective fact about the document, or a judgment made by the current adapter, environment, policy, or implementation?
2. **Context stability:** Would the value still mean the same thing in another renderer, host, importer version, security policy, or future application?
3. **Durable workflow:** Is there a real document workflow that requires this value to survive independently of the component that derived it?

A classification that is contextual, can change when the consumer changes, and has no durable workflow normally stays out of canonical document state. Return it as a diagnostic, projection result, activation decision, or other boundary result instead.

Structural validation and bounded carrier-neutral shape checks remain valid at low levels. They protect canonical representation without assigning application meaning to opaque values.

## Accepted applications

### Link interpretation

The document engine has no ordinary link mark or link-target concept. A `text/plain` payload can have no link semantics at all. A `text/markdown` application can interpret Markdown link syntax as a URL, command, citation, local Coedit reference, or another application concept.

When an application wants a durable local text target, it can store or serialize the generic Range value defined by `RANGE_MODEL.md`. The Range service tracks text; it does not know that a holder is a link, comment, navigation target, or another application feature. Activation, fallback, repair, and security policy remain application responsibilities.

### Markdown import diagnostics

Unsupported structural Markdown syntax is preserved according to the current interchange contract rather than by persisting an importer-specific classification. The importer does not persist `import:markdown-literal` or another tag whose only meaning is that one importer version could not represent the original source construct.

Inline Markdown syntax remains source text unless the application translates recognized structural syntax into document structure. Source-preservation behavior is defined by `MARKDOWN_INTERCHANGE.md`; it is not encoded through ordinary document tags.

### Trust and identity

Origin and Contributor records can preserve descriptive attribution facts. Authentication, authorization, signature validity, and security-principal decisions remain separate concerns. A descriptive Origin claim does not become authenticated because it is canonical document state.

### Implementation capacity

An arbitrary maximum text or payload size is not a canonical document invariant only because the current carrier or runtime has a practical limit. Implementations can return explicit resource/capacity failures at real boundaries. Qualification workloads remain test evidence rather than validity limits. `CAPACITY_AND_PERFORMANCE_TARGETS.md` owns the cross-cutting policy and maturity model, and [`ADR 0008`](0008-capacity-contract-maturity.md) preserves the reclassification rationale and earlier planning values.

### Carrier semantic activity

The product or command-to-carrier mapping tells the carrier which effects represent semantic Block updates. Carrier code must not inspect arbitrary payload fields and infer whether a change is semantically important. Internal normalization and allocator effects remain distinct from user semantic intent where the structural contract requires that distinction.

## Consequences

- New document fields need a durable product meaning, not only implementation convenience.
- Adapter diagnostics are not persisted automatically.
- Security and activation policy belong to the application component that turns inert payload data into an active capability or external action.
- Links and formatting are not engine-owned InlineContent semantics.
- Generic Range state can support application-owned links, comments, navigation, or other holders without acquiring holder-specific meaning.
- Opaque metadata can still have size, depth, type, and canonical-shape limits when a focused contract introduces such metadata.
- Implementation capacity and resource guards remain explicit boundary constraints rather than arbitrary domain semantics.
- Tags remain generic authored/application metadata. They must not become a hidden channel for adapter bookkeeping unless a documented durable workflow owns that convention.
- Source-format syntax and parser classifications remain interchange concerns unless the product explicitly promotes them to durable document concepts.
- Future work should apply the three-question design test before adding new durable enums, flags, tags, classifications, or validation judgments.

## Rejected alternatives

### Persist contextual judgments for convenience

Rejected because they become stale when the host, policy, importer, or renderer changes and force unrelated document mutations to refresh derived state.

### Treat every derived result as transient

Rejected because some classifications are true domain semantics. Block relationships, Origin attribution, durable Range lineage, and other explicitly accepted document facts have stable workflows. The test distinguishes these from contextual implementation judgments. ADR 0010 specifically removed intrinsic formatting and link interpretation from this category.

### Put all safety validation in the document model

Rejected because inert canonical data and active capabilities have different trust boundaries. Low-level structural validation remains required, but activation policy belongs to the component that performs the action.