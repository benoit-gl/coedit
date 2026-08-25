# `.coedit` portable document format

**Status:** Accepted MVP portable-format contract.

## 1. Purpose and authority

This document defines the lossless portable format for the document-engine MVP.

The user-facing extension is `.coedit`. The portable artifact is the recovery format for current document state, retained History, stable advertised Version identity, command idempotency, and all other durable MVP state.

`PRODUCT_DOMAIN_MODEL.md` controls domain meaning. `MVP_ARCHITECTURE.md` controls the public serialization boundary. This document controls the version-1 portable wire contract.

The preserved SQLite `.coedit` format on `tauri-experimental-orphan` is historical evidence only. The shared extension identifies a Coedit document family; it does not make the old SQLite schema compatible with this format.

## 2. Public transport identity

The public `PortableDocument` metadata for format version 1 uses:

```text
suggestedExtension: ".coedit"
mediaType: "application/vnd.coedit.document+json"
```

The bytes are UTF-8 JSON for version 1. The UX treats them as opaque.

The extension is product-visible and stable. The media type and internal encoding can evolve only through an explicit compatibility decision.

## 3. Envelope

Use one JSON envelope with these logical fields:

```text
format: "coedit-document"
formatVersion: 1
exportedAt
 documentId
currentRevisionId
contributors[]
contributions[]
revisions[]
integrity: {
  algorithm: "sha256"
  digest: lowercase hexadecimal SHA-256
}
```

Do not store a duplicate current-document object. Current state is the snapshot named by `currentRevisionId`.

`exportedAt` is transport metadata. It does not create a Version or Contribution.

## 4. Private-history representation

The MVP can use a private linear revision ledger with one full document snapshot per revision. This representation is a version-1 codec choice, not a public `DocumentEngine` contract.

Revision zero is genesis and has no Contribution. Every later revision has exactly one Contribution. Every Contribution has exactly one resulting revision.

The portable file must retain enough canonical request identity for a successful `CommandId` retry to remain idempotent after Save/Open.

## 5. Snapshot wire form

Keep the in-memory Block model recursive. Flatten each revision snapshot on the wire.

```text
rootBlockId
blocks[]:
  id
  parentId | null
  siblingIndex | null
  tags[]
  childrenPresentation
  inlineContentIds[]

inlineContents[]:
  id
  tags[]
  collaborativeText
  formatting[]
```

Serialize Blocks in iterative depth-first pre-order and sibling-vector order.

Only the root has `parentId: null` and `siblingIndex: null`. Every other Block records its zero-based sibling index.

Retain InlineContent vector order in `inlineContentIds`. Serialize InlineContents in first ownership-appearance order.

The flat form is a serialization of the recursive model. It is not a second domain model.

## 6. Collaborative text and formatting

The portable format must preserve the complete canonical CollaborativeText state required to reconstruct the MVP editor state exactly according to the accepted Step 3 design.

Formatting is stored as external `RangeAnnotation<Formatting>` data with opaque `TextAnchor` endpoints. The exact version-1 encoding of `TextAnchor` is intentionally **not yet defined** because Step 0 remains blocked on that design decision.

Do not finalize or implement format version 1 until the `TextAnchor` representation is recorded. When that decision is made, update this document before Step 1 begins.

The portable format must not encode formatting solely as a second, hidden ProseMirror/Yjs-mark authority when the domain authority is the external range model.

## 7. IDs and scalar wire rules

Use these rules:

- Persisted IDs are canonical lowercase UUID-v4 strings unless their authoritative type defines another opaque representation.
- `VersionToken` is public and opaque. The portable codec retains the private information needed to reproduce advertised tokens after open.
- Timestamps are canonical RFC 3339 UTC with millisecond precision: `YYYY-MM-DDTHH:mm:ss.sssZ`.
- Import hashes are exactly 64 lowercase hexadecimal SHA-256 characters.
- Optional properties are omitted when absent. Do not alternate silently between omitted and `null`.
- Numeric fields that require integers must be safe JSON integers.
- Unknown properties are rejected in format version 1.

## 8. Contributor bootstrap

A blank document or Markdown-import session begins with a human Contributor supplied by the UX. For the MVP, the UX can request a free-form display name before document-session creation.

The portable file stores Contributor identity and display name as durable attribution data. It does not store a login account, security principal, or user profile.

Markdown import can also create an imported Contributor before genesis so that the import Contribution can use that identity.

