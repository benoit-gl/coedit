# ADR-0010: Media-Type-labelled InlineContent payloads and universal replacement

**Status:** Accepted direction; carrier and mixed replacement/edit semantics deferred to Gate B; Media Type acceptance and raw-media processor profiles deferred to Step 4

**Decision date:** 2026-09-15

**Scope:** InlineContent payload semantics, Media Type preservation and capability
dispatch, whole-payload replacement, payload convergence, and the boundary
between collaborative document state and raw media interpretation.

## 1. Authority and relationship to earlier decisions

This record preserves why the decision was made. Normative behavior belongs in:

- [`../PRODUCT_DOMAIN_MODEL.md`](../PRODUCT_DOMAIN_MODEL.md) for product meaning;
- [`../INLINE_CONTENT_PAYLOADS.md`](../INLINE_CONTENT_PAYLOADS.md) for Media Type
  preservation, fine-grained capability dispatch, raw/coarse separation,
  universal whole-payload replacement, Origin granularity, and convergence;
- [`../FINE_GRAINED_TEXT_AND_ORIGIN.md`](../FINE_GRAINED_TEXT_AND_ORIGIN.md)
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

ADR 0006 remains accepted for editor-owned transient positions and carrier-neutral
position boundaries. This ADR narrows those text-position semantics to allowlisted
fine-grained text; opaque payloads have no sub-payload text-position contract.

ADR 0004 is superseded where it defines links as intrinsic engine-owned formatting
marks, typed internal Block-link state, and link-specific fallback in canonical
content. Applications can still use the generic durable Range value defined by
ADR 0009 in links, comments, navigation metadata, or other holders. ADR 0009
remains accepted for generic Range behavior and staged representation work, but
this ADR supersedes the parts that assign internal-link-specific resolution and
fallback semantics and internal-link encoding work to the Range service. The
Range service is narrowed to allowlisted fine-grained text, while holder storage,
activation, and fallback policy belong to applications. ADR 0005 remains accepted
for semantic interpretation boundaries, with its earlier link and formatting
examples refined by this ADR.

## 2. Context

The clean-slate documentation initially treated every InlineContent as rich text.
PR 19 generalized this into Media-Type-labelled payloads. Early review also began
to specify generic Media Type grammar, charset handling, and other raw-media
rules. That exposed a more useful
architectural distinction: the document engine should preserve format identity
and collaborative state without becoming the owner of every media-format input
and output rule.

The intended boundary is:

- each InlineContent keeps the accepted Internet Media Type value supplied for
  its media representation, including parameters;
- every payload supports coarse whole-payload replacement;
- only explicitly qualified formats receive fine-grained text collaboration;
- fine-grained text is maintained as a native ECMAScript string rather than
  continuously encoded media bytes;
- production Media Type acceptance is selected as a parser contract rather than
  frozen here from one standards grammar;
- raw/coarse byte interpretation happens at a separate Media-Type-aware processor
  boundary; and
- processor support is an implementation capability, not a reason to rewrite a
  stored Media Type or reinterpret an allowlisted payload as opaque.

This gives the prototype a small boundary without making the document model a
MIME codec framework.

## 3. Decision

### 3.1 InlineContent preserves one complete accepted Media Type value

Each InlineContent owns exactly one payload and one accepted Internet Media Type
value that identifies its media representation. The complete supplied Media Type
value, including parameters, is durable metadata and is preserved exactly.

The selected parser must accept the value and produce a usable `type/subtype`
identity for capability dispatch. The document model does not rewrite the supplied
value merely because a type is allowlisted. Type/subtype comparison for capability
dispatch is case-insensitive. Parameters remain part of the preserved value.

Media Type acceptance, Coedit collaboration capability, and support for a
specific raw representation are separate concerns. An accepted unfamiliar Media
Type value can use opaque handling without Coedit certifying its format-specific
semantics.

This ADR does not define a second Coedit-specific Media Type grammar and does not
require the production parser to reject every value outside one selected RFC
grammar. Step 4 selects and qualifies the parser and any additional acceptance
restrictions. Representative accepted and rejected values become compatibility
evidence so a parser upgrade cannot silently change the accepted input domain.

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

Every other accepted Media Type value initially uses generic opaque handling. It does not
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

Step 3 uses representative Media Type labels and test codecs only to prove
capability dispatch and raw-media boundary independence from carrier selection.
It does not select the production Media Type parser or accepted-input domain.
Step 4 selects and qualifies the production Media Type parser/acceptance contract
and the first raw-media processor with its supported representation profiles. The
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

Preserving source is not a rendering-security policy. An application that turns
Markdown, embedded HTML, links, or other inert source syntax into active DOM or
navigation owns sanitization and activation safety. The exact application
policy and tooling are deferred until rendering work is implemented, where they
must be characterized and verified before hostile source is activated.

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
- accepted Internet Media Type values preserve format identity and supplied parameters;
- capability dispatch has one small compile-time source of truth;
- ordinary fine-grained edits stay in native string space;
- opaque content keeps exact stored bytes;
- raw-media interpretation has a separate capability boundary;
- universal replacement gives every accepted Media Type value a collaborative baseline; and
- Range work remains focused on fine-grained text.

Costs and open selections:

- carrier text-domain edge behavior must be characterized at Gate B rather than
  assumed in this ADR;
- Step 4 must select and qualify a production Media Type parser/acceptance
  contract and preserve its compatibility-visible accepted-input behavior;
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

### Freeze RFC 6838/RFC 9110 syntax as the Coedit acceptance contract now

Rejected for this gate. Standards grammar is useful reference material, but the
document model does not need to invent or freeze a stricter parser contract
before the production parsing implementation is selected. A well-established
parser can deliberately accept a broader practical input domain. Step 4 must
select and qualify that behavior and record compatibility fixtures instead of
silently inheriting whatever a dependency happens to accept.

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

### Normalize or discard allowlisted Media Type parameters

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
  representative Media Type labels and raw-media test codecs only to prove
  capability dispatch and boundary independence; do not freeze the production
  accepted-input grammar here.
- **Step 4:** implement the selected payload/carrier; select and qualify the
  production Media Type parser/acceptance contract with compatibility fixtures;
  and select the first production raw-media processor with its supported
  representation profiles.
- **Step 5:** establish first-class History and permanent materialization of
  losing replacement Versions.
- **Step 6 / Gate C:** select durable Range representation and lineage behavior,
  including whole-payload replacement consequences.
- **Step 8:** freeze the physical `.coedit` representation after the earlier
  gates are closed.

The exact Media Type accepted-input domain and detailed raw-media profile matrix are intentionally not part of this ADR.
