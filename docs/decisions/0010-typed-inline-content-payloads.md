# ADR-0010: Media-Type-labelled InlineContent payloads and universal replacement

**Status:** Accepted

**Decision date:** 2026-09-08

**Scope:** InlineContent payload semantics, Media Type discrimination,
whole-content replacement, payload convergence, and the boundary between
document structure and payload-specific behavior.

## 1. Authority and relationship to earlier decisions

This record preserves why the decision was made. Normative behavior belongs in:

- [`../PRODUCT_DOMAIN_MODEL.md`](../PRODUCT_DOMAIN_MODEL.md) for product meaning;
- [`../INLINE_CONTENT_PAYLOADS.md`](../INLINE_CONTENT_PAYLOADS.md) for Media Type
  discrimination, universal whole-content replacement, Origin granularity, and
  convergence;
- [`../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md)
  for Coedit collaborative-text formatting and fine-grained Origin;
- [`../RANGE_MODEL.md`](../RANGE_MODEL.md) for durable references inside Coedit
  collaborative text;
- [`../MVP_ARCHITECTURE.md`](../MVP_ARCHITECTURE.md) for the public engine
  boundary;
- [`../COLLABORATION_MODEL.md`](../COLLABORATION_MODEL.md) for later causal
  replication; and
- [`../../SCAFFOLDING_PLAN.md`](../../SCAFFOLDING_PLAN.md) for work order and
  gates.

ADR 0001 remains accepted for intrinsic collaborative-text formatting, protected
fine-grained text Origin, causal History, persistence, and the carrier
qualification direction. This ADR refines and supersedes the parts of ADR 0001
that treated attributed rich text and hard breaks as the universal shape of all
InlineContent content.

## 2. Context

The clean-slate documentation initially treated every InlineContent as owning one
`CollaborativeContent` value whose universal logical shape was text, hard-break
items, intrinsic formatting, and protected Origin.

That shape was sufficient for the first rich-text use case but made application
presentation semantics part of the document ontology. Carrier qualification then
made the assumption concrete by separating text insertion from a special
hard-break insertion operation and rejecting newline characters inside ordinary
text operations.

The intended product boundary is broader:

- a Block or InlineContent boundary is structural and does not itself mean a
  space, line break, paragraph break, list separator, or another character;
- the current application needs fine-grained collaborative text;
- future applications may need strongly structured textual or binary payloads,
  such as SVG, images, tabular data, JSON-derived structures, or other opaque
  application formats; and
- those future payloads do not need a general-purpose fine-grained CRDT merely
  to participate in a collaborative document.

A Coedit-specific `coedit-text | blob` enum would separate text from opaque data,
but it would also discard standard format information such as `image/png` or
`application/json`. Internet Media Types already provide an extensible namespace
for describing payload formats. The document model should use that standard
namespace and keep editing capability separate from format identity.

## 3. Decision

### 3.1 InlineContent owns one Media-Type-labelled collaborative payload

Each InlineContent owns exactly one payload and one Internet Media Type that
identifies its format.

The InlineContent owns document identity, Block ownership, ordering, tags,
History participation, and Media Type. The payload has no independent product
identity.

The document model does not interpret application meaning inside the payload
except where an accepted Media-Type-specific contract defines additional
operations. Media Type answers what format the data has; Coedit capability
selection answers what this implementation can do with that format.

### 3.2 Coedit collaborative text uses a vendor-tree Media Type

The initial fine-grained collaborative text format is identified by:

```text
application/vnd.coedit.text
```

This Media Type identifies the Coedit collaborative-text payload format. It
stores authored Unicode text, intrinsic formatting, and protected fine-grained
Origin.

The repository does not claim that `application/vnd.coedit.text` is already an
IANA-registered Media Type. Before it is frozen as a public interoperability
contract, registration or another explicit standards-compatible disposition must
be recorded.

The format has no document-level `HardBreak` item. Line-feed, carriage-return,
and other characters are text data. An application, editor, renderer, or
interchange adapter can decide whether to insert, reject, normalize, or present
those characters.

Block and InlineContent boundaries add no text character. Application structure
and `childrenPresentation` can influence rendering without mutating the payload.

Existing intrinsic-formatting and Origin decisions from ADR 0001 continue to
apply inside `application/vnd.coedit.text`.

### 3.3 Other Media Types use the generic opaque capability set initially

Any supported Media Type other than `application/vnd.coedit.text` initially uses
the generic opaque-content behavior. The document model preserves the exact Media
Type, bytes, and payload-level Origin but does not parse or interpret the bytes.

Examples include:

```text
image/png
image/svg+xml
application/json
application/pdf
application/octet-stream
```

Use the actual known Media Type when possible. `application/octet-stream` is the
generic fallback when the format is unknown or no more specific type is
available.

The generic opaque handler has no fine-grained MVP mutation. A future
Media-Type-specific contract can add finer operations or finer Origin granularity
without changing the stored Media Type merely because Coedit learned new
capabilities.

### 3.4 Whole-content replacement is universal

Every InlineContent supports one atomic, Media-Type-preserving whole-content
replacement operation with explicit Origin behavior.

The operation is available for `application/vnd.coedit.text` and for every opaque
Media Type. It is therefore not a blob-specific API. Fine-grained collaborative
text operations remain available when their merge behavior is desired.

Payload-specific operations fail explicitly against an incompatible Media Type.
They do not sniff bytes, reinterpret arbitrary payloads as Coedit text, or
silently change Media Type.

The current contract does not include in-place Media Type conversion. Such a
workflow requires a separate decision.

### 3.5 Whole-content replacement is eventually consistent

All payloads are collaborative in the convergence sense. Once authorized
replicas receive the same complete set of valid Contributions, they must converge
on the same current payload state.

Fine-grained merge is not required for every Media Type. Whole-content
replacement behaves as a convergent replicated register:

- a causally later replacement supersedes replacements that it observed;
- truly concurrent replacements select one deterministic current winner;
- the winner cannot depend on packet-arrival order, wall-clock time, or an
  unsynchronized local sequence;
- every conforming replica with the same valid causal input selects the same
  winner; and
- losing replacement Contributions and their Versions remain immutable and
  exactly materializable in History.

Gate B qualifies and records the carrier-private deterministic tie-break
mechanism. That tie-break is convergence machinery. It does not mean that the
winning replacement was semantically better or happened later in human time.

### 3.6 Origin granularity belongs to the Media-Type-specific contract

Origin remains distinct from Contribution actor.

`application/vnd.coedit.text` has fine-grained non-inheriting Origin for authored
text. Other Media Types initially have one payload-level Origin for the current
whole value. Copy, move, replacement, and restore apply Origin according to the
applicable payload contract while the Contribution separately records the actor
and derivation.

The document model does not require every future Media Type to mimic text
character granularity.

### 3.7 Durable Range remains a collaborative-text facility

The current durable Range service addresses spans and positions inside
`application/vnd.coedit.text`. It is not generalized into a universal binary or
structured-data locator.

An opaque InlineContent remains addressable by `InlineContentId`. A future Media
Type that needs stable internal addressing can define its own content-local
contract.

Whole-content replacement of `application/vnd.coedit.text` can interact with
retained Ranges. Step 6 already owns replacement and positional lineage behavior,
so this ADR does not choose the final representation or mapping prematurely.

## 4. Consequences

Positive consequences:

- the document ontology no longer equates all InlineContent with rich text;
- standard Media Types preserve real format information instead of collapsing
  everything non-text into a `blob` enum value;
- data-format identity remains separate from Coedit's current editing capability;
- presentation breaks and structural boundaries do not contaminate canonical
  payload semantics;
- the existing text carrier can remain highly collaborative without forcing the
  same machinery onto every other Media Type;
- `application/octet-stream` provides a standard fallback for unknown binary
  content;
- whole-content replacement gives every Media Type a simple collaborative
  baseline with deterministic convergence;
- Origin can remain meaningful without pretending every payload is a sequence of
  text items; and
- text Range work stays focused rather than turning into a premature universal
  content-addressing framework.

Costs and constraints:

- Media Type becomes part of the durable logical state and portable recovery;
- public/application adapters must inspect Media Type before using
  payload-specific operations;
- the Coedit collaborative-text Media Type needs a standards-compatible
  registration decision before it is frozen for public interoperability;
- carrier qualification must cover representative opaque Media Types and
  replacement-register convergence in addition to fine-grained text;
- Markdown can represent only the current collaborative-text subset unless a
  future Media-Type-specific convention is added; and
- whole-text replacement requires an explicit Step 6 Range-lineage rule before
  the Range representation is frozen.

## 5. Alternatives considered

### Keep a Coedit-specific `coedit-text | blob` discriminator

Rejected. It expresses current capabilities rather than the actual payload
format. A PNG, SVG, JSON document, PDF, and unknown binary value would all become
`blob`, discarding standard format identity and making future capability growth
harder to express without schema migration.

### Keep universal attributed rich text

Rejected. It makes the first application payload the ontology for every future
InlineContent and forces presentation concepts such as hard breaks into the
canonical document model.

### Allow newline characters but retain a separate hard-break item

Rejected as the generic contract. A renderer can interpret a line-feed as a
presentation break, but the document model does not need two separate semantic
representations for text that differ only because one application presents one
as a break.

An interchange adapter such as Markdown can still define how its own hard-break
syntax maps to canonical text characters.

### Infer text separators from Block or InlineContent boundaries

Rejected. Structural boundaries do not necessarily correspond to paragraph or
line boundaries. A single rendered paragraph can span several structural units,
and a non-text payload can occupy the same structure without any textual
separator semantics.

### Make opaque replacement a non-text-only operation

Rejected. Whole-content replacement is useful for text, import, restore, future
structured payloads, and application integrations. It is the common mutation
baseline, not a special case for binary data.

### Resolve concurrent replacements as an explicit multi-value conflict

Rejected for the initial contract. Retaining multiple current values would
require another document/application conflict state. A deterministic single
winner is simpler, remains eventually consistent, and does not destroy the
losing operation because immutable History preserves every Contribution and
Version.

### Use last-writer-wins wall-clock timestamps

Rejected. Unsynchronized clocks do not provide a trustworthy causal or semantic
ordering and can make replicas disagree or misrepresent chronology. The
replacement order must be derived from immutable replicated causal/effect state.

### Introduce a generic structured-data CRDT or dynamic capability registry now

Rejected by YAGNI. The MVP has one fine-grained Media Type and one generic opaque
capability set. Simple explicit Media Type checks are sufficient. A future
concrete payload can justify a new abstraction when its requirements are known.

### Generalize Range to arbitrary Media Types now

Rejected. Text Ranges have specific greedy, positional, split/merge, and lineage
semantics. Future structured content can require materially different addressing.
A universal locator would freeze an abstraction before those needs exist.

## 6. Compatibility and follow-up

This decision is a documentation and qualification correction before Gate B. It
does not require the already completed Step 2 structural domain to interpret
payload internals. Step 4 evolves the opaque Step 2 InlineContent value into the
Media-Type-labelled payload representation.

Step 3 must qualify `application/vnd.coedit.text`, representative opaque Media
Types including `application/octet-stream`, universal replacement, deterministic
concurrent replacement convergence, mixed-Media-Type atomicity, and the existing
collaborative-text suite against both carrier candidates. Gate B records the
carrier winner and the private deterministic replacement tie-break.

Step 6 remains responsible for the exact whole-text replacement effect on durable
Range lineage. Step 8 freezes Media Type values and opaque payload bytes into the
portable format only after Gates B and C pass.

Future Media-Type-specific fine-grained editing, in-place Media Type conversion,
Media Type parameter rules, and non-text content-local addressing require
separate explicit decisions when real application requirements exist.
