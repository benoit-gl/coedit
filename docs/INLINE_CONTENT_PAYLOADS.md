# InlineContent payload contract

**Status:** Accepted logical content direction; mixed replacement/edit semantics
and carrier selection remain Gate B decisions. Production payload behavior is
not implemented in the completed Step 2 structural domain.

## 1. Purpose and authority

This document defines the payload owned by an `InlineContent`, the Internet Media
Type used to label that payload, the initial fine-grained media-type allowlist,
the byte-oriented whole-payload boundary, and convergence requirements for
whole-payload replacement.

[`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) controls product ontology.
[`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) owns
fine-grained text and Origin behavior. [`RANGE_MODEL.md`](RANGE_MODEL.md)
owns durable references inside fine-grained text. [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md)
owns the public engine boundary. [`CAPACITY_AND_PERFORMANCE_TARGETS.md`](CAPACITY_AND_PERFORMANCE_TARGETS.md)
owns cross-cutting capacity classification. [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md)
owns the later network protocol and causal History model.

This document controls Media Type preservation and capability dispatch, generic
replacement behavior, coarse/raw payload materialization, and payload-level
carrier/resource behavior when summaries elsewhere are insufficient.

## 2. Separation of concerns

An `InlineContent` is a durable document entity that owns one collaborative
payload and one Internet Media Type that describes the payload format. The
document model owns `InlineContent` identity, ownership, ordering, tags, History
participation, and the supplied Media Type value.

The Media Type answers **what format the media representation has**. Coedit's
compile-time allowlist answers **which formats receive fine-grained text
operations in this implementation**. These concerns are distinct. Learning a
finer editing model for an existing Media Type must not require changing stored
documents or inventing a Coedit-specific format name.

Block and InlineContent boundaries imply no character, space, line break,
paragraph break, or other textual separator. The application projects structure
into presentation. `childrenPresentation`, lenses, renderers, editors, and
interchange adapters decide whether structural boundaries produce visible
separation or another presentation effect.

The initial document model does not provide a general-purpose structured-data
CRDT or a dynamic payload plugin framework.

## 3. Media Type preservation and dispatch

InlineContent uses an Internet Media Type value as its durable payload-format
discriminator. Media Type syntax follows the IETF/IANA media-type model rather
than a Coedit-specific payload-kind enum.

The complete supplied Media Type value, including parameters, is durable metadata
and is preserved exactly through ordinary storage, reload, copy, History, and
portable serialization. The generic document model does not remove, reorder,
rewrite, lowercase, or otherwise normalize the stored value merely because it
recognizes the type.

Capability matching is separate from preservation. The implementation parses a
valid Media Type and compares its case-normalized `type/subtype` identity against
one compile-time allowlist. Parameters do not participate in this capability
lookup. Do not use raw string-prefix matching.

The initial fine-grained allowlist contains exactly:

```text
text/markdown
text/plain
```

For example, each of these has the `text/markdown` capability identity even
though the stored Media Type values differ:

```text
text/markdown; charset=UTF-8
Text/Markdown; charset="utf-8"
text/markdown; charset=UTF-8; variant=CommonMark
```

Values such as `text/markdown-extra` and `text/markdown+json` do not match.

Every other valid Media Type initially uses the generic opaque capability set,
including other `text/*` types and character-oriented `application/*` types. The
allowlist is deliberately explicit. Coedit does not infer capability from the
payload bytes, top-level type, file extension, renderer availability, or a live
registry lookup.

The allowlist is one compile-time source of truth. Adding another fine-grained
format later is an explicit contract change supported by prototype evidence. Do
not scatter media-type checks through unrelated subsystems or introduce a dynamic
capability registry before a real requirement exists.

### 3.1 Syntax, recognition, and capability are separate

Validate Media Type syntax at creation, replacement, and decoding boundaries. A
Media Type identifies a concrete `type/subtype`, with parameters when present;
an absent subtype such as `image/` is malformed. An HTTP media range such as
`image/*` is not a concrete payload Media Type.

A syntactically valid type that is not in the fine-grained allowlist is not
malformed or unsupported as document content. It uses the generic opaque handler:
preserve its exact Media Type, bytes, and payload-level Origin. This does not
claim that every syntactically valid name is IANA-registered, or that opaque bytes
conform to the labelled format.

