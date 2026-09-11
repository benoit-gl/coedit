# InlineContent payload contract

**Status:** Accepted logical content direction; carrier selection and mixed
replacement/edit semantics remain Gate B decisions. Production raw-media
processing remains a Step 4 decision.

## 1. Purpose and authority

This document defines the payload owned by an `InlineContent`, the Internet Media
Type used to label that payload, the initial fine-grained capability allowlist,
the separation between collaborative state and raw media representation, and the
convergence requirements for whole-payload replacement.

[`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) controls product ontology.
[`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) owns
fine-grained text and Origin behavior. [`RANGE_MODEL.md`](RANGE_MODEL.md) owns
durable references inside fine-grained text. [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md)
owns the public engine boundary. [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md)
owns the later network protocol and causal History model.

This document intentionally does not specify the complete input/output filter
matrix for every recognized Media Type. Step 4 selects and qualifies the first
production raw-media processor capability.

## 2. Separation of concerns

An `InlineContent` is a durable document entity that owns one collaborative
payload and one Internet Media Type that describes its media representation. The
document model owns `InlineContent` identity, ownership, ordering, tags, History
participation, and the supplied Media Type value.

The Media Type answers **what format the media representation has**. Coedit's
compile-time allowlist answers **which formats receive fine-grained text
operations in this implementation**. Raw-media processing answers **which
representations the current processor can decode or encode**. These are separate
questions.

Block and InlineContent boundaries imply no character, space, line break,
paragraph break, or other textual separator. Application and interchange layers
project structure into presentation.

The initial document model does not provide a general-purpose structured-data
CRDT or a dynamic payload plugin framework.

## 3. Media Type preservation and capability dispatch

InlineContent uses an Internet Media Type value as its durable payload-format
discriminator. The complete supplied value, including parameters, is durable
metadata and is preserved exactly through ordinary storage, reload, copy,
History, and portable serialization.

Capability matching is separate from preservation. The implementation parses a
valid Media Type and compares its case-normalized `type/subtype` identity against
one compile-time allowlist. Parameters do not participate in this capability
lookup. Do not use raw string-prefix matching.

The initial fine-grained allowlist contains exactly:

```text
text/markdown
text/plain
```

For example, these values all select the `text/markdown` fine-grained capability
while remaining distinct preserved Media Type values:

```text
text/markdown; charset=UTF-8
Text/Markdown; charset="utf-8"
text/markdown; charset=UTF-8; variant=CommonMark
```

Values such as `text/markdown-extra` and `text/markdown+json` do not match.

Every other syntactically valid Media Type initially uses generic opaque handling.
The document model preserves its exact Media Type, bytes, and payload-level
Origin. It does not require a decoder, renderer, or IANA registry lookup merely to
store the payload.

### 3.1 Syntax, capability, and representation support are separate

Malformed Media Type syntax is invalid input. A syntactically valid unfamiliar
Media Type is valid document content and uses generic opaque handling.

An allowlisted type does not fall back to opaque handling merely because a raw
processor cannot interpret the supplied representation. Fine-grained capability
is selected from normalized `type/subtype`; raw-media support is checked only
when an operation actually crosses the media byte boundary.

Preserving a Media Type parameter does not imply that the initial raw processor
implements every representation profile defined by that parameter. Processor
support may depend on representation-affecting parameters as well as the base
`type/subtype`. If the supplied Media Type requires behavior that the selected
processor does not implement, the raw/coarse operation fails explicitly as an
unsupported representation profile.

The processor must not silently ignore a representation-affecting parameter,
rewrite the Media Type, transcode to another representation, substitute content,
or reinterpret the payload as opaque. Failure publishes no partial document
change.

Detailed parameter semantics, supported profile combinations, charset support,
codec/library choice, and profile-specific transformations belong to the Step 4
processor selection and its focused verification. This contract does not select
them in advance.

Reopening already-canonical collaborative state from `.coedit` is not a raw-media
boundary and does not rerun Media-Type representation validation against the
stored collaborative value.

| Condition                                                                                | Required behavior                                                                                                |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Malformed Media Type syntax                                                              | Reject atomically as invalid input.                                                                              |
| Valid Media Type not in the fine-grained allowlist                                       | Accept through generic opaque handling, subject to ordinary envelope and resource checks.                        |
| Valid allowlisted type whose raw representation is unsupported by the selected processor | Fail explicitly at the raw/coarse boundary; do not relabel, transcode silently, or fall back to opaque handling. |
| Invalid bytes for a supported raw representation                                         | Fail explicitly without partial publication.                                                                     |
| Fine-grained text that the selected raw representation cannot encode exactly             | Fail explicitly; do not substitute or repair content.                                                            |
| Unsupported carrier or container schema                                                  | Report incompatibility; this is not an unknown Media Type.                                                       |
| Exceeded selected implementation guard                                                   | Report capacity/resource failure without partial publication.                                                    |

## 4. Fine-grained text payloads

