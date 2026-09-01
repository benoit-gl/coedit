# `.coedit` portable document format

**Status:** Accepted logical recovery contract; exact carrier-specific version-1
fields and golden bytes are frozen only after the Step 3 carrier qualification.

## 1. Purpose and authority

This document defines lossless portable recovery for the document-engine MVP.

The user-facing extension is `.coedit`. A portable artifact retains current
attributed content, every advertised retained Version, product History,
Contributors and Origins, semantic Checkpoints, source/derivation information,
stable public Version identity, and command idempotency within documented
limits.

[`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) controls domain meaning.
[`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md)
controls formatting and Origin behavior. [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md)
controls the public serialization boundary. This document controls portable
logical records, validation, compatibility, and the version-1 container.

The internal browser repository is separately specified by
[`BROWSER_PERSISTENCE.md`](BROWSER_PERSISTENCE.md). Its stores and checkpoint
layout are not the `.coedit` wire format.

The preserved SQLite `.coedit` format on `tauri-experimental-orphan` is
historical evidence only. The shared extension identifies a Coedit document
family; it does not make the formats compatible.

## 2. Public transport and freeze rule

The user-facing transport identity is:

```text
suggestedExtension: ".coedit"
```

The public architecture keeps `mediaType` as opaque transport metadata until a
media type is registered or deliberately selected.

Version 1 uses one bounded UTF-8 JSON container with base64 for binary chunks if
the carrier qualification confirms that the resource and performance limits are
acceptable. JSON is a portable container, not the internal database layout or a
permanent promise that all future versions remain monolithic JSON.

Do not freeze `formatVersion: 1`, publish a version-1 fixture, or implement the
Step 6 encoder until Step 3 has recorded:

- the selected carrier and exact supported version range;
- its canonical checkpoint and incremental-effect encodings;
- logical-state and historical-materialization verification;
- native formatting and Origin round-trip behavior;
- garbage-collection/retention assumptions; and
- the measured JSON/base64 size and load cost.

This is an implementation qualification gate. It does not reopen the product
semantics defined by current authorities.

## 3. Logical package

The version-1 container represents these logical records. Exact JSON property
names and binary sub-encodings are finalized by the carrier gate without
changing their meaning:

```text
PortableManifest
  format: "coedit-document"
  formatVersion: 1
  exportedAt
  documentId
  currentVersionToken
  currentFrontier/private head reference
  carrier:
    name
    version
    schemaVersion
  contributors[]
  origins[]
  contributions[]
  advertisedVersions[]
  commandReceipts[]
  chunks[]
  integrity:
    algorithm: "sha256"
    digest
```

Each immutable Contribution record contains or references at least:

```text
contributionId
commandId
parent Version/frontier
resulting Version/frontier
acting ContributorId
semantic kind
optional semanticGroupId and human summary
affected targets
exact effect/update chunk references
optional source Version and derivation references
authored display timestamp
```

Each advertised Version maps one stable public `VersionToken` to the private
frontier/checkpoint/effect information required to materialize it exactly.
Clients never decode that mapping.

`exportedAt` is transport metadata. Assembling or transporting an artifact does
not create a Contribution or Version.

The package contains sufficient physical recovery checkpoints and immutable
effects to reconstruct every advertised retained Version. Current state is the
materialization named by `currentVersionToken`; it is not a second independent
document object.

## 4. Physical and semantic records stay distinct

A semantic **Checkpoint** is an attributed, content-identical Contribution in
product History.

A physical recovery checkpoint is a carrier/storage optimization used to bound
replay. It has no Contributor, does not create a Version, and does not appear as
a History action.

Similarly, carrier updates/effects are not Product History by themselves. The
portable package preserves the verified relationship between each semantic
Contribution and its exact convergence effect.

Complete snapshots per Contribution can be used by bounded early prototype
fixtures, but version 1 must not require them if the selected carrier can provide
immutable effects plus periodic checkpoints. A codec optimization cannot change
which Versions are advertised or materializable.

## 5. Canonical collaborative state

One logical carrier checkpoint/update set reconstructs the Coedit document's
Block registry/order and every InlineContent's CollaborativeContent. The format
does not default to one independent carrier document or blob per InlineContent.

Carrier state preserves exactly:

- text and hard breaks;
- intrinsic formatting marks and their boundary policies;
- protected Origin references;
- stable Block and InlineContent identities and ordering;
- the private identities/tombstones required for accepted editing, restore, and
  future comment-cursor behavior; and
- atomic effects spanning structure and several InlineContents.

