# InlineContent payload contract

**Status:** Accepted logical content direction; mixed replacement/edit semantics
and carrier selection remain Gate B decisions. Production payload behavior is
not implemented in the completed Step 2 structural domain.

## 1. Purpose and authority

This document defines the content payload owned by an `InlineContent`, the Media
Type discriminator used for that payload, the mutation behavior common to every
payload, and the convergence requirement for whole-payload replacement.

[`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) controls product ontology.
[`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) owns
fine-grained behavior for the Coedit collaborative-text media type.
[`RANGE_MODEL.md`](RANGE_MODEL.md) owns durable references inside that text
payload. [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) owns the public engine
boundary. [`CAPACITY_AND_PERFORMANCE_TARGETS.md`](CAPACITY_AND_PERFORMANCE_TARGETS.md)
owns cross-cutting capacity classification. [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md)
owns the later network protocol and causal History model.

This document controls payload Media Type meaning, generic replacement behavior,
and payload-level carrier/resource behavior when summaries elsewhere are
insufficient.

## 2. Separation of concerns

An `InlineContent` is a durable document entity that owns one collaborative
payload and one Media Type that describes the payload format. The document model
owns the `InlineContent` identity, ownership, ordering, tags, History
participation, and Media Type. It does not assign application meaning to the
payload bytes or text beyond the capabilities explicitly defined for a Media
Type.

Block and InlineContent boundaries imply no character, space, line break,
paragraph break, or other textual separator. The application projects structure
into presentation. `childrenPresentation`, lenses, renderers, editors, and
interchange adapters decide whether structural boundaries produce visible
separation or another presentation effect.

Media Type answers **what format the payload has**. Coedit capability dispatch
answers **which operations this implementation supports for that format**. These
concerns are distinct. Learning a finer editing model for an existing Media Type
must not require changing the stored Media Type.

The initial document model does not attempt to provide a general-purpose
structured-data CRDT or a dynamic payload plugin framework.

## 3. Media Type discriminator

InlineContent uses an Internet Media Type value as its durable payload-format
discriminator. Media Type syntax and registration follow the IETF/IANA media-type
model rather than a Coedit-specific payload-kind enum.

The initial fine-grained collaborative text format is identified by:

```text
application/vnd.coedit.text
```

This is the intended vendor-tree Media Type name for the Coedit collaborative
text format. The repository does not claim that this value is already registered
with IANA. Before the value is frozen as a public interoperability contract,
registration or another explicit standards-compatible disposition must be
recorded.

All other valid Media Types initially use the generic opaque-content capability
set. Examples include:

```text
image/png
image/svg+xml
application/json
application/pdf
application/octet-stream
```

Use the actual known Media Type when available. Use
`application/octet-stream` only when the payload format is genuinely unknown or
no more specific type is available.

Capability selection is based on Media Type identity, not on sniffing payload
bytes. Type and subtype names are case-insensitive. Preserving the supplied
Media Type value does not require case-sensitive capability matching.

### 3.1 Syntax, recognition, and capability are separate

Validate Media Type syntax at creation, replacement, and decoding boundaries.
A Media Type identifies a concrete `type/subtype`, with parameters when present;
an absent subtype such as `image/` is malformed. An HTTP media range such as
`image/*` is not a concrete payload Media Type.

A syntactically valid type that Coedit does not recognize is not malformed.
It uses the generic opaque handler: preserve its Media Type, bytes, and
payload-level Origin. Recognition does not require a live IANA lookup or a
closed application allowlist. This does not claim that every syntactically valid
name is registered, or that opaque bytes conform to the labelled format.

| Condition                                                    | Required behavior                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Malformed Media Type syntax                                  | Reject atomically as invalid input.                                                       |
| Valid unfamiliar Media Type                                  | Accept through generic opaque handling, subject to ordinary envelope and resource checks. |
| Known opaque format, such as `image/png`, without a renderer | Preserve it; lack of rendering capability is not document invalidity.                     |
| Invalid Coedit collaborative-text state                      | Reject under the text contract; do not disguise it as opaque content.                     |
| Unsupported carrier or container schema                      | Report incompatibility; this is not an unknown Media Type.                                |
| Exceeded selected implementation guard                       | Report capacity/resource failure without partial publication.                             |

The generic handler does not decode PNG, JSON, or other labelled bytes to certify
their format. A consumer that renders, executes, or interprets those bytes owns
its format validation and security policy. Media Type recognition alone grants
no permission to activate content.

Gate B records the parser, parameter-handling and capability-matching rules used
by qualification before Step 4 implements them. Step 8 freezes their portable
textual encoding and compatibility rules. These details must preserve the
distinction above; they must not introduce a closed list of opaque formats.