| Condition | Required behavior |
| --- | --- |
| Malformed Media Type syntax | Reject atomically as invalid input. |
| Valid Media Type not in the fine-grained allowlist | Accept through generic opaque handling, subject to ordinary envelope and resource checks. |
| Known opaque format, such as `image/png`, without a renderer | Preserve it; lack of rendering capability is not document invalidity. |
| Invalid byte representation for a fine-grained type at a raw/coarse decode boundary | Fail explicitly; do not reinterpret it as opaque content. |
| Fine-grained text that cannot be represented exactly by the declared encoding at a raw/coarse encode boundary | Fail explicitly; do not substitute characters or rewrite the Media Type. |
| Unsupported carrier or container schema | Report incompatibility; this is not an unknown Media Type. |
| Exceeded selected implementation guard | Report capacity/resource failure without partial publication. |

The generic opaque handler does not decode PNG, JSON, XML, or other labelled
bytes to certify their format. A consumer that renders, executes, or otherwise
interprets those bytes owns its format validation and security policy. Media Type
recognition alone grants no permission to activate content.

The standards basis is [RFC 6838, sections 3 and 4](https://www.rfc-editor.org/rfc/rfc6838.html)
for media-type registration and naming, and [RFC 9110, section 8.3.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.3.1)
for Media Type syntax and case-insensitive type/subtype identity. A registration
decision and a syntax check answer different questions.

## 4. Fine-grained text payloads

A payload whose normalized type/subtype is in the compile-time allowlist uses the
fine-grained text capability set. The initial formats are `text/markdown` and
`text/plain`.

The collaborative logical text value is a native ECMAScript string. Fine-grained
APIs exchange native strings and operate on the selected carrier's native text
representation. They do not continuously encode text to media-representation
bytes and decode it again.

The text value does not contain a document-model `HardBreak` item or another
presentation-break primitive. Line-feed, carriage-return, and other characters
are text data. An application or adapter can accept, reject, insert, normalize,
or interpret those characters according to its own command or interchange
contract without changing document validity merely because a character is a
presentation break in one renderer.

Fine-grained insertion, deletion, replacement, protected fine-grained Origin, text positions, and durable Range operations are available for allowlisted text. Media-type-specific source
semantics remain application concerns. For example, a Markdown URL is Markdown
source; an application decides whether it denotes an external URL, a local Coedit
reference, or something else.

Coedit collaboration metadata such as Origin, Range lineage, History, and carrier state is not part of the raw `text/markdown` or `text/plain` byte stream.
The portable `.coedit` representation preserves that document state separately.
Raw/coarse media retrieval materializes the current media content, not the
complete `.coedit` collaboration envelope.

### 4.1 Initial text formats and parameters

`text/markdown` is registered by RFC 7763. Its `charset` parameter is required;
its optional `variant` parameter and any variant-defined parameters are preserved
as supplied. Coedit's generic collaborative text layer does not parse Markdown or
interpret `variant` to decide collaboration capability.

`text/plain` supports the `charset` parameter. When `charset` is absent, its
registered default remains US-ASCII under RFC 6657. Other registered parameters,
such as `format` and `delsp` from RFC 3676, are preserved as supplied. The generic
collaborative text layer does not interpret flowed-text semantics.

Parameter preservation and capability dispatch therefore remain simple:

- capability dispatch uses only normalized `type/subtype`;
- the complete Media Type string remains durable and retrievable; and
- a type-specific raw processor interprets only the parameters required to
  decode or encode the media representation when that byte boundary is used.

## 5. Generic opaque payloads

Any valid Media Type whose normalized type/subtype is not in the fine-grained
allowlist initially uses generic opaque-content behavior. The document model
preserves the exact supplied Media Type, exact payload bytes, and payload-level
Origin but does not parse or interpret the bytes.

The generic opaque handler has no fine-grained mutation operations. Applications
can use it for images, SVG/XML, JSON, tabular or application-specific encodings,
PDF, compressed data, other `text/*` formats, or other structured/binary formats
whose internal semantics are outside the current document model.

A future implementation can add a Media Type to the compile-time fine-grained
allowlist without relabelling existing documents. Such an extension requires an
explicit focused contract and qualification evidence.

## 6. Raw/coarse media representation boundary

Every payload has a whole-payload/coarse representation boundary. The exact
public TypeScript names remain implementation details until the public API is
specified.

For an opaque payload, the current media representation is the exact stored byte
sequence. Raw retrieval returns those bytes unchanged.

For an allowlisted text payload, the durable collaborative value is the native
string. Raw/coarse input and output cross a byte boundary through a
Media-Type-aware text processor:

- raw/coarse input decodes supplied representation bytes according to the full
  declared Media Type and stores the resulting native string;
- raw/coarse output encodes the current native string according to the preserved
  Media Type and returns the resulting media-representation bytes;
- encoding or decoding is not performed for ordinary fine-grained string
  operations;
- the operation must fail explicitly when the declared encoding is unsupported,
  input bytes are invalid for it, or the current string cannot be represented
  exactly;
- the processor must not silently replace unrepresentable characters, change the
  declared charset, rewrite the Media Type, or fall back to another encoding;
- failure publishes no partial document change; and
- media-type representation rules can be implemented by the processor without
  changing the collaborative logical string.

For example, `text/plain` without a `charset` parameter has an effective
US-ASCII encoding. Fine-grained collaboration can still insert a character that
US-ASCII cannot represent. The collaborative state remains valid, but a later raw
materialization under that unchanged Media Type fails explicitly until the
content or Media Type is changed by an explicit operation.

The selected carrier can use its own binary encoding for replication and
persistence. Carrier bytes are not the raw media representation and are not
labelled `text/markdown` or `text/plain` merely because they contain collaborative
state for those payloads.

Gate B qualifies the processor boundary and records the initial supported charset
mechanism. Any finite supported-charset set or resource guard is an implementation
capability/guard, not permission to mutate a stored Media Type silently.

## 7. Payload creation and replacement identity

Each live InlineContent owns exactly one current payload value consisting of the
exact Media Type plus Media-Type-specific collaborative state. The payload has no
independent product identity.

Whole-payload replacement preserves the `InlineContentId` but atomically replaces
the complete payload value. Replacement can keep the existing Media Type or
provide a different one. Application-level format conversion is an adapter
concern; the document model does not define a second conversion operation.

Step 2 can continue to use its typed opaque empty `InlineContentValue` while
content internals are intentionally unavailable. Step 4 introduces the final
Media-Type-labelled payload representation without changing Step 2 structural
ownership rules. The ordinary initial authored-text path uses Markdown with a
complete declared encoding, initially `text/markdown; charset=UTF-8`.

## 8. Universal whole-payload replacement

Every InlineContent supports one logical whole-payload replacement operation.
Conceptually:

```text
replaceInlineContentPayload(inlineContentId, mediaType, replacement, origin)
```

The exact public command name and TypeScript shape are implementation details.
The required behavior is:

1. replacement targets one existing InlineContent and preserves its identity;
2. replacement supplies the complete new payload: exact Media Type plus a valid
   media representation for the applicable raw/coarse boundary;
3. a fine-grained allowlisted text replacement decodes the supplied bytes to the
   native collaborative string before publication;
4. capability dispatch after success follows the normalized type/subtype of the
   new Media Type;
5. the operation supplies or derives Origin information required by the new
   payload at the trusted engine/import boundary;
6. Media Type, content, and required Origin effect publish atomically;
7. failure leaves the previous complete payload unchanged; and
8. replacement is a semantic payload update for Block liveness and History.

For an opaque payload, replacement is the only initial content mutation and the
current value has one payload-level Origin.

For an allowlisted text payload, whole-payload replacement is available in
addition to fine-grained text operations. An ordinary authored replacement can
attribute the new replacement material to the supplied Origin. Validated internal
copy, restore, or import paths can preserve pre-existing fine-grained Origins when
their focused contract requires it. The engine must not expose a client Origin
spoofing path merely because whole-payload replacement exists.

## 9. Payload-specific operations

Payload-specific fine-grained operations must fail explicitly when used with an
incompatible Media Type. Do not sniff payload contents or reinterpret arbitrary
bytes as collaborative text. A Media Type changes only when an explicit
whole-payload replacement supplies the new type and matching content.

The initial capability classes are:

| Operation class | `text/markdown` | `text/plain` | Other Media Types |
| --- | --- | --- | --- |
| Raw/coarse media retrieval and whole-payload replacement | yes | yes | yes |
| Fine-grained text insertion/deletion/replacement | yes | yes | no |
| Fine-grained Origin | yes | yes | no |
| Text positions and durable text Range operations | yes | yes | no |

This table defines capability, not exact API surface. Implementation code must
route the fine-grained decision through the one compile-time allowlist. Do not
introduce a generic replicated object model or dynamic plugin-dispatched mutation
system until a concrete additional payload type requires it.

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

The exact carrier-private tie-break representation is selected during carrier
qualification. It must be stable and deterministic and must not become a
presentation claim that the winning replacement was semantically better or
chronologically later.

A future application can add explicit conflict presentation if needed without
changing this convergence requirement.

### 10.1 Deferred mixed-operation semantics

This contract does not yet choose the result of whole-payload replacement
concurrent with fine-grained text insertion, deletion, or replacement. This
includes replacement between allowlisted text types, replacement between
fine-grained and opaque types, and edits authored against a replacement that
later loses the register conflict.

**Owner:** This document. **Decision gate:** Step 3 / Gate B, before production
carrier implementation in Step 4. Qualification must compare the candidates,
record the selected observable behavior and its rationale, and add regression
cases before this decision is treated as closed. Carrier defaults are evidence,
not an implicit product decision.

The selection must preserve atomic payload/Origin publication, deterministic
convergence, causal History recoverability, and the accepted replacement-register
rules above. Validity must be evaluated in the operation's causal context, not
only against the Media Type visible when a packet happens to arrive. No winner,
operation ordering, or mixed-operation merge policy is selected here.

Gate C separately closes the Range-lineage consequences of the selected behavior.
Transport, authorization, and replicated restore overlap remain subject to the
pre-network gate in `COLLABORATION_MODEL.md`.

## 11. Origin and copy/restore behavior

Origin answers who or what created payload material. Contribution actor answers
who performed an operation in this document.

Allowlisted text has the fine-grained Origin behavior defined by
`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`.

Every Media Type under the opaque handler has one Origin associated with the
current whole-payload creation or replacement. Replacing the payload creates the
new Origin required by the operation context. A replacement that changes Media
Type applies the Origin rules of the new Media Type.

Moving the InlineContent preserves its complete payload, including the exact Media
Type and applicable text or bytes plus Origin. Same-document entity copy and
historical restore preserve source Origin when their operation contract treats
the activity as placement/recovery rather than new authorship; their new
Contribution records the acting Contributor and derivation separately.

A later Media-Type-specific contract can define different Origin granularity.

## 12. Range and addressing boundary

The current durable Range service addresses authored text and positions inside
allowlisted fine-grained text payloads. It does not define sub-payload addressing
for generic opaque payloads.

An opaque InlineContent remains addressable by its normal document identity. A
future Media Type that needs stable internal references can first qualify for the
existing text Range contract or define a suitable content-local addressing
contract without turning the current Range into a universal binary or
structured-data locator.

## 13. Qualification, capacity, and verification

Step 3 must qualify both carrier candidates against the same payload contract. At
minimum prove:

- `text/markdown` and `text/plain` use the same compile-time fine-grained
  allowlist path for editing, Origin, cursor, and Range feasibility;
- capability matching uses parsed case-insensitive type/subtype identity and does
  not use raw string-prefix matching;
- parameters do not change capability matching and the exact supplied Media Type,
  including parameter spelling/order/value syntax, survives reload;
- Markdown `charset` requirements and plain-text default/declared charset behavior
  are handled at the raw processor boundary rather than during fine-grained edits;
- fine-grained APIs exchange native strings without continuous media-byte
  encoding/decoding;
- raw/coarse decode succeeds for supported valid representations and fails
  atomically for invalid or unsupported encodings;
- raw/coarse encode returns an exact representation under the unchanged declared
  Media Type or fails explicitly when the current string is not representable;
- encoding failure never substitutes characters or silently rewrites `charset` or
  another Media Type parameter;
- carrier qualification covers Unicode edge cases, including behavior around
  surrogate pairs and ill-formed native strings, so raw encoding cannot silently
  lose information;
- exact preservation of text characters without a special hard-break item;
- representative opaque Media Types preserve their exact Media Type, bytes, and
  payload-level Origin;
- `application/octet-stream` works as the generic unknown-binary case;
- valid unfamiliar Media Types use opaque handling without a registry lookup;
- malformed Media Type syntax fails atomically, separately from unsupported
  schemas, unavailable renderers, encoding failures, and capacity failures;
- whole-payload replacement works for both fine-grained text types and opaque
  payloads;
- replacement preserves InlineContent identity while allowing Media Type to stay
  the same or change;
- Media Type, content, and the required Origin effect change atomically;
- capability dispatch after replacement follows the new normalized type/subtype;
- deterministic convergence of concurrent whole-payload replacements under
  duplicate, delayed, reordered, partitioned, and reconnected delivery;
- causal later replacement superseding observed replacements;
- both concurrent replacement effects remain distinct and recoverable by the
  qualification harness even though one value wins current materialization;
- payload-specific operations reject an incompatible Media Type; and
- one transaction can span Block structure and several InlineContents with mixed
  fine-grained and opaque Media Types.

Gate B must first close section 10.1 with same-type and cross-type replacement
versus insertion, deletion, and replacement cases, including edits to a losing
replacement. Exercise both delivery orders, duplication, reload, and causal
recoverability. Record the policy before asserting its expected outcomes.

Step 3 can use carrier-level causal/effect surrogates for History because
first-class Contributions and permanent Version materialization are implemented
in Step 5. Step 5 and later regression suites must then prove the complete product
invariant: losing replacement Contributions remain immutable and their Versions
remain exactly materializable.

**Maturity:** Pending selection for carrier/payload resource guards and the initial
raw text-encoding mechanism; shared performance workloads remain experimental
under `MVP_VERIFICATION_PLAN.md`.

**Owner:** This document for payload/carrier replacement, raw/coarse media
materialization, and opaque-payload resource guards;
`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` separately owns private text-clipboard
guards.

**Promotion gate:** Step 3 carrier qualification / Gate B.

Step 3 profiles text size, representative opaque payload sizes, replacement
allocation/copy behavior, carrier encoding, raw text encode/decode allocation,
and mixed-Media-Type atomic work. Record and test any finite implementation
guards that the selected carrier or encoder needs at these boundaries. No numeric
text or opaque-payload maximum is accepted in advance. Exceeding a selected
implementation guard returns a capacity/resource failure and publishes no partial
replacement; it does not make the payload semantically invalid.

Step 4 retains these cases as production regression tests for the selected
carrier.

### 13.1 Implementation status and decision ownership

| Stage | Status or responsibility |
| --- | --- |
| Completed Steps 1-2 | Browser scaffold and pure structural domain; `InlineContentValue` remains an opaque empty value. No Media Type dispatch or replacement carrier is implemented. |
| Step 3 / Gate B | Qualify carriers; select the replacement tie-break, mixed replacement/edit semantics, raw text-encoding mechanism, Media Type boundary rules, and required resource guards. |
| Step 4 | Implement the selected payload, compile-time allowlist, raw/coarse processor boundary, and carrier behavior. |
| Step 5 | Implement first-class Contributions and permanent exact Version materialization, including losing replacement History. |
| Step 6 / Gate C | Select and implement durable text Range lineage and remaining Range behavior. |
| Step 8 | Freeze portable encoding of exact Media Type values, fine-grained text state, collaboration metadata, and opaque bytes. |
| Pre-network gate | Qualify causal transport, authorization, and replicated restore overlap before network collaboration ships. |

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
- require the core collaborative layer to parse Markdown, flowed text, or other
  application syntax;
- promise that every valid fine-grained text value is representable by every
  preserved declared charset; or
- require a renderer to treat a Block or InlineContent boundary as textual
  whitespace or a break.