A normalized Block/text/mark projection can be computed during validation. If
stored as an index or diagnostic aid, it is derived and must be verified against
the carrier state; it is never a competing authority.

The format does not contain external formatting or provenance ranges.

## 6. Origin, actor, and derivation

The package preserves immutable Origin records and every reference from content
to those records. Each record names its claimed agent kind/Contributor and any
source or upstream Origin reference required by the current document.

The Contribution that introduces, pastes, copies, restores, imports, formats,
or accepts material separately names the acting Contributor. In particular:

- internal copy and restore retain source Origin while recording the new actor;
- restored material uses fresh carrier identities without a new `restored`
  Origin category;
- external material uses imported or unknown Origin unless a validated source
  claim exists; and
- a human accepting AI material does not replace its software-agent Origin.

These records are descriptive attribution. SHA-256 integrity and local
Contributor IDs are not authentication or a signature.

## 7. IDs and scalar wire rules

Use these rules:

- Durable user-created and domain entity IDs are canonical lowercase UUID-v4
  strings. Other persisted record IDs use the same representation unless their
  authoritative type defines another opaque form. Trusted code allocates IDs;
  pure reducers do not generate them.
- `VersionToken` is public and opaque. The codec retains the private mapping
  needed to reproduce every advertised token after open.
- Timestamps are canonical RFC 3339 UTC with millisecond precision:
  `YYYY-MM-DDTHH:mm:ss.sssZ`.
- SHA-256 hashes are exactly 64 lowercase hexadecimal characters.
- Optional properties are omitted when absent. Do not alternate silently
  between omitted and `null`.
- Required integer fields are safe JSON integers.
- Unknown properties are rejected in format version 1.
- Binary chunks use one exact base64 spelling selected by the final v1 codec;
  alternate or non-canonical spellings are rejected.

Identity reuse means assigning an existing durable ID to a different entity,
record, or lifetime. An ordinary reference to the same immutable record, such
as an Origin retained by copy or restore, is not reuse. Neither is an exact
idempotent retry of the same successful `CommandId`.

## 8. Contributor and Origin bootstrap

A blank document or import session begins with a human Contributor supplied by
the UX. This does not create an account or security-principal model.

The MVP package preserves each document-local Contributor's stable ID, kind, and
validated display name so History attribution survives Save/Open. Display names
obey the scalar limits in `MVP_IMPLEMENTATION_SPEC.md`; they are descriptive
metadata, not authenticated identity. A later separately managed profile can
change presentation without changing stable attribution IDs.

Human editing creates human Origin records. Markdown/file import creates
imported or unknown Origin for source content while the import Contribution is
attributed to the human or system actor that performed the action. The source
file is not impersonated as the actor.

Every content Origin reference and Contribution actor must resolve to a valid
record under the accepted identity rules. A portable file cannot cause a local
session identity, CRDT client ID, or transport connection to become a durable
Contributor implicitly.

## 9. Validation order

Treat portable input as hostile. Validate a detached copy in this order:

1. raw byte-size limit;
2. UTF-8, JSON depth, duplicate keys, envelope identifier, exact supported
   version, known properties, collection limits, and safe integers;
3. carrier name/version/schema support and encoded binary shape;
4. per-chunk decoded-size limit and SHA-256 content address;
5. envelope corruption digest over the still-untrusted canonical payload;
6. unique live IDs, immutable-record conflicts, command-idempotency records,
   and prohibited durable identity reuse across retained lifetimes;
7. Contribution graph/frontier acyclicity, parent/result references, retained
   Version mappings, current pointer, and reachability;
8. Contributor, Origin, source, derivation, effect, and checkpoint references;
9. carrier checkpoint/effect schema, dependency closure, and resource limits;
10. reconstructed Block topology, ownership, ordering, tags, and structural
    limits;
11. reconstructed text, hard breaks, marks, boundary policies, Origin coverage,
    opaque link-metadata shape/resource bounds, and typed internal-link shape; and
12. History replay/materialization invariants.

Validate a complete candidate engine before replacing the active engine or
committing it to the browser repository.

## 10. History verification

Verify retained History from genesis/frontier dependencies rather than trusting
array or packet order.

Genesis must contain the initial root and no Contribution. The first retained
user mutation must be represented by the first Contribution rather than being
folded into genesis.

For each Contribution:

- verify that its exact effect applies to its declared base/frontier;
- verify the resulting Version/frontier mapping and affected targets;
- verify acting Contributor, Origin, source, and derivation references;
- verify semantic Checkpoints are content-identical to their declared base; and
- verify successful CommandId records reproduce the original receipt and reject
  conflicting reuse.

