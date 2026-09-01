# ADR 0005 — Semantic interpretation boundaries

**Status:** Accepted

**Date:** 2026-08-31

**Authority:** [`../MVP_ARCHITECTURE.md`](../MVP_ARCHITECTURE.md) controls component authority. [`../PRODUCT_DOMAIN_MODEL.md`](../PRODUCT_DOMAIN_MODEL.md) controls durable product meaning. Focused adapter specifications control import, export, clipboard, transport, and other boundary behavior.

## Context

During Step 3, the link model exposed a layering problem. Earlier documentation required the canonical document model to distinguish safe and unsafe link destinations. That classification depends on the host, renderer, activation context, and current policy. It is not an enduring fact about the document.

A related Markdown rule persisted `import:markdown-literal` as an InlineContent tag when the importer could not represent source syntax directly. That tag described an importer's interpretation of a source representation, not durable authored meaning. It also had no clear lifecycle after later edits.

The same class of error can recur when new adapters, security policies, AI integrations, importers, renderers, or storage systems are added. The project needs an explicit test for deciding which layer owns a classification.

## Decision

Canonical document state stores durable document facts and accepted product semantics. A boundary or consumer derives judgments that depend on its current context, policy, capabilities, or source representation.

Before persisting a classification, apply this design test:

1. **Fact or judgment:** Is the value an objective fact about the document, or a judgment made by the current adapter, environment, policy, or implementation?
2. **Context stability:** Would the value still mean the same thing in another renderer, host, importer version, security policy, or future application?
3. **Durable workflow:** Is there a real document workflow that requires this value to survive independently of the component that derived it?

A classification that is contextual, can change when the consumer changes, and has no durable workflow normally stays out of canonical document state. Return it as a diagnostic, projection result, activation decision, or other boundary result instead.

Structural validation and bounded carrier-neutral shape checks remain valid at low levels. They protect canonical representation without assigning application meaning to opaque values.

## Accepted applications

### Link metadata

An ordinary link mark carries opaque bounded metadata. The document model preserves it without deciding that it is a URL, URI, command, citation, safe destination, unsafe destination, or activatable target.

A component that chooses to interpret or activate that metadata applies its own current policy at that boundary. An activation decision is derived state unless a later product feature gives an external assessment its own durable identity, provenance, and lifecycle.

### Markdown import diagnostics

Unsupported Markdown syntax is preserved as plain authored text when the interchange contract requires preservation, and the importer returns a diagnostic. The importer does not persist `import:markdown-literal` or another tag whose only meaning is that one importer version could not represent the original source construct.

If a future feature must retain exact unsupported source syntax for later round-trip reconstruction, it requires an explicit source-preservation model and lifecycle. It must not be introduced indirectly through ordinary document tags.

### Trust and identity

Origin and Contributor records can preserve descriptive attribution facts. Authentication, authorization, signature validity, and security-principal decisions remain separate concerns. A descriptive Origin claim does not become authenticated because it is canonical document state.

### Carrier semantic activity

The product or command-to-carrier mapping tells the carrier which effects represent semantic Block updates. Carrier code must not inspect arbitrary payload fields and infer whether a change is semantically important. Internal normalization and allocator effects remain distinct from user semantic intent where the structural contract requires that distinction.

## Consequences

- New document fields need a durable product meaning, not only implementation convenience.
- Adapter diagnostics are not persisted automatically.
- Security policy is enforced where inert data becomes an active capability or external action.
- Opaque metadata can still have size, depth, type, and canonical-shape limits.
- Tags remain generic authored/application metadata. They must not become a hidden channel for adapter bookkeeping unless a documented durable workflow owns that convention.
- Source-format syntax and parser classifications remain interchange concerns unless the product explicitly promotes them to durable document concepts.
- Future work should apply the three-question design test before adding new durable enums, flags, tags, classifications, or validation judgments.

## Rejected alternatives

### Persist contextual judgments for convenience

Rejected because they become stale when the host, policy, importer, or renderer changes and force unrelated document mutations to refresh derived state.

### Treat every derived result as transient

Rejected because some classifications are true domain semantics. Block relationships, intrinsic formatting, Origin attribution, and explicit durable comment attachment state have document workflows and stable meaning. The test distinguishes these from contextual implementation judgments.

### Put all safety validation in the document model

Rejected because inert canonical data and active capabilities have different trust boundaries. Low-level structural validation remains required, but activation policy belongs to the component that performs the action.
