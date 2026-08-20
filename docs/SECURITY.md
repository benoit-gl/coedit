# Security model

This document describes the current security posture of Coedit Local `0.1.0`. It is a control inventory, not a security-audit claim. Residual defects are tracked in [Known limitations](./KNOWN_LIMITATIONS.md).

## Security goals

- operate without ordinary outbound network access;
- treat `.coedit` data, rich HTML, snapshot content, IPC payloads and output paths as untrusted;
- keep native capability surface narrow;
- prevent stored/pasted HTML from becoming executable application code;
- keep desktop mutation state/history/snapshot updates atomic;
- separate non-mutating historical inspection from restoration;
- keep future AI/collaboration explicit and opt-in.

## Trust boundaries

Standalone runs the shared UI plus `MemoryDocumentGateway` inside one browser page. The generated CSP denies `connect-src` and remote application resources. It has no native filesystem command surface.

Desktop runs the shared UI in a WebView and crosses Tauri IPC to registered Rust commands. Rust owns SQLite validation, mutation transactions, backup/export and native persistence sanitization. Native dialog paths are still renderer-supplied strings after user selection; stronger Rust-owned authorization remains hardening work.

## Rich-text boundary

The browser uses the centralized `sanitizeRichText`/DOMPurify policy for paste, fallback loading, previews and checkpoint capture. The memory gateway sanitizes direct body operations again.

Rust uses Ammonia on persisted body HTML. Browser and Rust policies are not yet proven equivalent against one shared fixture set.

Yjs state/update values are untrusted structured input. The desktop backend validates sizes/encoding but does not prove the supplied HTML, incremental update and complete Yjs state are semantically equivalent.

## Continuous canvas and historical mode

WP-7's continuous `DocumentCanvas` is reachable in both live and historical modes; the old master/detail editor is retired.

Security-relevant invariants:

- at most one live block owns a Tiptap/Yjs editor;
- inactive live and all historical bodies render through sanitized previews;
- historical blocks expose no metadata/body editor or structural mutation controls;
- controller command/export guards reject mutation outside live mode;
- revision materialization returns detached data only after standalone snapshot/tree/hash verification;
- stale revision responses are rejected by request/workspace guards;
- Back to current is non-mutating; Restore is a separately confirmed compensating mutation.

Native revision materialization is still host-deferred, so the same verification path is not yet available through Tauri.

## Grouped History security boundary

WP-5 groups History for presentation; it never rewrites physical ledger rows.

Only contiguous `updateBody` rows with the same non-null `groupId` collapse. Expanded rows expose immutable checkpoint metadata and exact revision actions. Group labels/messages are rendered as text, not executable markup.

A partial page-spanning group can request all physical members by exact `groupId` on standalone. That query:

- is read-only;
- ignores ordinary History filters intentionally;
- returns contribution data only;
- cannot alter snapshots, revisions or document state.

Tauri exact group querying is explicitly host-deferred. The UI must not imply a partial native group is complete.

## Native command surface

Current registered document commands remain focused on create/open/close, apply operation, list contributions, restore, backup and export. WP-5 adds no Rust command and no new native permission because native exact-group querying is deferred to WP-10.

When WP-10 adds query commands, they should be narrow read-only methods rather than generic SQL/file access and must preserve the same validation/detachment semantics as the standalone contracts.

## `.coedit` validation and integrity limits

Current open validation checks file identity/version consistency, SQLite integrity, typed decoding and hierarchy validity. It does **not** authenticate the file, replay the ledger, verify every stored contribution/snapshot hash, reapply every normal write limit on all stored fields, or comprehensively re-sanitize every hostile database value.

Hashes are checksums/integrity evidence, not signatures. A person with direct file-write access can replace both content and hash.

## Offline policy

The base application registers no HTTP client, telemetry, sync transport or AI provider. Standalone CSP denies network connections. Desktop CSP allows required packaged resources/Tauri IPC but denies ordinary remote connections.

Any future provider, updater, plugin, filesystem scope, shell permission or network origin is a security-model change and must update CSP/capability documentation and tests deliberately.

## Output/recovery controls

Desktop file outputs use temporary sibling files, content sync and rename/replace logic; parent directories are not explicitly fsynced. Standalone downloads use browser Blob URLs and safe filename normalization.

Standalone recovery JSON and desktop JSON differ and neither imports. Do not present them as a tested round trip.

## Principal residual risks

- contributor fallback can misattribute work;
- desktop hash/ledger verification is incomplete;
- no migration framework;
- browser/Rust sanitizer/hash/Yjs parity is incomplete;
- native file authorization can be hardened;
- host exit/suspension cannot await JavaScript draft drains;
- full snapshots grow with every physical checkpoint;
- no comprehensive CI/platform/accessibility/security matrix.

See [Known limitations](./KNOWN_LIMITATIONS.md) for priorities and evidence.
