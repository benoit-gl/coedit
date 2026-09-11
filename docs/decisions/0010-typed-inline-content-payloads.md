# ADR-0010: Media-Type-labelled InlineContent payloads and universal replacement

**Status:** Accepted direction; carrier and mixed replacement/edit semantics deferred to Gate B; raw-media processor profiles deferred to Step 4

**Decision date:** 2026-09-08

**Amended:** 2026-09-11

**Scope:** InlineContent payload semantics, Media Type preservation and capability
dispatch, whole-payload replacement, payload convergence, and the boundary
between collaborative document state and raw media interpretation.

## 1. Authority and relationship to earlier decisions

This record preserves why the decision was made. Normative behavior belongs in:

- [`../PRODUCT_DOMAIN_MODEL.md`](../PRODUCT_DOMAIN_MODEL.md) for product meaning;
- [`../INLINE_CONTENT_PAYLOADS.md`](../INLINE_CONTENT_PAYLOADS.md) for Media Type
  preservation, fine-grained capability dispatch, raw/coarse separation,
  universal whole-payload replacement, Origin granularity, and convergence;
- [`../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md)
  for fine-grained text and Origin;
- [`../RANGE_MODEL.md`](../RANGE_MODEL.md) for durable references inside
  fine-grained text;
- [`../MVP_ARCHITECTURE.md`](../MVP_ARCHITECTURE.md) for the public engine
  boundary; and
- [`../../SCAFFOLDING_PLAN.md`](../../SCAFFOLDING_PLAN.md) for work order and
  gates.

ADR 0001 remains accepted for protected fine-grained Origin, causal History,
persistence, and carrier qualification. This ADR supersedes its engine-owned
rich-text formatting assumptions and the parts that treated rich text and hard
breaks as the universal shape of InlineContent content.

ADR 0004 is superseded where it defines links as intrinsic engine-owned formatting
marks, typed internal Block-link state, and link-specific fallback in canonical
content. Applications can still use the generic durable Range value defined by
ADR 0009 in links, comments, navigation metadata, or other holders. ADR 0009
remains accepted for Range behavior, as refined here to allowlisted fine-grained
text and application-owned holders. ADR 0005 remains accepted for semantic
interpretation boundaries, with its earlier link and formatting examples refined
by this ADR.

## 2. Context

The clean-slate documentation initially treated every InlineContent as rich text.
PR 19 generalized this into Media-Type-labelled payloads. Early review also began
to specify charset handling and other raw-media rules. That exposed a more useful
architectural distinction: the document engine should preserve format identity
and collaborative state without becoming the owner of every media-format input
and output rule.

The intended boundary is:

- each InlineContent keeps the actual Internet Media Type supplied for its media
  representation, including parameters;
- every payload supports coarse whole-payload replacement;
- only explicitly qualified formats receive fine-grained text collaboration;
- fine-grained text is maintained as a native ECMAScript string rather than
  continuously encoded media bytes;
- raw/coarse byte interpretation happens at a separate Media-Type-aware processor
  boundary; and
- processor support is an implementation capability, not a reason to rewrite a
  stored Media Type or reinterpret an allowlisted payload as opaque.

This gives the prototype a small boundary without making the document model a
MIME codec framework.

## 3. Decision

### 3.1 InlineContent preserves one complete Media Type

Each InlineContent owns exactly one payload and one syntactically valid Internet
Media Type that identifies its media representation. The complete supplied Media
Type value, including parameters, is durable metadata and is preserved exactly.

The document model parses the value for validation and capability dispatch, but
does not rewrite it merely because a type is recognized. Type/subtype comparison
is case-insensitive. Parameters remain part of the preserved value.

Generic Media Type syntax, Coedit collaboration capability, and support for a
specific raw representation are separate concerns. A valid unfamiliar Media Type
can use opaque handling without Coedit certifying its format-specific semantics.

### 3.2 Fine-grained text capability uses a compile-time allowlist

The initial fine-grained allowlist contains exactly:

```text
text/markdown
text/plain
```

Both entries deliberately exercise one shared text collaboration surface while
retaining distinct Media Type values. Capability dispatch compares the parsed,
case-normalized `type/subtype` identity to this one compile-time list. Parameters
do not participate in the lookup. Raw string-prefix matching is not used.

Every other valid Media Type initially uses generic opaque handling. It does not
need a decoder, renderer, registry lookup, or schema migration merely to be
preserved and replaced.

### 3.3 Fine-grained text uses carrier-native strings

For an allowlisted type, the collaborative logical value is exposed as a native
ECMAScript string plus Coedit collaboration metadata such as fine-grained Origin
and Range lineage. Coedit does not add a general Unicode normalization, repair,
or well-formedness subsystem around ordinary editing.

The exact lossless native-string domain is not frozen before carrier selection.
Step 3 qualifies candidate behavior, including ordinary Unicode text and
ill-formed ECMAScript string edge cases. Gate B records the supported carrier
behavior required by production. This ADR does not choose a second string
representation or validation layer in advance.

Fine-grained APIs operate directly on native strings and the selected carrier's
native text representation. Media byte encoding and decoding do not occur on
every edit.

### 3.4 Raw/coarse media processing is a separate boundary

Raw/coarse access remains byte-oriented. A Media-Type-aware processor converts
between the raw representation and canonical collaborative text when an operation
actually crosses that boundary.

Preserving a Media Type parameter does not imply that the first processor
implements every representation profile that parameter can define. Processor
support may depend on representation-affecting parameters as well as the base
Media Type.

If the selected processor does not support the required representation profile,
the raw/coarse operation fails explicitly. It must not silently ignore the
parameter, rewrite the Media Type, silently transcode, substitute content, or
fall back to opaque handling.

Step 3 uses representative test codecs only to prove that this boundary is
independent of carrier selection. Step 4 selects and qualifies the first
production raw-media processor and its supported representation profiles. The
codec/library, charset set, flowed-text behavior, parameter matrix, and other
profile-specific transformations are not selected by this ADR.

Reopening canonical collaborative state from `.coedit` is not a raw-media
boundary and does not rerun raw-format validation against the stored string.

For opaque types, the document model keeps the exact supplied bytes and raw
retrieval returns them unchanged.

### 3.5 Fine-grained text has no document-level hard-break or formatting model

Line-feed, carriage-return, and other supported native string content are text
data. Block and InlineContent boundaries add no character.

Formatting, Markdown parsing/rendering, links, and embedded HTML interpretation
are application or interchange concerns. For `text/markdown`, inline syntax
remains source text unless the application consumes recognized structural syntax
into the Block tree.

### 3.6 Whole-payload replacement is universal

Every InlineContent supports one atomic whole-payload replacement operation. The
operation preserves InlineContent identity and replaces the complete current
payload value: Media Type, content, and required Origin effect.

For opaque types, replacement stores bytes. For allowlisted text, any raw-media
interpretation required by a coarse operation occurs at the separate processor
boundary before publication. Fine-grained text operations remain available when
merge behavior is desired.

Payload-specific operations fail explicitly against an incompatible Media Type.
The document model does not sniff payload bytes or define an implicit Media Type
conversion operation.

### 3.7 Whole-payload replacement is eventually consistent

Whole-payload replacement behaves as a convergent replicated register:

- a causally later replacement supersedes replacements that it observed;
- concurrent replacements select one deterministic current winner;
- the winner cannot depend on packet-arrival order, wall-clock time, or an
  unsynchronized local sequence;
- every conforming replica with the same valid causal input selects the same
  winner; and
- losing replacement Contributions and their Versions remain immutable and
  exactly materializable in History.

Gate B records the observable winner rule and the carrier-private representation
or metadata used to implement it. Carrier-native conflict order is evidence, not
product policy by itself.

Replacement concurrent with fine-grained text editing is also deferred to Gate B.
Gate C separately closes the Range-lineage consequences of the selected behavior.

### 3.8 Origin and Range granularity follow the capability

Allowlisted text uses protected fine-grained Origin and the durable text Range
service. Opaque payloads initially use one payload-level Origin and have no
sub-payload Range semantics.

A future Media Type can join the existing fine-grained text contract or define a
different focused addressing contract after qualification. Stored media labels do
not need to change merely because Coedit learns a new operation set.

## 4. Consequences

Positive consequences:

- the document ontology no longer equates all InlineContent with rich text;
- actual Internet Media Types preserve format identity and supplied parameters;
- capability dispatch has one small compile-time source of truth;
- ordinary fine-grained edits stay in native string space;
- opaque content keeps exact stored bytes;
- raw-media interpretation has a separate capability boundary;
- universal replacement gives every Media Type a collaborative baseline; and
- Range work remains focused on fine-grained text.

Costs and open selections:

- carrier text-domain edge behavior must be characterized at Gate B rather than
  assumed in this ADR;
- a preserved Media Type can name a representation the selected processor does
  not support, so raw/coarse operations can fail;
- Step 4 must select and qualify production raw-media processor profiles; and
- adding another fine-grained Media Type is an explicit contract and
  qualification change rather than an automatic consequence of its top-level
  type.

## 5. Alternatives considered

### Use a Coedit-specific collaborative-text Media Type

Rejected. A private media type would make the label describe Coedit's current
capability rather than the actual content format.

### Treat every `text/*` Media Type as fine-grained

Deferred rather than adopted. The MIME top-level taxonomy does not guarantee the
local edit properties Coedit wants to qualify. The prototype uses an explicit
allowlist and expands it only with evidence.

### Start with only `text/markdown`

Rejected for the initial implementation. Requiring `text/plain` as well forces
the shared fine-grained text abstraction to handle more than one real Media Type
before that boundary hardens.

### Keep a separate `Text | Opaque` durable discriminator

Rejected. It creates a second persistent classification that can disagree with
the Media Type. The compile-time allowlist derives the current capability without
adding durable state.

### Match fine-grained types by string prefix

Rejected. Type/subtype matching is case-insensitive, parameters can be present,
and prefix matching would accept unrelated names.

### Normalize or discard recognized Media Type parameters

Rejected. Type-specific persistence exceptions would grow with every recognized
format. Preserve the supplied value and let the raw processor decide whether it
supports the representation profile when the byte boundary is used.

### Restrict every text edit to the current raw representation

Rejected. It would leak interchange representation rules into the collaborative
editing path. Raw byte materialization can report an explicit boundary failure
instead.

### Freeze the complete ECMAScript string domain before carrier selection

Rejected for this gate. JavaScript exposes the API value as a string, but the
carrier may impose practical lossless-domain constraints. Gate B must measure and
record those constraints before the production contract is tightened.

### Silently reinterpret unsupported raw profiles

Rejected. Ignoring parameters, relabelling, silently transcoding, or falling back
to opaque handling would make durable Media Type metadata unreliable.

### Keep universal attributed rich text

Rejected. It makes the first application payload the ontology for every future
InlineContent and forces presentation concepts into the generic content model.

### Use wall-clock timestamps to resolve replacement conflicts

Rejected. Unsynchronized clocks do not provide trustworthy causal ordering.

## 6. Gate ownership

- **Step 3 / Gate B:** qualify and select the carrier; record required carrier
  text-domain behavior, deterministic concurrent-replacement winner semantics,
  its private implementation, and mixed replacement/edit behavior. Use
  representative raw-media test codecs only to prove boundary independence.
- **Step 4:** implement the selected payload/carrier and select the first
  production raw-media processor with its supported representation profiles.
- **Step 5:** establish first-class History and permanent materialization of
  losing replacement Versions.
- **Step 6 / Gate C:** select durable Range representation and lineage behavior,
  including whole-payload replacement consequences.
- **Step 8:** freeze the physical `.coedit` representation after the earlier
  gates are closed.

The detailed raw-media profile matrix is intentionally not part of this ADR.
