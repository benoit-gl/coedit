# Vision, requirements, and use cases

This is the current requirements/use-case view for Coedit Local `0.1.0`, `.coedit` format version `1`.

## Vision

Coedit helps authors develop long-form writing as a hierarchy of ideas with rich text while retaining local control and attributable revision history. The desktop product stores a portable SQLite `.coedit` file; the standalone HTML build provides the same shared UI over volatile memory for development and inspection.

The base runtime is offline-first: no account, hosted backend, telemetry, synchronization transport, or AI provider is registered.

## Current scope

| Capability | Status |
|---|---|
| Create document | Implemented in both hosts |
| Open `.coedit` | Desktop implemented |
| Continuous hierarchical editing | Implemented WP-6/WP-7 |
| Inline metadata/tags | Implemented |
| Tiptap/Yjs body editing with semantic checkpoints | Implemented WP-4/WP-7 |
| Raw History search/filter/paging | Implemented; desktop long-history limitation remains |
| Group semantic body checkpoints in History | Implemented WP-5 |
| Exact page-spanning group expansion | Standalone implemented; Tauri host-deferred |
| View historical revisions without mutation | Standalone implemented WP-1/WP-3/WP-7; Tauri host-deferred |
| Restore revision as compensating change | Implemented |
| Markdown/JSON export | Partial fidelity/recovery semantics |
| SQLite backup | Desktop implemented |
| Optional navigation-only sidebar | Proposed WP-7A |
| Browser/accessibility qualification | Proposed WP-8 |
| Standalone qualification | Proposed WP-9 |
| Native revision/group-query parity | Proposed WP-10 |

## Primary actors

- **Author** — creates structure and prose, inspects/restores history, exports and closes.
- **Document custodian** — opens, backs up, transfers or recovers `.coedit` files.
- **Contributor/developer** — extends and verifies the application.
- Browser APIs, native dialogs, Tauri IPC, filesystem and SQLite are supporting technical actors.

## Core use cases

### UC-01 — Create document

Create a titled document and initial contributor. Standalone stores it in memory; desktop creates a new `.coedit` file. Revision `0` records creation.

### UC-02 — Open portable document

Desktop only. Select a `.coedit` file, validate application/version/database/tree structure, and expose it read-write or newer-format read-only as permitted. Contributor portability and migration remain partial.

### UC-03 — Organize hierarchy

Use the continuous canvas to add, collapse/expand, reorder, indent/outdent, reparent and soft-delete nodes. Structural operations drain pending drafts first. The old master/detail outline is not a current mode.

### UC-04 — Edit node metadata

Edit inline title/tags. Draft values flush on ordinary field boundaries and controlled transitions.

### UC-05 — Edit node body

Exactly one live block owns the Tiptap/Yjs editor. Semantic input boundaries, character thresholds and idle safety intervals produce ordered physical checkpoints. Several checkpoints in one uninterrupted writing episode share one `groupId`.

### UC-06 — Inspect History

History loads newest-first raw contribution pages with optional search/node filtering, then projects them for human reading.

WP-5 behavior:

1. contiguous `updateBody` rows with the same non-null `groupId` collapse into one semantic row;
2. the collapsed row uses the newest/final checkpoint as its canonical revision;
3. raw loaded contribution count and visible History-row count are shown separately;
4. loading an older raw page can merge a group split across that boundary;
5. a possibly incomplete oldest group says `at least N` checkpoints;
6. expanding a complete group reveals every loaded physical checkpoint;
7. expanding a partial group performs an exact standalone group query across the full in-memory ledger;
8. Tauri explicitly states that full group expansion is unavailable until native query parity exists.

Grouping never deletes or rewrites physical contributions.

### UC-07 — View historical revision

Standalone: selecting **View** drains pending live drafts, materializes a detached hash-verified snapshot without mutation, and shows it through the read-only continuous canvas. **Back to current** restores the retained live projection without a gateway write.

Tauri still lacks this query capability and therefore uses the temporary restore fallback.

### UC-08 — Restore revision

After explicit confirmation, restore a historical state as a **new** current revision. Later history remains intact.

### UC-09 — Export / backup

Export Markdown or JSON through host-specific storage. Desktop can also create a SQLite backup. Markdown is lossy; JSON recovery semantics differ by host and neither imports.

### UC-10 — Close document

Freeze and drain registered drafts, close the host document, and return to Welcome. Forced host/process exit remains a separate limitation.

### UC-11 — Run standalone artifact

Open generated `dist/index.html` through `file://`, use the complete shared UI with volatile storage, and export before leaving.

## Continuous-workspace requirements

| ID | Requirement | Current status |
|---|---|---|
| FR-PW-01 | Render hierarchy as pure visible pre-order projection | Implemented WP-6 |
| FR-PW-02 | At most one live rich-text editor owner | Implemented WP-7 |
| FR-PW-03 | Materialize a historical revision without mutation | Standalone implemented |
| FR-PW-04 | Historical workspace visibly/programmatically read-only | Standalone implemented |
| FR-PW-05 | Restore remains explicit compensating mutation | Implemented |
| FR-PW-06 | Semantic/threshold/idle checkpoints replace fixed debounce | Implemented WP-4 |
| FR-PW-07 | Checkpoint policy is centralized/injectable | Implemented |
| FR-PW-08 | History groups exact physical checkpoints by semantic episode | Implemented WP-5; native exact-query parity pending |
| FR-PW-09 | Structural transitions drain body work before change | Implemented WP-7 |
| FR-PW-10 | Persistence order/backpressure is bounded | Implemented WP-4 |
| FR-PW-11 | Core canvas structure reachable by keyboard/pointer | Implemented; broader qualification pending |
| FR-PW-12/13 | Optional navigator and responsive shell | Proposed WP-7A/WP-8 |

## Reserved features

AI proposals, collaboration transport, attachments, contributor management, complete writing-session lifecycle, and direct deleted-node restoration remain reserved/incomplete. Their type/schema presence is not user-facing implementation.

## Success evidence

A credible current MVP demonstration should show continuous editing, semantic checkpoints, grouped History with exact standalone expansion, non-mutating standalone View/Back, compensating Restore, `.coedit` desktop persistence, exports/backups, offline CSP behavior, and known limitations stated without exaggerating platform/native parity.