A payload whose normalized type/subtype is in the compile-time allowlist uses the
fine-grained text capability set. The initial formats are `text/markdown` and
`text/plain`.

The collaborative logical text value is a native ECMAScript string at the public
JavaScript boundary. Coedit does not add a general Unicode normalization, repair,
or well-formedness subsystem around ordinary fine-grained editing.

The exact lossless native-string domain is intentionally not frozen before the
carrier is selected. Step 3 must qualify candidate carrier behavior, including
ordinary Unicode text and edge cases such as ill-formed ECMAScript string
sequences. Gate B records the supported carrier behavior needed by the production
contract. The purpose of that qualification is to expose carrier limitations,
not to pre-select a second string representation or validation layer in this
PR.

Fine-grained APIs exchange native strings and operate on the selected carrier's
native text representation. They do not continuously encode text to media bytes
and decode it again. Whether a later raw-media operation can represent the current
string is a separate boundary concern.

The text value contains no document-model `HardBreak` item or presentation-break
primitive. Line-feed, carriage-return, and other supported string content are
data. Formatting, links, Markdown interpretation, rendering, and embedded HTML
semantics remain application/interchange concerns.

Fine-grained insertion, deletion, replacement, protected fine-grained Origin,
text positions, and durable Range operations are available for allowlisted text.

Coedit collaboration metadata such as Origin, Range lineage, History, and carrier
state is not part of the raw `text/markdown` or `text/plain` media representation.
The portable `.coedit` representation preserves that document state separately.

## 5. Generic opaque payloads

Any valid Media Type whose normalized type/subtype is not in the fine-grained
allowlist initially uses generic opaque-content behavior. The document model
preserves the exact supplied Media Type, exact payload bytes, and payload-level
Origin but does not parse or interpret the bytes.

The generic opaque handler has no fine-grained mutation operations. A future
implementation can add a Media Type to the compile-time fine-grained allowlist
without relabelling existing documents. Such an extension requires an explicit
focused contract and qualification evidence.

## 6. Raw/coarse media representation boundary

Every payload has a whole-payload/coarse representation boundary. This is a
public engine capability, not only an internal import or codec helper. An
application can request the raw/coarse media representation of an InlineContent
against an explicit Version without receiving carrier state.

For an opaque payload, raw retrieval returns the exact stored byte sequence.

For an allowlisted text payload, raw/coarse input and output cross a byte boundary
through a Media-Type-aware processor:

- raw/coarse input validates the selected processor's supported representation
  profile and decodes the supplied bytes;
- raw/coarse output validates the selected processor's supported representation
  profile and encodes the current native string;
- ordinary fine-grained string operations and `.coedit` reopening do not perform
  this conversion;
- unsupported profiles, invalid bytes, or exact-encoding failures fail
  explicitly without partial publication; and
- the processor must not silently change content or the preserved Media Type.

Step 3 uses representative test codecs only to prove that this boundary is
independent of carrier selection. Those fixtures are not the production codec
selection and do not freeze a charset or parameter matrix.

Step 4 selects and qualifies the first production raw-media processor and its
supported representation profiles. The selected capability may be deliberately
small. Later processor support can expand without changing document semantics or
stored Media Type values.

The selected carrier can use its own binary encoding for replication and
persistence. Carrier bytes are not the raw media representation.

## 7. Payload creation and replacement identity

Each live InlineContent owns exactly one current payload value consisting of the
exact Media Type plus Media-Type-specific collaborative state. The payload has no
independent product identity.

Whole-payload replacement preserves the `InlineContentId` but atomically replaces
the complete payload value. Replacement can keep the existing Media Type or
provide a different one. Application-level format conversion is an adapter
concern; the document model does not define a second conversion operation.

Step 2 continues to use its typed opaque empty `InlineContentValue`. Step 3
qualifies candidate carriers. Step 4 evolves that opaque boundary into the
Media-Type-labelled payload representation without changing completed Step 2
structural ownership or ordering semantics.

## 8. Universal whole-payload replacement

Every InlineContent supports one logical whole-payload replacement operation.
Conceptually:

```text
replaceInlineContentPayload(inlineContentId, mediaType, replacement, origin)
```

The exact public command name and TypeScript shape remain implementation details.
Required behavior is:

1. replacement targets one existing InlineContent and preserves its identity;
2. replacement supplies the complete new payload and exact Media Type;
3. any raw-media interpretation needed by that operation occurs through the
   applicable processor boundary before publication;
4. capability dispatch after success follows the normalized type/subtype of the
   new Media Type;
5. the operation supplies or derives the Origin information required by the new
   payload;
6. Media Type, content, and required Origin effect publish atomically;
7. failure leaves the previous complete payload unchanged; and
8. replacement is a semantic payload update for Block liveness and History.

For an opaque payload, replacement is the only initial content mutation and the
current value has one payload-level Origin. For allowlisted text, replacement is
available in addition to fine-grained text operations.

## 9. Payload-specific operations

