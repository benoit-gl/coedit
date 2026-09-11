# ADR-0010: Media-Type-labelled InlineContent payloads and universal replacement

**Status:** Accepted direction; mixed replacement/edit semantics deferred to Gate B

**Decision date:** 2026-09-08

**Amended:** 2026-09-11

**Scope:** InlineContent payload semantics, Media Type preservation and capability
dispatch, whole-payload replacement, payload convergence, and the boundary
between document structure and payload-specific behavior.

## 1. Authority and relationship to earlier decisions

This record preserves why the decision was made. Normative behavior belongs in:

- [`../PRODUCT_DOMAIN_MODEL.md`](../PRODUCT_DOMAIN_MODEL.md) for product meaning;
- [`../INLINE_CONTENT_PAYLOADS.md`](../INLINE_CONTENT_PAYLOADS.md) for Media Type
  preservation, fine-grained capability dispatch, universal whole-payload
  replacement, raw/coarse materialization, Origin granularity, and convergence;
- [`../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md)
  for fine-grained text and Origin;
- [`../RANGE_MODEL.md`](../RANGE_MODEL.md) for durable references inside
  fine-grained text;
- [`../MVP_ARCHITECTURE.md`](../MVP_ARCHITECTURE.md) for the public engine
  boundary;
- [`../COLLABORATION_MODEL.md`](../COLLABORATION_MODEL.md) for later causal
  replication; and
- [`../../SCAFFOLDING_PLAN.md`](../../SCAFFOLDING_PLAN.md) for work order and
  gates.

ADR 0001 remains accepted for protected fine-grained Origin, causal History,
persistence, and carrier qualification. This ADR supersedes its engine-owned
rich-text formatting assumptions and the parts that treated rich text and hard
breaks as the universal shape of InlineContent content.

ADR 0004 is superseded where it defines links as intrinsic engine-owned formatting
marks, typed internal Block-link state, and link-specific fallback in canonical
content. Applications can still store or serialize the reusable durable Range
value defined by ADR 0009 in Markdown links, comments, navigation metadata, or
other holders. The Range service and selected carrier provide generic text
position machinery; neither understands a holder as a link. ADR 0009 remains
accepted for Range behavior, as refined here to allowlisted fine-grained text and
application-owned holders. ADR 0005 remains accepted for semantic interpretation
boundaries, with its earlier link and formatting examples refined by this ADR.

## 2. Context

The clean-slate documentation initially treated every InlineContent as rich text.
PR 19 first generalized this into Media-Type-labelled payloads but provisionally
introduced a Coedit-specific fine-grained text format. Design review showed that
this conflated media-format identity with the editing capability that Coedit
currently implements.

The intended boundary is simpler:

- each InlineContent keeps the actual Internet Media Type supplied for its media
  representation, including parameters;
- every payload supports coarse whole-payload replacement;
- only explicitly qualified formats receive fine-grained text collaboration;
- fine-grained text is maintained as a native ECMAScript string rather than
  continuously encoded media bytes;
- the selected carrier defines the native string values that it can preserve
  losslessly; Coedit does not add a separate Unicode-repair or well-formedness
  subsystem for carrier edge cases;
- raw/coarse access to allowlisted text materializes bytes according to the
  preserved Media Type and fails if exact representation is not possible; and
- Coedit does not sniff content or maintain a dynamic format-capability registry.

This gives the prototype a small, testable boundary without claiming that all
`text/*` formats are equally suitable for fine-grained collaboration or that
textual `application/*` formats can never gain it later.

## 3. Decision

### 3.1 InlineContent preserves one complete Media Type

Each InlineContent owns exactly one payload and one syntactically valid Internet
Media Type that identifies its media representation. The complete supplied Media
Type value, including parameters, is durable metadata and is preserved exactly.

The document model parses the value for validation and capability dispatch, but
it does not rewrite the stored value merely because a type is recognized.
Type/subtype comparison is case-insensitive. Parameter values retain the semantics
specified by their media type.

Generic Media Type syntax validity and payload-specific representation validity
are distinct. A valid unfamiliar Media Type can use opaque handling without Coedit
certifying its format-specific parameters. When Coedit owns a processor for an
allowlisted fine-grained type, that processor validates prerequisites only when
an operation interprets or produces the Media Type's raw/coarse byte
representation. Reopening canonical collaborative state from `.coedit` is not a
raw media boundary.

For example, `text/markdown` requires a `charset` parameter for raw byte
conversion. A syntactically valid `text/markdown` value that omits that required
parameter is not reclassified as opaque and is not treated as malformed generic
Media Type syntax; an applicable raw/coarse boundary rejects it as invalid or
incomplete representation metadata. A raw processor also rejects duplicate
parameters that it consumes, such as duplicate `charset` parameters, rather than
letting incidental parser first/last behavior choose the meaning.

### 3.2 Fine-grained text capability uses a compile-time allowlist

The initial fine-grained allowlist contains exactly:

```text
text/markdown
text/plain
```

Both initial entries are deliberate. The Markdown product path alone would not
force the first implementation to separate shared fine-grained text behavior from
Markdown-specific behavior. Requiring `text/plain` from Gate B makes that
factorization observable from the start: both Media Types share native-string
editing, Origin, Range, and raw/coarse processor boundaries while retaining
different representation rules and parameters. This is a qualification
requirement, not a rule that all `text/*` types qualify.

Capability dispatch compares the parsed, case-normalized `type/subtype` identity
to this one compile-time list. Parameters do not participate in the lookup. Raw
string-prefix matching is not used.

Every other valid Media Type initially uses generic opaque handling, even if it
is another `text/*` type or a character-oriented `application/*` format. This is
a deliberate prototype boundary. Additional types can be added after prototype
evidence supports their semantics and qualification cost.

A valid unfamiliar Media Type is therefore valid document content. It does not
need a decoder, renderer, registry lookup, or schema migration to participate in
coarse collaboration.

### 3.3 Fine-grained text uses carrier-native strings; raw access uses media bytes

For an allowlisted type, the collaborative logical value is exposed as a native
ECMAScript string plus Coedit collaboration metadata such as fine-grained Origin
and Range lineage. Coedit does not add a general Unicode normalization, repair,
or well-formedness pass around ordinary editing. The selected carrier defines
which native string values it can preserve losslessly.

Ill-formed ECMAScript string edge cases, including lone surrogates, are carrier
qualification evidence rather than a product portability invariant. Coedit does
not add a second validation layer only to make those values portable. If the
carrier explicitly rejects an operation, the normal carrier error propagates and
no partial document change is published.

Fine-grained APIs operate directly on native strings and the selected carrier's
native text representation. They do not encode, decode, repair, or reject
supported text according to media representation rules for every edit.

The raw/coarse boundary remains byte-oriented. On raw input, a type-specific text
processor validates representation prerequisites and decodes the supplied bytes
according to the full declared Media Type. On raw output, it encodes the current
string according to the preserved Media Type.

Raw conversion must fail explicitly if required Media Type parameters are absent
or invalid, duplicate consumed parameters are present, an encoding is unsupported,
input is invalid, or the current string cannot be represented exactly. It must
not replace characters, repair the native string, silently change a charset,
rewrite the stored Media Type, or fall back to opaque handling merely to make
serialization succeed.

For opaque types, the document model keeps the exact supplied bytes and raw
retrieval returns them unchanged.

### 3.4 Media-type parameters are preserved, not generalized into document rules

The generic document model does not classify parameters into persistent versus
discardable categories. It preserves the complete supplied Media Type.

`text/markdown` parameters such as `charset` and `variant`, and `text/plain`
parameters such as `charset`, `format`, and `delsp`, remain part of that value.
Only a media-type-aware raw processor interprets parameters required to convert
between bytes and the native string. Markdown dialect, flowed-text semantics,
rendering, and application interpretation remain outside the generic document
model unless a later focused contract says otherwise.

### 3.5 Fine-grained text has no document-level hard-break item

Line-feed, carriage-return, and other supported native string content are text
data. Block and InlineContent boundaries add no character. Applications, editors,
renderers, and interchange adapters decide how applicable characters and
structural boundaries are presented.

Fine-grained Origin and Range lineage can accompany both initial allowlisted text
formats. Formatting, Markdown parsing/rendering, and link interpretation are
application concerns. For `text/markdown`, inline formatting and links are
represented by Markdown source syntax when present, not by parallel engine-owned
mark or link models.

### 3.6 Whole-payload replacement is universal

Every InlineContent supports one atomic whole-payload replacement operation. The
operation preserves InlineContent identity and replaces the complete current
payload value: Media Type plus its media content and required Origin effect.

For opaque types, replacement stores the supplied bytes. For allowlisted text,
coarse replacement validates the declared representation and decodes the supplied
media bytes to the collaborative native string before publication. Fine-grained
text operations remain available when merge behavior is desired.

Payload-specific operations fail explicitly against an incompatible or invalid
fine-grained representation. The document model does not sniff payload bytes or
define a separate implicit conversion operation.

### 3.7 Whole-payload replacement is eventually consistent

All payloads are collaborative in the convergence sense. Once authorized
replicas receive the same complete set of valid Contributions, they must converge
on the same current payload state.

Whole-payload replacement behaves as a convergent replicated register:

- a causally later replacement supersedes replacements that it observed;
- truly concurrent replacements select one deterministic current winner;
- the winner cannot depend on packet-arrival order, wall-clock time, or an
  unsynchronized local sequence;
- every conforming replica with the same valid causal input selects the same
  winner; and
- losing replacement Contributions and their Versions remain immutable and
  exactly materializable in History.

Gate B qualifies and records the **observable deterministic winner rule** and the
carrier-private representation, effect identity, or metadata used to implement
it. Carrier-native conflict order is evidence, not product policy by itself; two
conforming adapters must not expose different logical winners for the same valid
causal input after Gate B closes the rule.

Replacement concurrent with fine-grained text editing is also explicitly deferred
to Gate B. Qualification must select and record that observable behavior before
Step 4 implements it.

### 3.8 Origin and Range granularity follow the fine-grained text contract

Allowlisted text uses protected fine-grained Origin and the durable text Range
service. Opaque payloads initially use one payload-level Origin and have no
sub-payload Range semantics.

A future Media Type can join the existing fine-grained text contract or define a
different focused addressing contract after qualification. Stored media labels do
not need to change merely because Coedit learns a new operation set.

### 3.9 Formatting and media syntax belong to the application

The document engine is agnostic to formatting. It owns structural relationships,
payload Media Types, payload content, attribution/History/Range mechanics,
serialization, and collaboration. It does not own bold, italic, link, list, or
other rendering semantics and does not keep a parallel rich-text mark or link
layer.

A Markdown importer can consume recognized structural syntax into the Block tree
while preserving unconsumed inline or unknown syntax in the `text/markdown`
source string. Editors can translate user actions into structural operations and
source-string edits. Renderers can parse the resulting hierarchy and payload
syntax.

An application can interpret Markdown link syntax and can choose to store or
serialize a generic Coedit Range as a local target. The Range service tracks text;
the carrier supplies only the private generic position machinery needed to do so.
Neither layer recognizes that holder as a link. URL meaning, local/remote policy,
activation, fallback, repair, and rendering remain application behavior.

## 4. Consequences

Positive consequences:

- the document ontology no longer equates all InlineContent with rich text;
- actual Internet Media Types preserve format identity and all supplied
  parameters;
- the prototype tests two real standardized fine-grained formats instead of a
  provisional Coedit-specific media type;
- capability dispatch has one small compile-time source of truth;
- there is no content sniffing, dynamic plugin registry, or MIME-taxonomy
  inference;
- ordinary fine-grained edits stay in carrier-native ECMAScript string space;
- opaque content keeps exact stored bytes;
- raw/coarse text access has an explicit lossless encoding contract;
- universal replacement gives every Media Type a deterministic collaborative
  baseline; and
- text Range work remains focused rather than becoming universal binary
  addressing.

Costs and constraints:

- the selected carrier can have a narrower lossless text domain than the complete
  set of ECMAScript string code-unit sequences; Coedit characterizes that edge
  behavior rather than adding a separate Unicode-validation subsystem;
- the preserved Media Type can name an encoding that cannot represent a later
  collaboratively edited string, so raw materialization can fail;
- Gate B must prove that native-string collaboration and raw/coarse media
  conversion are cleanly factored from carrier selection, but it does not select
  the production codec or charset set;
- Step 4 must select and qualify the initial raw text processor mechanism and
  exact supported charset set;
- `text/markdown` requires `charset` for the Coedit-owned raw processor;
- `text/plain` without an explicit charset uses its registered default, which can
  expose the raw-output failure path after edits that are not representable by
  that charset;
- adding another fine-grained Media Type is an explicit contract and
  qualification change rather than an automatic consequence of its top-level
  `text` type; and
- raw media output cannot carry all Coedit-only collaboration metadata when that
  metadata is not part of the declared media format.

## 5. Alternatives considered

### Use a Coedit-specific collaborative-text Media Type

Rejected. A private media type would make the label describe Coedit's current
capability rather than the actual content format. Markdown should remain
`text/markdown`, plain text should remain `text/plain`, and future capability
changes should not require relabelling stored content.

### Treat every `text/*` Media Type as fine-grained

Deferred rather than adopted. The MIME top-level taxonomy does not guarantee the
local edit or recovery properties that Coedit wants to qualify. Some textual
formats also live under `application/*`. The prototype therefore uses an explicit
allowlist and expands it only with evidence.

### Start with only `text/markdown`

Rejected for the initial implementation. It would cover the current Markdown
authoring path, but it would also let Gate B pass with Markdown-specialized text
and raw-media code. Requiring `text/plain` from the first implementation forces
the shared fine-grained text and raw/coarse processor abstractions to handle more
than one Media Type before those boundaries harden. The additional qualification
cost is deliberate.

### Keep a separate `Text | Opaque` discriminator in addition to Media Type

Rejected for the prototype. It creates a second persistent classification that
can disagree with the Media Type and still requires a policy for unknown formats.
The compile-time allowlist derives the current capability without adding durable
state.

### Match fine-grained types by string prefix

Rejected. Media type type/subtype matching is case-insensitive, parameters can be
present, and prefix matching would incorrectly accept names such as
`text/markdown-extra`. Parse once, preserve the original value, and compare the
normalized type/subtype structurally.

### Normalize or discard recognized Media Type parameters

Rejected. Parameter semantics belong to their Media Type. Type-specific
exceptions would make persistence rules grow with every recognized format. The
generic model preserves the complete supplied value.

### Restrict fine-grained edits to the declared character encoding

Rejected. It would make every text edit perform byte-encoding policy checks and
leak interchange representation rules into the collaborative hot path. Supported
native-string collaboration remains valid; raw byte materialization reports an
explicit failure if the current text cannot be represented.

### Add a document-level Unicode validator for ill-formed ECMAScript strings

Rejected. Lone surrogates are not a product requirement. Adding normalization,
repair, or validation only to extend the carrier beyond its native lossless text
domain adds complexity to the editing hot path without a product benefit. Gate B
characterizes carrier behavior instead.

### Silently re-encode as UTF-8 when raw output fails

Rejected. That would mutate the meaning of durable Media Type metadata and hide a
real representation failure.

### Keep universal attributed rich text

Rejected. It makes the first application payload the ontology for every future
InlineContent and forces presentation concepts into the generic content model.

### Make opaque replacement a non-text-only operation

Rejected. Whole-payload replacement is useful for text, import, restore, future
structured payloads, and integrations. It is the common mutation baseline.

### Use last-writer-wins wall-clock timestamps

Rejected. Unsynchronized clocks do not provide trustworthy causal ordering. The
replacement order must derive from immutable replicated causal/effect state.

### Let each carrier expose its native concurrent-register winner

Rejected as product semantics. Carrier-native ordering can inform the Gate B
implementation, but the selected observable rule must be stable across conforming
adapters and portable materialization.

### Introduce a generic structured-data CRDT or dynamic capability registry now

Rejected by YAGNI. Two fine-grained Media Types and one generic opaque handler are
sufficient for the prototype.

## 6. Compatibility and follow-up

This is a documentation and qualification correction before Gate B. It does not
require the completed Step 2 structural domain to interpret payload internals.
Step 4 evolves the existing opaque InlineContent value into the Media-Type-labelled
payload representation.

Step 3 must qualify `text/markdown`, `text/plain`, representative opaque Media
Types including `application/octet-stream`, universal replacement, deterministic
concurrent replacement convergence, exact Media Type preservation, parameter and
representation-validity classification, carrier-independent raw/coarse boundary
behavior through representative test codecs, exact ordinary supported native
string behavior, characterization of ill-formed ECMAScript string edge cases,
and the existing fine-grained text suite against both carrier candidates. Gate B
records the carrier winner, observable replacement winner rule, its private
implementation, and mixed replacement/edit semantics. It does not select the
production raw text processor mechanism or supported charset set.

Step 4 selects and qualifies the initial raw text processor mechanism and exact
supported charset set. It retains the Step 3 raw/coarse boundary cases as
production regressions and must fail explicitly for unsupported encodings or
native strings that the preserved Media Type cannot represent exactly.

Step 6 remains responsible for the exact effect of whole-payload replacement on
durable Range lineage. Step 8 freezes exact Media Type values, supported
carrier-native string state, opaque payload bytes, and required metadata into the
portable format only after Gates B and C pass.

Future fine-grained formats require an explicit allowlist and qualification
update. Valid unfamiliar Media Types already use the opaque contract and need no
schema change merely because they are unfamiliar.

## 7. Standards references

- [RFC 6838: Media Type Specifications and Registration Procedures](https://www.rfc-editor.org/rfc/rfc6838.html) defines the Internet Media Type framework.
- [RFC 9110, section 8.3.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.3.1) defines Media Type syntax and type/subtype comparison.
- [RFC 7763: The `text/markdown` Media Type](https://www.rfc-editor.org/rfc/rfc7763.html) registers Markdown and its parameters.
- [RFC 6657: Update to MIME regarding `charset` Parameter Handling in Textual Media Types](https://www.rfc-editor.org/rfc/rfc6657.html) records `text/plain` charset behavior.
- [RFC 3676: The Text/Plain Format and DelSp Parameters](https://www.rfc-editor.org/rfc/rfc3676.html) defines `format` and `delsp` for `text/plain`.
- [IANA Media Types](https://www.iana.org/assignments/media-types/media-types.xhtml) is the authoritative media-type registry.
