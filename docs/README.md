# Coedit engineering documentation

This directory describes Coedit Local as it exists on `main` at application version `0.1.0` and `.coedit` format version `1`. The code and root [`README`](../README.md) are authoritative for reachable behavior; these documents explain the architecture, requirements, verification evidence, risks, and remaining work.

## Current baseline

The following continuous-workspace work packages are implemented in the shared application:

- **WP-1** — standalone revision materialization query;
- **WP-2** — explicit live/historical workspace projection and command guards;
- **WP-3** — reachable read-only historical viewing in standalone;
- **WP-4** — semantic rich-text checkpoint coordinator and application contract;
- **WP-5** — grouped History projection with exact standalone group expansion;
- **WP-6** — visible-node projection;
- **WP-7** — continuous `DocumentCanvas`, inline metadata/structure controls, one-editor ownership, and retirement of master/detail.

Remaining staged work starts with the optional navigation-only sidebar (**WP-7A**), followed by browser/accessibility qualification (**WP-8**), standalone qualification (**WP-9**), and native/Tauri historical and group-query parity plus broader hardening (**WP-10**).

WP-5 is presentation/query work only. It does **not** change `.coedit` format version 1: semantic edit grouping uses the existing contribution `groupId`/SQLite `group_id` field.

## Start here

| Need | Primary document |
|---|---|
| Product scope and use cases | [Vision and use cases](./RUP_VISION_AND_USE_CASES.md) |
| Future product ontology and recorded domain decisions | [Product and domain model](./PRODUCT_DOMAIN_MODEL.md) |
| System shape and boundaries | [Architecture](./ARCHITECTURE.md) |
| React/application ownership | [Frontend design](./FRONTEND_DESIGN.md) |
| Gateways, history queries, SQLite | [Persistence design](./PERSISTENCE_DESIGN.md) |
| Current interaction model | [UI and UX](./UI_UX.md) |
| Runtime flows | [Sequence diagrams](./SEQUENCE_DIAGRAMS.md) |
| Feature-to-code lookup | [Traceability](./TRACEABILITY.md) |
| Verification commands and gaps | [Testing](./TESTING.md) |
| Known defects and risks | [Known limitations](./KNOWN_LIMITATIONS.md) |
| Build/package/platform state | [Build and portability](./BUILD_AND_PORTABILITY.md) |
| Trust boundaries | [Security](./SECURITY.md) |
| `.coedit` format and recovery | [Document format](./DOCUMENT_FORMAT.md) |
| Contributor workflow | [Contributing](./CONTRIBUTING.md) |
| Remaining continuous-workspace design | [Change-package decision record](./proposals/README.md) |

## System at a glance

Coedit has one shared React/TypeScript application with two explicit hosts:

```text
standalone index.html                    Tauri desktop
        |                                     |
        +------------- App ------------------+
                        |
              useDocumentController
                 /      |       \
        DocumentCanvas History  draft/checkpoint control
                 \      |       /
                  DocumentGateway
                   /           \
       MemoryDocumentGateway   TauriDocumentGateway
              |                       |
      runtime memory          Rust DocumentStore
                                      |
                              .coedit SQLite file
```

The standalone host is self-contained and volatile. The Tauri host persists `.coedit` files but still lacks native parity for revision materialization and exact contribution-group queries.

## Status language

- **Implemented** — reachable through a current composition root and represented by current code/tests.
- **Partial** — a useful implementation exists but a material limitation remains.
- **Reserved** — represented in a type/schema but no complete user workflow exists.
- **Proposed** — design guidance for behavior not yet reachable.

## Documentation policy

Avoid duplicating volatile facts such as exact test counts, line counts, or long file inventories in multiple artifacts. Link to the owning document or source instead. When a work package lands, update the proposal status, as-built architecture/design, UX/use-case description, traceability, testing evidence, and risk register in the same change.

The older [`LOCAL_FIRST_TREE_EDITOR_PLAN.md`](../LOCAL_FIRST_TREE_EDITOR_PLAN.md) remains a roadmap/history artifact. Where it differs from current code or this engineering set, current code wins.
