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

## Trust assumptions and non-guarantees

These are part of the security specification and must not be strengthened implicitly by later documentation or UI copy:

- `.coedit` files are not encrypted; filesystem access implies document confidentiality is outside Coedit's control.
- Contributions and hashes are not signed or authenticated. Direct database writers can alter state, history and recorded hashes.
- Successful SQLite/open validation is not proof that a document is benign, authentic or untampered.
- The application does not defend a compromised OS account, browser/WebView/native runtime or dependency supply chain.
- Standalone memory is volatile and may be inspectable by the browser environment; contributor `localStorage` is preference data, not authentication material.
- Yjs is a local rich-text representation in the current product, not an authenticated collaboration protocol.

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

A native command/capability change requires explicit security review when it adds or broadens any of the following: filesystem reach, dialog/file grants, network origins, shell/process execution, plugin permissions, updater behavior, additional windows, generic database/file APIs, or renderer-controlled authority. Application capability types are not authorization primitives by themselves.

## `.coedit` validation and integrity limits

Current open validation checks file identity/version consistency, SQLite integrity, typed decoding and hierarchy validity. It does **not** authenticate the file, replay the ledger, verify every stored contribution/snapshot hash, reapply every normal write limit on all stored fields, or comprehensively re-sanitize every hostile database value.

Hashes are checksums/integrity evidence, not signatures. A person with direct file-write access can replace both content and hash.

## Offline policy

The base application registers no HTTP client, telemetry, sync transport or AI provider. Standalone CSP denies network connections. Desktop CSP allows required packaged resources/Tauri IPC but denies ordinary remote connections.

Any future provider, updater, plugin, filesystem scope, shell permission or network origin is a security-model change and must update CSP/capability documentation and tests deliberately.

A future network/AI/collaboration feature is not conforming merely because it can be wired through an interface. Before it is described as supported it must define, as applicable: explicit user initiation/consent, endpoint and redirect/protocol policy, authentication/authorization, content disclosure, credential storage, cancellation/offline behavior, retention/logging, attribution of automated output, sanitized preview/acceptance, structural concurrency semantics, recovery ordering and a dedicated CSP/capability profile or permission flow.

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

## Durable threat/control rules

The risk register owns current prioritization; this section owns cross-cutting rules that should survive individual risk IDs.

| Threat class | Required control boundary | Non-guarantee / review trigger |
|---|---|---|
| Executable rich content | Sanitize at browser/editor render/capture paths and again at authoritative native persistence where applicable | A frontend allowlist alone is insufficient for tampered IPC/files; URL schemes and browser/Rust policy drift require fixtures/tests. |
| Corrupt/hostile document | Validate identity/version/SQLite/type/tree before installing a view; historical snapshots are also untrusted input | Integrity checks/hashes are not authentication. Any migration or broader accepted stored shape requires hostile fixtures. |
| Partial document/history commit | One authoritative transaction per desktop mutation plus ordered frontend transition/checkpoint sequencing | Forced process/browser exit remains outside Promise-based drains; new lifecycle integrations need explicit durability evidence. |
| Native authority escalation | Narrow registered commands/capabilities and explicit host composition | Renderer-supplied paths are not equivalent to Rust-owned grants. Generic filesystem/SQL/shell/network surfaces require threat-model review. |
| History/revision confusion | Immutable ledger, explicit query/command separation, stale-response guards | Presentation grouping must not mutate history; View must not be emulated via Restore or temporary live-state replacement. |
| Resource exhaustion | Input limits where authoritative plus bounded checkpoint queue | File/node/history/snapshot totals are not globally bounded; policy changes affecting checkpoint frequency require growth/failure measurements. |
| Identity/attribution error | Store rejects unknown IDs and operations carry explicit contribution context | Current fallback can select another existing contributor; future multi-user/automation work requires registration/reconciliation semantics. |
| Network/data disclosure | No provider/network origin in base compositions; restrictive CSP | Any provider/updater/telemetry/collaboration endpoint is a product and security boundary, not a routine dependency addition. |

## Security review gate for changes

Before merging a change that crosses a trust boundary, answer the applicable questions in the PR/review record or tests/documentation. A “no” is acceptable only when the reason is explicit.

1. Does the change add an input, parser, URL/protocol, file type, native command, plugin, permission, origin, credential, background updater/provider, or new host?
2. What is the authoritative validation boundary, and can a caller bypass the UI and reach it with hostile data?
3. Are size/resource limits appropriate at that boundary, including failure behavior rather than only the happy path?
4. Can the change make stored/pasted/historical content executable or create a raw-HTML path that bypasses the centralized sanitizer?
5. Does it alter persisted schema, wire shapes, hashes, snapshots or recovery envelopes, requiring version/migration/fixture work?
6. Can failure partially advance materialized state, attribution, contribution history, snapshots or output replacement?
7. Does historical/read-only mode remain guarded at the controller/command boundary as well as visually disabled?
8. Are query results detached and protected against stale workspace/request installation?
9. Does standalone bypass a control that exists only in Rust, or does native code claim parity without equivalent evidence?
10. Does the change broaden native filesystem/network/shell authority beyond what the visible user action implies?
11. Could configuration or accumulated pending work cause unbounded memory/CPU/history/snapshot growth?
12. If AI/automation/collaboration is involved, are endpoint/identity/consent/attribution/cancellation/recovery semantics explicit before acceptance can mutate the document?
13. Are malicious/failure cases covered at the seam that actually exercises the claimed property, and are residual limitations recorded instead of hidden?

Security-sensitive changes should update this document only when the durable boundary changes; changing a current severity/status belongs primarily in `KNOWN_LIMITATIONS.md`.