Payload-specific fine-grained operations fail explicitly when used with an
incompatible Media Type. Do not sniff payload contents or reinterpret arbitrary
bytes as collaborative text.

| Operation class                                          | `text/markdown` | `text/plain` | Other Media Types |
| -------------------------------------------------------- | --------------- | ------------ | ----------------- |
| Raw/coarse media retrieval and whole-payload replacement | yes             | yes          | yes               |
| Fine-grained text insertion/deletion/replacement         | yes             | yes          | no                |
| Fine-grained Origin                                      | yes             | yes          | no                |
| Text positions and durable text Range operations         | yes             | yes          | no                |

This table defines capability, not exact API surface.

## 10. Convergence of whole-payload replacement

All payloads are collaborative in the sense that replicas that eventually
receive the same complete set of valid Contributions must converge on the same
current payload state.

Fine-grained merging is not required for every Media Type. Concurrent
whole-payload replacements behave as a convergent replicated register:

- a causally later replacement supersedes replacements that it observes;
- concurrent replacements choose one current winner deterministically;
- the winner cannot depend on packet arrival order, local wall-clock time, or an
  unsynchronized local sequence;
- every conforming replica with the same valid causal input chooses the same
  winner; and
- losing concurrent replacements remain immutable Contributions and their
  Versions remain exactly materializable through History.

Gate B selects and records the observable deterministic winner rule and the
carrier-private representation or metadata that implements it. Carrier-native
conflict ordering is qualification evidence, not product policy by itself.

### 10.1 Deferred mixed-operation semantics

This contract does not yet choose the result of whole-payload replacement
concurrent with fine-grained text insertion, deletion, or replacement. This
includes same-type and cross-type replacement and edits authored against a
replacement that later loses the register conflict.

**Owner:** This document. **Decision gate:** Step 3 / Gate B, before production
carrier implementation in Step 4.

The selection must preserve atomic payload/Origin publication, deterministic
convergence, causal History recoverability, and the accepted replacement-register
rules above. Gate C separately closes Range-lineage consequences.

## 11. Origin and copy/restore behavior

Origin answers who or what created payload material. Contribution actor answers
who performed an operation in this document.

Allowlisted text has the fine-grained Origin behavior defined by
`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`.

Every Media Type under generic opaque handling has one Origin associated with the
current whole-payload creation or replacement. Moving an InlineContent preserves
its complete payload and applicable Origin. Copy and restore behavior follows the
focused attribution and History contracts.

## 12. Range and addressing boundary

The current durable Range service addresses authored text and positions inside
allowlisted fine-grained text payloads. It does not define sub-payload addressing
for generic opaque payloads.

A future Media Type that needs stable internal references can qualify for the
existing text Range contract or define a suitable content-local addressing
contract without turning Range into a universal binary locator.

## 13. Qualification and staged decisions

Step 3 must qualify both carrier candidates against the same payload contract. At
minimum prove:

- exact Media Type preservation with parsed type/subtype capability dispatch;
- `text/markdown` and `text/plain` use the same fine-grained operation surface;
- valid unfamiliar Media Types use opaque handling;
- representative test codecs prove the raw/coarse boundary is carrier-independent
  and fails explicitly for unsupported representation capability;
- ordinary Unicode/native-string collaboration works through both candidates and
  carrier-specific edge behavior is characterized rather than pre-decided here;
- representative opaque payloads preserve exact bytes and payload-level Origin;
- whole-payload replacement works for fine-grained and opaque payloads;
- concurrent replacement converges deterministically; and
- one transaction can span structure and several InlineContents with mixed
  capability classes.

Gate B closes carrier selection, the observable concurrent-replacement winner
rule and its private implementation, mixed replacement/edit semantics, and the
carrier text-domain behavior required by production.

Step 4 selects and qualifies the production raw-media processor and its supported
representation profiles. Tests belong to the selected capability: supported
profiles must work exactly, unsupported profiles must fail explicitly, and the
processor must not silently alter content or Media Type metadata.

Step 5 implements first-class Contributions and permanent exact Version
materialization, including losing replacement History. Step 6 / Gate C selects
and implements durable text Range lineage. Step 8 freezes portable encoding of
exact Media Type values, supported carrier-native collaborative text state,
collaboration metadata, and opaque bytes.

Accepted design requirements are not claims that these later stages have run.

## 14. Non-goals

This contract does not:

- define a generic structured-data CRDT;
- infer fine-grained collaboration from every `text/*` Media Type;
- define fine-grained collaborative SVG, image, table, JSON, XML, or binary
  editing;
- invent a Coedit-specific payload Media Type;
- introduce a dynamic payload capability registry;
- define a separate Media Type conversion operation;
- select the production codec/library, charset set, flowed-text behavior,
  parameter-support matrix, or other raw-media profile details before Step 4;
- require the core collaborative layer to parse Markdown or other application
  syntax;
- guarantee behavior for every ECMAScript string edge case before Gate B records
  the selected carrier's supported domain; or
- require a renderer to treat a Block or InlineContent boundary as textual
  whitespace or a break.
