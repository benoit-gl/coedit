# InlineContent payload contract

**Status:** Accepted logical content contract; carrier implementation is subject
to Gate B.

## 1. Purpose and authority

This document defines the content payload owned by an `InlineContent`, the
initial payload kinds, the mutation behavior common to every payload kind, and
the convergence requirement for whole-payload replacement.

[`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) controls product ontology.
[`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) owns
fine-grained behavior for the `coedit-text` payload. [`RANGE_MODEL.md`](RANGE_MODEL.md)
owns durable references inside `coedit-text`. [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md)
owns the public engine boundary. [`CAPACITY_AND_PERFORMANCE_TARGETS.md`](CAPACITY_AND_PERFORMANCE_TARGETS.md)
owns cross-cutting capacity classification. [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md)
owns the later network protocol and causal History model.

This document controls payload-kind meaning and payload-level carrier/resource behavior when summaries elsewhere are insufficient.

## 2. Separation of concerns

An `InlineContent` is a durable document entity that owns one typed collaborative
payload. The document model owns the `InlineContent` identity, ownership,
ordering, tags, History participation, and payload kind. It does not assign
application meaning to the payload bytes or text.

Block and InlineContent boundaries imply no character, space, line break,
paragraph break, or other textual separator. The application projects structure
into presentation. `childrenPresentation`, lenses, renderers, editors, and
interchange adapters decide whether structural boundaries produce visible
separation or another presentation effect.

A payload kind defines the operations that can interpret or modify its internal
content. The initial document model does not attempt to provide a general-purpose
structured-data CRDT.

## 3. Initial payload kinds

The initial closed payload-kind vocabulary is:

```text
coedit-text
blob
```

Exact carrier and portable encodings remain private until their implementation
gates freeze them.

### 3.1 `coedit-text`

`coedit-text` is the initial fine-grained collaborative text payload. It stores
text plus the intrinsic formatting and fine-grained Origin behavior defined by
`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`.

Its textual value does not contain a document-model `HardBreak` item or another
presentation-break primitive. Line-feed, carriage-return, and other characters
are text data. An application or adapter can accept, reject, insert, normalize,
or interpret those characters according to its own command or interchange
contract without changing document validity merely because a character is a
presentation break in one renderer.

Fine-grained text editing can merge concurrent edits according to the selected
collaborative carrier. Formatting and Range operations are available only where
the focused text contracts permit them.

### 3.2 `blob`

`blob` is an opaque binary payload. The document model preserves its bytes and
Origin information but does not parse or interpret them.

The initial `blob` payload has no payload-specific fine-grained mutation
operations. Applications can use it for binary or strongly structured content
whose internal semantics are outside the current document model, including
future images, SVG or other structured assets, tabular encodings, JSON-derived
formats, or application-specific data.

Choosing an application format, schema, media type, renderer, or structured
editor for blob bytes is outside this contract.

## 4. Payload kind and creation

Each live InlineContent has exactly one payload kind. The payload kind is stable
for that InlineContent lifetime under the current contract.

The current API does not need an operation that converts an existing
InlineContent from one payload kind to another. A future content-type conversion
workflow requires an explicit design decision rather than being hidden inside
ordinary replacement.

Step 2 can continue to use its typed opaque empty `InlineContentValue` while
content internals are intentionally unavailable. Step 4 introduces the final
typed payload representation without changing the Step 2 structural ownership
rules. The ordinary initial authored content path can continue to create empty
`coedit-text` content.

## 5. Universal whole-content replacement

Every payload kind supports one logical whole-content replacement operation.
Conceptually:

```text
replaceInlineContentContent(inlineContentId, replacement, origin)
```

The exact public command name and TypeScript shape are implementation details.
The required behavior is:

1. replacement targets one existing InlineContent;
2. replacement preserves that InlineContent's payload kind;
3. the replacement value must be valid for that payload kind at the consuming
   implementation boundary;
4. the operation supplies or derives explicit Origin information at the trusted
   engine/import boundary;
5. success publishes the complete replacement and its Origin effect atomically;
6. failure publishes none of the replacement; and
7. the replacement is a semantic payload update for Block liveness and History.

For `blob`, replacement is the only initial content mutation and the current blob
value has one payload-level Origin.

For `coedit-text`, whole-content replacement is available in addition to
fine-grained text operations. An ordinary authored replacement can attribute the
new replacement material to the supplied Origin. Validated internal copy,
restore, or import paths can preserve pre-existing fine-grained Origins when
their focused contract requires it. The engine must not expose a client Origin
spoofing path merely because whole-content replacement exists.