For local single-writer restore, verify that visible material equals the selected
target while restored items retain historical Origin and the restore
Contribution names the new actor and target. A future replicated format verifies
the causal compensation rules in `COLLABORATION_MODEL.md`, including preservation
of work outside the restore author's observed frontier.

Recompute derived projection hashes, affected targets, indexes, and reserved-ID
sets. Do not trust serialized derived claims.

## 11. Initial resource limits

Start with these version-1 correctness limits, subject to confirmation by the
carrier qualification measurements:

- 64 MiB UTF-8 JSON;
- JSON nesting depth 128;
- 5,001 advertised Versions including genesis;
- 5,000 Contributions;
- at most 64 parent/frontier references on one Contribution;
- 250,000 semantic operations in one Contribution;
- 1,000,000 semantic operations in one archive;
- 50,000 Blocks in any materialization;
- 50,000 InlineContents in any materialization;
- 8 MiB for one decoded carrier checkpoint/effect chunk;
- 48 MiB decoded binary chunk data across the archive; and
- 1,000,000 Unicode code points in one InlineContent.

The encoder preflights the same limits and final UTF-8 size. Return a typed limit
error instead of creating a version-1 file the decoder rejects. Do not truncate
History, Origins, or document state to fit the format.

If representative correct fixtures cannot fit or load acceptably on the recorded
qualification environment, change the container before declaring version 1 frozen.
Treat these measurements as format-capacity evidence, not as a general hardware
performance promise, and do not silently relax hostile-input bounds.

## 12. Integrity and chunk identity

Use SHA-256 for corruption detection and content addressing. Do not describe it
as authentication or tamper-proofing.

Each immutable binary chunk records the digest of its decoded canonical bytes.
The envelope also records a digest over canonical UTF-8 JSON with the envelope
digest field omitted. Sort object keys recursively and retain array order.

After the carrier gate, check in:

- one minimal canonical version-1 fixture;
- one realistic attributed/history fixture;
- their exact canonical bytes and digests; and
- malformed/mis-hashed variants.

## 13. Serialization concurrency

Serialization is a non-mutating engine query against an expected VersionToken.
It captures one stable retained frontier and the immutable records reachable
under the requested History-retention contract.

If the engine advanced before serialization begins, return `VersionConflict`.
Do not silently serialize a different Version. Concurrent repository activity
cannot cause a mixture of two heads in one artifact.

The returned artifact identifies the Version it contains. Explicit `.coedit`
assembly can read immutable repository records, but normal browser autosave never
serializes the complete artifact.

## 14. Required verification

At minimum, verify:

- realistic imported, edited, formatted, copied, and restored content round
  trips;
- exact current and historical materialization;
- intrinsic formatting and boundary policies survive;
- Origin, actor, and derivation remain distinct and exact;
- semantic Checkpoints and physical recovery checkpoints remain distinct;
- advertised VersionTokens remain stable after Save/Open;
- successful CommandId retries remain idempotent after Save/Open;
- missing, duplicate, unreachable, mis-hashed, or conflicting chunks fail;
- malformed graph/frontiers, Contributor/Origin references, carrier state,
  topology, ownership, marks, opaque link metadata, and typed internal links fail;
- malformed, truncated, duplicate-key, unknown-property, or unsupported
  container/carrier versions fail;
- every documented resource limit fails safely when exceeded;
- stale serialization returns no artifact;
- caller mutation of input bytes after open starts cannot alter the candidate;
- a failed open never replaces the active engine;
- reconstruction from periodic checkpoint plus effects equals direct current and
  historical materialization; and
- every successful version-1 encode is accepted by the version-1 decoder.

## 15. Compatibility and evolution

Any durable schema change requires one of:

- a proven backward-compatible version-1 change explicitly permitted by the
  final version-1 contract; or
- a new format version with explicit migration and compatibility rules.

A carrier name/version/schema change is not assumed binary-compatible. It needs
a supported migration through carrier-neutral logical materialization or a new
container version. Public engine APIs and product IDs must not expose carrier
bytes merely to avoid that migration boundary.

Future comments, conversations, authenticated claims, signatures, attachments,
or replicated protocol records do not enter version 1 silently. Minimum Origin
metadata is already part of the version-1 logical requirement.

Measurements can justify a later manifest plus compressed binary chunks instead
of monolithic JSON/base64. Such a container change can preserve the same logical
records and product contract, but it still requires an explicit format version
and migration decision.