The standards basis is [RFC 6838, sections 3 and 4](https://www.rfc-editor.org/rfc/rfc6838.html)
for names and registration, and [RFC 9110, section 8.3.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.3.1)
for Media Type syntax and case-insensitive type/subtype identity. A registration
decision and a syntax check answer different questions.

## 4. Coedit collaborative text media type

`application/vnd.coedit.text` is the initial fine-grained collaborative payload
format. It stores text plus the intrinsic formatting and fine-grained Origin
behavior defined by `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`.

Its textual value does not contain a document-model `HardBreak` item or another
presentation-break primitive. Line-feed, carriage-return, and other characters
are text data. An application or adapter can accept, reject, insert, normalize,
or interpret those characters according to its own command or interchange
contract without changing document validity merely because a character is a
presentation break in one renderer.

Fine-grained text editing can merge concurrent edits according to the selected
collaborative carrier. Formatting, text positions, and Range operations are
available only for this Media Type under the current contract.

## 5. Generic opaque payloads

Any supported Media Type other than `application/vnd.coedit.text` initially uses
the generic opaque-content behavior. The document model preserves the payload
bytes, Media Type, and payload-level Origin but does not parse or interpret the
bytes.

The generic opaque handler has no fine-grained mutation operations. Applications
can use it for images, SVG/XML, JSON, tabular or application-specific encodings,
PDF, compressed data, or other structured/binary formats whose internal semantics
are outside the current document model.

A future implementation can add payload-specific operations for an existing Media
Type without changing stored documents merely because the capability set became
richer. Such an extension requires an explicit focused contract.

## 6. Payload creation and replacement identity

Each live InlineContent owns exactly one current payload value consisting of a Media Type plus Media-Type-specific content. The payload has no independent product identity.

Whole-payload replacement preserves the `InlineContentId` but atomically replaces the complete payload value. The replacement can keep the existing Media Type or provide a different one. Application-level format conversion is an adapter concern; the document model does not define a second conversion operation.

Step 2 can continue to use its typed opaque empty `InlineContentValue` while
content internals are intentionally unavailable. Step 4 introduces the final
Media-Type-labelled payload representation without changing the Step 2 structural
ownership rules. The ordinary initial authored-text path can continue to create
empty `application/vnd.coedit.text` content.

## 7. Universal whole-payload replacement

Every InlineContent supports one logical whole-payload replacement operation.
Conceptually:

```text
replaceInlineContentPayload(inlineContentId, mediaType, replacement, origin)
```

The exact public command name and TypeScript shape are implementation details.
The required behavior is:

1. replacement targets one existing InlineContent and preserves its identity;
2. replacement supplies the complete new payload: Media Type plus Media-Type-specific content;
3. the replacement value must be valid at the consuming implementation boundary for the supplied Media Type;
4. capability dispatch after success follows the new Media Type;
5. the operation supplies or derives Origin information required by the new payload at the trusted engine/import boundary;
6. Media Type, content, and the required Origin effect publish atomically;
7. failure leaves the previous complete payload unchanged; and
8. the replacement is a semantic payload update for Block liveness and History.

For an opaque payload, replacement is the only initial content mutation and the
current value has one payload-level Origin.

For `application/vnd.coedit.text`, whole-payload replacement is available in
addition to fine-grained text operations. An ordinary authored replacement can
attribute the new replacement material to the supplied Origin. Validated internal
copy, restore, or import paths can preserve pre-existing fine-grained Origins when
their focused contract requires it. The engine must not expose a client Origin
spoofing path merely because whole-payload replacement exists.

## 8. Payload-specific operations

Payload-specific fine-grained operations must fail explicitly when used with an incompatible Media Type. Do not silently reinterpret arbitrary bytes as Coedit collaborative text or sniff payload contents to select capabilities. A Media Type changes only when an explicit whole-payload replacement supplies the new type and matching content.

The initial capability classes are:

| Operation class                                  | `application/vnd.coedit.text` | Other Media Types |
| ------------------------------------------------ | ----------------------------- | ----------------- |
| Whole-payload replacement                        | yes                           | yes               |
| Fine-grained text insertion/deletion/replacement | yes                           | no                |
| Intrinsic formatting                             | yes                           | no                |
| Text positions and durable text Range operations | yes                           | no                |

This table defines capability, not exact API surface. The implementation can use
simple explicit Media Type checks. Do not introduce a generic capability registry,
generic replicated object model, or plugin-dispatched mutation system until a
concrete additional fine-grained payload type requires it.

## 9. Convergence of whole-payload replacement

All payloads are collaborative in the sense that replicas that eventually receive
the same complete set of valid Contributions must converge on the same current
payload state.

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

### 9.1 Deferred mixed-operation semantics

This contract does not yet choose the result of whole-payload replacement
concurrent with fine-grained text insertion, deletion, or formatting. This
includes text-to-text replacement, replacement to a non-text Media Type, and
edits authored against a replacement that later loses the register conflict.

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

## 10. Origin and copy/restore behavior

Origin answers who or what created payload material. Contribution actor answers
who performed an operation in this document.

For `application/vnd.coedit.text`, fine-grained Origin is defined by
`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`.

For every other Media Type under the initial opaque handler, the current payload value has one Origin associated with the whole-payload creation or replacement. Replacing the payload creates the new Origin required by the operation context. A replacement that changes Media Type applies the Origin rules of the new Media Type.

Moving the InlineContent preserves its complete payload, including Media Type, bytes, and Origin. Same-document
entity copy and historical restore preserve source Origin when their operation
contract treats the activity as placement/recovery rather than new authorship;
their new Contribution records the acting Contributor and derivation separately.

A later Media-Type-specific contract can define finer Origin granularity.

## 11. Range and addressing boundary

The current durable Range service addresses authored text and positions inside an
`application/vnd.coedit.text` payload. It does not define sub-payload addressing
for generic opaque payloads.

An opaque InlineContent remains addressable by its normal document identity. A
future Media Type that needs stable internal references can define a suitable
content-local addressing contract without turning the current text Range into a
universal binary or structured-data locator.

## 12. Qualification, capacity, and verification

Step 3 must qualify both carrier candidates against the same payload contract. At
minimum prove:

- `application/vnd.coedit.text` fine-grained editing, formatting, Origin, cursor,
  and Range feasibility from the focused text contracts;
- exact preservation of text characters without a special hard-break item;
- representative opaque Media Types preserve their exact Media Type, bytes, and
  payload-level Origin;
- `application/octet-stream` works as the generic unknown-binary case;
- valid unfamiliar Media Types use opaque handling without a registry lookup;
- malformed Media Type syntax fails atomically, separately from unsupported
  schemas, unavailable renderers, and capacity failures;
- case variants and the selected parameter rules produce consistent capability
  matching and preserve the Media Type value through reload;
- whole-payload replacement works for collaborative text and opaque payloads;
- replacement preserves InlineContent identity while allowing Media Type to stay the same or change;
- Media Type, content, and the required Origin effect change atomically;
- capability dispatch after replacement follows the new Media Type;
- atomic failure of invalid replacement;
- deterministic convergence of concurrent whole-payload replacements under
  duplicate, delayed, reordered, partitioned, and reconnected delivery;
- causal later replacement superseding observed replacements;
- both concurrent replacement effects remain distinct and recoverable by the
  qualification harness even though one value wins current materialization;
- payload-specific operations reject an incompatible Media Type; and
- one transaction can span Block structure and several InlineContents with
  different Media Types.

Gate B must first close section 9.1 with same-type and cross-type replacement
versus insertion, deletion, and formatting cases, including edits to a losing
replacement. Exercise both delivery orders, duplication, reload, and causal
recoverability. Record the policy before asserting its expected outcomes.

Step 3 can use carrier-level causal/effect surrogates for History because
first-class Contributions and permanent Version materialization are implemented
in Step 5. Step 5 and later regression suites must then prove the complete product
invariant: losing replacement Contributions remain immutable and their Versions
remain exactly materializable.

**Maturity:** Pending selection for carrier/payload resource guards; shared
performance workloads remain experimental under `MVP_VERIFICATION_PLAN.md`.

**Owner:** This document for payload/carrier replacement and opaque-payload
resource guards; `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` separately owns private
text-clipboard guards.

**Promotion gate:** Step 3 carrier qualification / Gate B.

Step 3 profiles text size, representative opaque payload sizes, replacement
allocation/copy behavior, carrier encoding, decoded allocation, and mixed-Media
Type atomic work. Record and test any finite implementation guards that the
selected carrier needs at these boundaries. No numeric text or opaque-payload
maximum is accepted in advance. Exceeding a selected implementation guard returns
a capacity/resource failure and publishes no partial replacement; it does not
make the payload semantically invalid.

Step 4 retains these cases as production regression tests for the selected
carrier.

### 12.1 Implementation status and decision ownership

| Stage               | Status or responsibility                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completed Steps 1-2 | Browser scaffold and pure structural domain; `InlineContentValue` remains an opaque empty value. No Media Type dispatch or replacement carrier is implemented. |
| Step 3 / Gate B     | Qualify carriers; select the replacement tie-break, mixed replacement/edit semantics, Media Type boundary rules, and required resource guards.                 |
| Step 4              | Implement the selected payload and carrier behavior.                                                                                                           |
| Step 5              | Implement first-class Contributions and permanent exact Version materialization, including losing replacement History.                                         |
| Step 6 / Gate C     | Select and implement durable Range lineage and remaining Range behavior.                                                                                       |
| Step 8              | Freeze portable encoding and the standards-compatible disposition of the Coedit text Media Type before public interoperability.                                |
| Pre-network gate    | Qualify causal transport, authorization, and replicated restore overlap before network collaboration ships.                                                    |

Accepted design requirements are not claims that these later stages have run.

## 13. Non-goals

This contract does not:

- define a generic structured-data CRDT;
- define fine-grained collaborative SVG, image, table, JSON, or binary editing;
- invent a Coedit-specific payload-type registry when Media Types already provide
  the format namespace;
- define a separate Media Type conversion operation;
- generalize the current text Range service to arbitrary payloads; or
- require a renderer to treat a Block or InlineContent boundary as textual
  whitespace or a break.