## 6. Payload-specific operations

Payload-specific operations must fail explicitly when used with an incompatible
payload kind. Do not silently reinterpret bytes as text or coerce one payload
kind into another.

The initial operation availability is:

| Operation class | `coedit-text` | `blob` |
| --- | --- | --- |
| Whole-content replacement | yes | yes |
| Fine-grained text insertion/deletion/replacement | yes | no |
| Intrinsic formatting | yes | no |
| Text positions and durable text Range operations | yes | no |

This table defines capability, not exact API surface. The implementation can use
simple explicit payload-kind validation. Do not introduce a generic capability
registry, generic replicated object model, or plugin-dispatched mutation system
until a concrete additional payload type requires it.

## 7. Convergence of whole-content replacement

All payload kinds are collaborative in the sense that replicas that eventually
receive the same complete set of valid Contributions must converge on the same
current payload state.

Fine-grained merging is not required for every payload kind. Concurrent
whole-content replacements behave as a convergent replicated register:

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

## 8. Origin and copy/restore behavior

Origin answers who or what created payload material. Contribution actor answers
who performed an operation in this document.

For `coedit-text`, fine-grained Origin is defined by
`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`.

For `blob`, the current payload value has one Origin associated with the
whole-value creation or replacement. Replacing a blob creates the new Origin
required by the operation context. Moving the InlineContent preserves the blob
and Origin. Same-document entity copy and historical restore preserve source
Origin when their operation contract treats the activity as placement/recovery
rather than new authorship; their new Contribution records the acting
Contributor and derivation separately.

A later structured payload can define finer Origin granularity only through an
explicit payload-type contract.

## 9. Range and addressing boundary

The current durable Range service addresses authored text and positions inside a
`coedit-text` payload. It does not define sub-payload addressing for `blob`.

A Blob InlineContent remains addressable by its normal document identity. A
future payload kind that needs stable internal references can define a suitable
content-local addressing contract without turning the current text Range into a
universal binary or structured-data locator.

## 10. Qualification, capacity, and verification

Step 3 must qualify both carrier candidates against the same payload contract.
At minimum prove:

- `coedit-text` fine-grained editing, formatting, Origin, cursor, and Range
  feasibility from the focused text contracts;
- exact preservation of text characters without a special hard-break item;
- `blob` byte preservation and payload-level Origin;
- whole-content replacement for both payload kinds;
- atomic failure of invalid replacement;
- deterministic convergence of concurrent whole-content replacements under
  duplicate, delayed, reordered, partitioned, and reconnected delivery;
- causal later replacement superseding observed replacements;
- both concurrent replacement effects remain distinct and recoverable by the
  qualification harness even though one value wins current materialization;
- payload-specific operations rejecting an incompatible payload kind; and
- one transaction spanning Block structure and several InlineContents without
  requiring every InlineContent to use the same payload kind.

Step 3 can use carrier-level causal/effect surrogates for History because first-class
Contributions and permanent Version materialization are implemented in Step 5.
Step 5 and later regression suites must then prove the complete product invariant:
losing replacement Contributions remain immutable and their Versions remain
exactly materializable.

**Maturity:** Pending selection for carrier/payload resource guards; shared
performance workloads remain experimental under `MVP_VERIFICATION_PLAN.md`.

**Owner:** This document for payload/carrier replacement and blob resource guards;
`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` separately owns private text-clipboard guards.

**Promotion gate:** Step 3 carrier qualification / Gate B.

Step 3 profiles text size, blob bytes, replacement allocation/copy behavior,
carrier encoding, decoded allocation, and mixed-payload atomic work. Record and
test any finite implementation guards that the selected carrier needs at these
boundaries. No numeric text or blob maximum is accepted in advance. Exceeding a
selected implementation guard returns a capacity/resource failure and publishes
no partial replacement; it does not make the payload semantically invalid.

Step 4 retains these cases as production regression tests for the selected
carrier.

## 11. Non-goals

This contract does not:

- define a generic structured-data CRDT;
- define fine-grained collaborative SVG, image, table, JSON, or binary editing;
- define a media-type registry or application schema system;
- define payload-kind conversion;
- generalize the current text Range service to arbitrary payloads; or
- require a renderer to treat a Block or InlineContent boundary as textual
  whitespace or a break.
