from pathlib import Path
import re

AFFECTED = [
    Path("SCAFFOLDING_PLAN.md"),
    Path("docs/README.md"),
    Path("docs/INLINE_CONTENT_PAYLOADS.md"),
    Path("docs/PRODUCT_DOMAIN_MODEL.md"),
    Path("docs/MVP_CONTRACT.md"),
    Path("docs/MVP_ARCHITECTURE.md"),
    Path("docs/MVP_IMPLEMENTATION_SPEC.md"),
    Path("docs/MVP_VERIFICATION_PLAN.md"),
    Path("docs/PORTABLE_DOCUMENT_FORMAT.md"),
    Path("docs/COLLABORATION_MODEL.md"),
    Path("docs/PRESERVED_BRANCH_RECONCILIATION.md"),
    Path("docs/decisions/0010-typed-inline-content-payloads.md"),
]


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")


def one(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one occurrence, got {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def all_(path, old, new):
    text = read(path)
    if old in text:
        write(path, text.replace(old, new))


def rx(path, pattern, replacement):
    text = read(path)
    changed, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: regex expected one occurrence, got {count}: {pattern[:120]!r}")
    write(path, changed)


# Focused payload authority: do not freeze an RFC-derived acceptance grammar.
payload = "docs/INLINE_CONTENT_PAYLOADS.md"
one(
    payload,
    "**Status:** Accepted logical content direction; carrier selection and mixed\nreplacement/edit semantics remain Gate B decisions. Production raw-media\nprocessing remains a Step 4 decision.",
    "**Status:** Accepted logical content direction; carrier selection and mixed\nreplacement/edit semantics remain Gate B decisions. Production Media Type\nacceptance and raw-media processing remain Step 4 decisions.",
)
one(
    payload,
    "This document intentionally does not specify the complete input/output filter\nmatrix for every recognized Media Type. Step 4 selects and qualifies the first\nproduction raw-media processor capability.",
    "This document intentionally does not select the production Media Type parser,\nits exact acceptance behavior, or the complete input/output filter matrix for\nevery accepted Media Type value. Step 4 selects and qualifies the production\nMedia Type acceptance contract and the first raw-media processor capability.",
)
rx(
    payload,
    r"Creation of a Media-Type-labelled InlineContent and every whole-payload\nreplacement require an explicit valid Media Type from the caller\..*?Parsing for validation and\ncapability dispatch therefore does not canonicalize the stored value\.",
    """Creation of a Media-Type-labelled InlineContent and every whole-payload
replacement require an explicit accepted Media Type value from the caller. The
document engine has no default Media Type and does not infer one from payload
bytes or application context. An application that has opaque bytes but no more
specific format information can deliberately supply `application/octet-stream`;
that is application policy, not an engine fallback.

Capability matching is separate from preservation and acceptance. The selected
Media Type parser must accept the supplied value and produce a usable
`type/subtype` identity. The implementation compares the case-normalized
`type/subtype` identity against one compile-time allowlist. Parameters do not
participate in this capability lookup. Do not use raw string-prefix matching.

This contract does not define a second Coedit-specific Media Type grammar and
does not require the production parser to reject every value that is outside a
particular RFC grammar. Step 4 selects and qualifies the production parser and
any additional acceptance restrictions. That selected acceptance behavior is a
compatibility-visible implementation contract: record representative accepted
and rejected values, and do not silently change the accepted input domain during
a parser upgrade.

The complete supplied spelling remains durable metadata even when the selected
parser treats two spellings as the same Media Type identity. Parsing for
acceptance and capability dispatch therefore does not canonicalize the stored
value.""",
)
rx(
    payload,
    r"### 3\.1 Syntax, capability, and representation support are separate\n\nMalformed Media Type syntax is invalid input\. A syntactically valid unfamiliar\nMedia Type is valid document content and uses generic opaque handling\.",
    """### 3.1 Acceptance, capability, and representation support are separate

A Media Type value that the selected acceptance contract rejects is invalid
input. An accepted unfamiliar Media Type value is valid document content and
uses generic opaque handling.""",
)
one(
    payload,
    "Detailed parameter semantics, supported profile combinations, charset support,\ncodec/library choice, and profile-specific transformations belong to the Step 4\nprocessor selection and its focused verification. This contract does not select\nthem in advance.",
    "Detailed Media Type parser/library choice, acceptance behavior, parameter\nsemantics, supported profile combinations, charset support, raw-media\ncodec/library choice, and profile-specific transformations belong to Step 4 and\nits focused verification. This contract does not select them in advance.",
)
one(
    payload,
    "Step 4 selects and qualifies the first production raw-media processor and its\nsupported representation profiles. The selected capability may be deliberately\nsmall. Later processor support can expand without changing document semantics or\nstored Media Type values.",
    "Step 4 selects and qualifies the production Media Type parser/acceptance contract\nand the first raw-media processor with its supported representation profiles.\nThe selected capabilities may be deliberately small. Later raw-media profile\nsupport can expand without changing document semantics or stored Media Type\nvalues. Changes to Media Type acceptance require explicit compatibility review\nand evidence.",
)
one(
    payload,
    "- exact Media Type preservation with parsed type/subtype capability dispatch;\n- `text/markdown` and `text/plain` use the same fine-grained operation surface;\n- valid unfamiliar Media Types use opaque handling;",
    "- exact Media Type preservation with parsed type/subtype capability dispatch,\n  using representative test labels without selecting the production acceptance\n  grammar;\n- `text/markdown` and `text/plain` use the same fine-grained operation surface;\n- representative unfamiliar Media Type values use opaque handling;",
)
one(
    payload,
    "Step 4 selects and qualifies the production raw-media processor and its supported\nrepresentation profiles. Tests belong to the selected capability: supported\nprofiles must work exactly, unsupported profiles must fail explicitly, and the\nprocessor must not silently alter content or Media Type metadata.",
    "Step 4 selects and qualifies the production Media Type parser and acceptance\ncontract, records representative accepted/rejected compatibility fixtures, and\nselects and qualifies the production raw-media processor and its supported\nrepresentation profiles. Supported profiles must work exactly, unsupported\nprofiles must fail explicitly, and the processor must not silently alter content\nor Media Type metadata. A later parser/library upgrade must preserve the recorded\nacceptance contract or make an explicit compatibility decision.",
)
one(
    payload,
    "- select the production codec/library, charset set, flowed-text behavior,\n  parameter-support matrix, or other raw-media profile details before Step 4;",
    "- select the production Media Type parser or freeze its exact accepted-input\n  domain before Step 4;\n- select the production raw-media codec/library, charset set, flowed-text\n  behavior, parameter-support matrix, or other raw-media profile details before\n  Step 4;",
)

# Verification must test the selected acceptance contract, not RFC grammar.
verify = "docs/MVP_VERIFICATION_PLAN.md"
rx(
    verify,
    r"- each materialized InlineContent carries a syntactically valid Media Type;.*?- case variants and parameters give consistent type/subtype capability matching without a registry lookup while the complete supplied Media Type survives unchanged;",
    """- each materialized InlineContent carries a Media Type value accepted by the selected production acceptance contract; allowlisted fine-grained text selects the fine-grained text capability set and accepted unfamiliar values select generic opaque handling;
- creation and whole-payload replacement require an explicit accepted Media Type value, the engine does not infer or default it, and `application/octet-stream` is used only when an application deliberately supplies it;
- a Media Type value rejected by the selected acceptance contract, an accepted unfamiliar value, and an accepted allowlisted value whose raw representation is unsupported by the selected processor are distinct cases;
- Step 3 uses representative Media Type labels to exercise parsed type/subtype dispatch without selecting the production accepted-input grammar;
- case variants and parameters accepted by the selected parser give consistent type/subtype capability matching without a registry lookup while the complete supplied Media Type survives unchanged;""",
)
one(
    verify,
    "- Step 4 records the selected production raw-media processor and supported representation profiles and verifies each selected profile according to its focused contract;",
    "- Step 4 records the selected production Media Type parser/acceptance contract with representative accepted/rejected compatibility fixtures, and records the selected raw-media processor and supported representation profiles;",
)

# Portable validation checks the selected acceptance contract and preserves labels.
portable = "docs/PORTABLE_DOCUMENT_FORMAT.md"
all_(portable, "generic Media Type syntax and capability classification", "Media Type acceptance and capability classification under the selected production contract")
all_(portable, "generic Media Type syntax", "Media Type acceptance")
all_(portable, "malformed generic Media Type syntax", "a Media Type value rejected by the selected acceptance contract")
all_(portable, "The complete Media Type still remains valid durable metadata and Media Type acceptance is validated here.", "The complete Media Type remains durable metadata and is checked against the selected production acceptance contract here.")
all_(portable, "reported as malformed Media Type acceptance", "reported as rejected by the Media Type acceptance contract")

# Work order: Step 3 proves factoring; Step 4 selects acceptance.
scaffold = "SCAFFOLDING_PLAN.md"
all_(scaffold, "representative opaque Media Types including a valid unfamiliar type", "representative opaque Media Type labels, including unfamiliar labels used to qualify dispatch without freezing the production acceptance grammar")
one(
    scaffold,
    "Media Type syntax, parameter preservation,\nraw-media boundary separation, and capability matching are already document\nsemantics; Step 3 proves those boundaries can be implemented independently of the\ncarrier. Step 4 selects the initial raw-media processor capability and retains the\nStep 3 boundary cases as production regressions.",
    "Media Type preservation, raw-media boundary separation, and capability matching\nare accepted document semantics; Step 3 proves those boundaries can be implemented\nindependently of the carrier without freezing the production accepted-input\ngrammar. Step 4 selects and qualifies the Media Type parser/acceptance contract\nand the initial raw-media processor capability, then retains the Step 3 boundary\ncases as production regressions.",
)
all_(scaffold, "Step 4 selects and qualifies the first raw-media processor capability.", "Step 4 selects and qualifies the production Media Type parser/acceptance contract and the first raw-media processor capability.")

# Implementation and architecture summaries.
impl = "docs/MVP_IMPLEMENTATION_SPEC.md"
all_(impl, "`INLINE_CONTENT_PAYLOADS.md` section 3.1 owns syntax and capability matching.", "`INLINE_CONTENT_PAYLOADS.md` section 3.1 owns acceptance and capability matching.")
all_(impl, "An unfamiliar type is not invalid syntax", "An accepted unfamiliar value is not rejected merely because it is unfamiliar")
all_(impl, "Every Step 4 creation path supplies an explicit valid Media Type", "Every Step 4 creation path supplies a Media Type value accepted by the selected production contract")
all_(impl, "Step 4 selects and qualifies the first production raw-media processor", "Step 4 selects and qualifies the production Media Type parser/acceptance contract and the first raw-media processor")
all_(impl, "Step 4 converts the selected candidate into the production collaborative core, selects the production raw-media processor", "Step 4 converts the selected candidate into the production collaborative core, selects the production Media Type parser/acceptance contract, selects the raw-media processor")
all_("docs/MVP_ARCHITECTURE.md", "Media-Type validation", "Media-Type acceptance and capability dispatch")

readme = "docs/README.md"
all_(readme, "Step 4 selects and qualifies the first\nproduction raw-media processor", "Step 4 selects and qualifies the production\nMedia Type parser/acceptance contract and the first raw-media processor")
all_(readme, "Step 4 implements the selected collaborative core and selects the production raw-media processor", "Step 4 implements the selected collaborative core, selects the production Media Type parser/acceptance contract, and selects the raw-media processor")
all_(readme, "Step 3 proves raw/coarse media-boundary independence through test codecs but does not select the production raw-media processor", "Step 3 proves capability-dispatch and raw/coarse media-boundary independence through representative labels and test codecs but does not select the production Media Type parser, accepted-input domain, or raw-media processor")

# ADR 0010 is new in this PR. Preserve the rationale for deferring parser policy.
adr = "docs/decisions/0010-typed-inline-content-payloads.md"
all_(adr, "raw-media processor profiles deferred to Step 4", "Media Type acceptance and raw-media processor profiles deferred to Step 4")
rx(
    adr,
    r"### 3\.1 InlineContent preserves one complete Media Type\n\n.*?\n\n### 3\.2",
    """### 3.1 InlineContent preserves one complete accepted Media Type value

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

### 3.2""",
)
one(
    adr,
    "Step 3 uses representative test codecs only to prove that this boundary is\nindependent of carrier selection. Step 4 selects and qualifies the first\nproduction raw-media processor and its supported representation profiles.",
    "Step 3 uses representative Media Type labels and test codecs only to prove\ncapability dispatch and raw-media boundary independence from carrier selection.\nIt does not select the production Media Type parser or accepted-input domain.\nStep 4 selects and qualifies the production Media Type parser/acceptance contract\nand the first raw-media processor with its supported representation profiles.",
)
marker = """### Use a Coedit-specific collaborative-text Media Type

Rejected. A private media type would make the label describe Coedit's current
capability rather than the actual content format.
"""
one(
    adr,
    marker,
    marker + """
### Freeze RFC 6838/RFC 9110 syntax as the Coedit acceptance contract now

Rejected for this gate. Standards grammar is useful reference material, but the
document model does not need to invent or freeze a stricter parser contract
before the production parsing implementation is selected. A well-established
parser can deliberately accept a broader practical input domain. Step 4 must
select and qualify that behavior and record compatibility fixtures instead of
silently inheriting whatever a dependency happens to accept.
""",
)
one(
    adr,
    "- **Step 4:** implement the selected payload/carrier and select the first\n  production raw-media processor with its supported representation profiles.",
    "- **Step 4:** implement the selected payload/carrier; select and qualify the\n  production Media Type parser/acceptance contract with compatibility fixtures;\n  and select the first production raw-media processor with its supported\n  representation profiles.",
)
all_(adr, "The detailed raw-media profile matrix is intentionally not part of this ADR.", "The exact Media Type accepted-input domain and detailed raw-media profile matrix are intentionally not part of this ADR.")

# Secondary summaries use "accepted" for generic admission.
for path in AFFECTED:
    for old, new in [
        ("syntactically valid unfamiliar Media Type", "accepted unfamiliar Media Type value"),
        ("syntactically valid allowlisted Media Type", "accepted allowlisted Media Type value"),
        ("syntactically valid Internet Media Type", "accepted Internet Media Type value"),
        ("syntactically valid Media Type", "accepted Media Type value"),
        ("valid unfamiliar Media Types", "accepted unfamiliar Media Type values"),
        ("valid unfamiliar Media Type", "accepted unfamiliar Media Type value"),
        ("valid allowlisted Media Type", "accepted allowlisted Media Type value"),
        ("all other supported Media Types", "all other accepted Media Type values"),
        ("other supported Media Types", "other accepted Media Type values"),
        ("Every other supported Media Type", "Every other accepted Media Type value"),
        ("Every other valid Media Type", "Every other accepted Media Type value"),
        ("Every valid Media Type", "Every accepted Media Type value"),
        ("every valid Media Type", "every accepted Media Type value"),
        ("explicit valid Media Type", "explicit accepted Media Type value"),
        ("one valid Media Type", "one accepted Media Type value"),
    ]:
        all_(path, old, new)
    all_(path, "A accepted ", "An accepted ")
    all_(path, "a accepted ", "an accepted ")

# Tighten key summaries after terminology normalization.
all_(
    "docs/MVP_CONTRACT.md",
    "Use Internet Media Types for InlineContent payloads; support allowlisted fine-grained text with fine-grained text operations and generic opaque handling for other accepted Media Type values.",
    "Use accepted Internet Media Type values for InlineContent payloads; support allowlisted fine-grained text with fine-grained text operations and generic opaque handling for other accepted values. Step 4 selects and qualifies the production Media Type acceptance contract.",
)

# Verify that the superseded RFC-derived acceptance contract is gone from current authority.
forbidden = [
    "Generic Media Type syntax follows",
    "RFC 6838 restricted names",
    "RFC 9110 token and quoted-string parameter values",
    "syntactically valid Media Type",
    "syntactically valid unfamiliar",
    "generic Media Type syntax",
    "malformed generic Media Type syntax",
]
for path in AFFECTED:
    text = read(path)
    for needle in forbidden:
        if needle in text:
            raise SystemExit(f"{path}: stale Media Type syntax wording remains: {needle}")

print("Updated:")
for path in AFFECTED:
    print(f"- {path}")