## 9. Checkpoints and edit captures

A semantic **Checkpoint** is a History Contribution that produces a new content-identical Version. It is stored as an ordinary Contribution and resulting revision.

Interactive editor safety captures or physical edit commits are not semantic Checkpoints. They can share a semantic edit-group identifier for History presentation. Do not call those records `checkpoint` in the new format or implementation APIs.

The preserved edit-group policy is adapted into current vocabulary in `MVP_IMPLEMENTATION_SPEC.md`.

## 10. Validation order

Treat portable input as hostile. Validate in this order:

1. raw byte-size limit;
2. JSON depth, duplicate keys, envelope identifier, exact supported version, known properties, collection limits, and safe-integer fields;
3. encoded binary shape and decoded-size limits;
4. corruption checksum over the still-untrusted payload;
5. revision sequence, parent links, current pointer, and Contribution/revision one-to-one relationship;
6. Contributor references, command-idempotency records, stable identity continuity, and prohibited ID reuse;
7. Block topology, sibling indices, InlineContent ownership, tags, and structural limits;
8. CollaborativeText schema and resource limits; and
9. formatting ranges and `TextAnchor` validity according to the accepted Step 3 design.

Validate a complete candidate engine before replacing the active engine.

## 11. History verification

After shape validation, verify retained History from genesis in sequence order.

For operation and Markdown-import Contributions, reapply their durable effects to the parent snapshot and verify that the resulting normalized document state matches the stored child snapshot according to the operation contracts.

For semantic Checkpoints, verify that document material is identical to the parent.

For restore, verify that the resulting material matches the selected historical target according to the restore contract.

Recompute affected targets and the document-lifetime reserved-ID set. Do not trust serialized derived claims.

The exact collaborative-state comparison algorithm must follow the accepted Step 3 and `TextAnchor` design. Do not invent a Yjs-internal equivalence algorithm in this format document.

## 12. Initial resource limits

Start with these version-1 limits:

- 64 MiB UTF-8 JSON;
- JSON nesting depth 128;
- 5,001 revisions including genesis;
- 5,000 Contributions;
- 250,000 operations in one Contribution;
- 1,000,000 operations in one archive;
- 50,000 Blocks in any snapshot;
- 50,000 InlineContents in any snapshot;
- 8 MiB for one decoded CollaborativeText value or incoming text update; and
- 48 MiB decoded binary data across the archive.

The encoder preflights the same limits and final UTF-8 size. Return a typed limit error instead of creating a version-1 file that the decoder will reject.

Do not truncate History or document state to fit the format.

## 13. Corruption checksum

Use SHA-256 as a corruption checksum. Do not describe it as authentication or tamper-proofing.

Compute the digest over canonical UTF-8 JSON with the digest field omitted. Sort object keys recursively and retain array order.

Keep one checked-in fixture with canonical bytes and expected digest.

## 14. Serialization concurrency

Serialization is a non-mutating engine query against an expected VersionToken.

If the engine has advanced before serialization begins, return `VersionConflict`. Do not silently serialize a different Version.

The returned artifact identifies the Version it contains. The UX can compare that token with the token last transported successfully for dirty-state tracking.

## 15. Required verification

At minimum, verify:

- a realistic imported and edited engine round trips through `.coedit`;
- current and historical state remain materializable;
- semantic Checkpoint Contributions and their Versions survive;
- advertised VersionTokens remain stable after Save/Open;
- successful CommandId retries remain idempotent after Save/Open;
- Contributor identities survive;
- current state comes from exactly one retained revision snapshot;
- malformed, truncated, duplicate-key, unknown-property, or unsupported-version input fails;
- corrupt checksum fails;
- malformed topology, broken History links, missing Contributors, duplicate identities, and illegal ID reuse fail;
- over-limit input fails before active-engine replacement;
- stale serialization returns no artifact;
- caller mutation of input bytes after open starts cannot alter the candidate; and
- every successful version-1 encode is accepted by the version-1 decoder.

After the `TextAnchor` decision is recorded, add exact formatting/anchor round-trip and validation cases before Step 0 closes.

## 16. Compatibility rule

Any durable schema change requires one of:

- a proven backward-compatible version-1 change explicitly permitted by this document; or
- a new format version with migration/compatibility rules.

Future provenance, comments, conversations, replicated causal state, attachments, or other durable post-MVP records do not enter format version 1 silently.
