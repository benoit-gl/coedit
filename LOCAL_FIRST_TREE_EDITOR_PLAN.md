# Local-First Hierarchical Editor Reimplementation

## Summary

Build a new portable, local-first desktop editor inspired by TreeWriter's hierarchy and node-editing concepts. Do not reuse its server, authentication, database, proxy, email, or deployment infrastructure.

The initial product works entirely offline. AI and real-time collaboration are later, opt-in phases built on the same contribution model.

## Architecture

- Tauri 2 desktop shell for Windows, macOS, and Linux, with React and TypeScript for the interface.
- Tiptap/ProseMirror for rich-text editing and Yjs for CRDT update representation.
- One portable `.coedit` SQLite file per document, including metadata, history, snapshots, and attachments.
- A Rust persistence layer exposed through narrow Tauri commands; no local HTTP server.
- No outbound network requests by default. Remote AI and synchronization require explicit configuration and consent.
- TreeWriter is an architectural reference only. Copied MIT-licensed code, if ever introduced, must be recorded in `THIRD_PARTY_NOTICES.md`.

## Document and Contribution Model

The document consists of typed nodes arranged in a movable hierarchy. A node has a title, summary, rich text, and optional children.

- `Document`: ID, title, format version, timestamps, and revision.
- `Node`: stable ID, parent ID, ordering position, type, title, metadata, Yjs state, rendered HTML, and deletion state.
- `Contributor`: stable ID, display name, and kind: human, automation, AI, or imported.
- `WritingSession`: contributor, start/end timestamps, and optional description.
- `Contribution`: immutable ID, contributor, timestamp, session, affected nodes, operation, payload, base revision, and resulting state hash.
- `Snapshot`: materialized document state used for validation and fast replay.
- `Attachment`: ID, MIME type, checksum, filename, and bytes.

Structural edits, text edits, metadata changes, automated corrections, and accepted AI changes pass through the same contribution interface. Low-level Yjs updates remain available for exact synchronization while typing bursts are grouped into readable contributions.

## Implementation Phases

1. **Application foundation**: pinned workspace, SQLite format, creation/opening, validation, migrations, backup, atomic transactions, and recovery.
2. **Hierarchy and editing**: outline, keyboard navigation, drag/reparent operations, soft deletion, summaries, and safe rich text.
3. **Contribution history**: contributor identity, grouped writing sessions, search, node filters, replay, hashes, and compensating restoration.
4. **Portability and hardening**: packages, sanitized content, safe embeds, content-addressed attachments, offline verification, JSON/Markdown export, and recovery documentation.
5. **AI integration**: provider-neutral interface and explicit Ollama adapter, preview before acceptance, and attributed AI contributions.
6. **Collaboration**: opt-in authenticated Yjs synchronization with deterministic structural conflict handling and offline continuity.

## Acceptance Criteria

- A document can be created, moved between computers, and reopened without loss.
- Nodes and subtrees retain identity and history when reordered or reparented.
- Every visible persisted mutation maps to an identifiable contribution.
- Replaying contributions produces the stored document hash.
- Interrupted or concurrent saves cannot silently corrupt the primary document.
- Imported content cannot execute scripts or event-handler HTML.
- A clean base installation produces no outbound network traffic.
- AI and collaboration remain disabled until explicitly configured.
- Supported document versions migrate through tested, versioned migrations.

## Assumptions

- The first release is a single-user local application.
- A portable document is one `.coedit` file. A portable application is a normal cross-platform package plus an optional no-install Windows build.
- Undo/redo may use an in-memory editor stack; permanent restoration creates a new contribution rather than deleting history.
- No TreeWriter backend service, Supabase project, MongoDB route, remote script, arbitrary proxy, or SMTP feature is carried over.

