from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one occurrence, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# Focused payload authority.
p = "docs/INLINE_CONTENT_PAYLOADS.md"
replace(p, "| Malformed Media Type syntax                                                              | Reject atomically as invalid input.                                                                              |", "| Media Type value rejected by the selected acceptance contract                            | Reject atomically as invalid input.                                                                              |")
replace(p, "| Valid Media Type not in the fine-grained allowlist                                       | Accept through generic opaque handling, subject to ordinary envelope and resource checks.                        |", "| Accepted Media Type value not in the fine-grained allowlist                              | Accept through generic opaque handling, subject to ordinary envelope and resource checks.                        |")
replace(p, "| Valid allowlisted type whose raw representation is unsupported by the selected processor | Fail explicitly at the raw/coarse boundary; do not relabel, transcode silently, or fall back to opaque handling. |", "| Accepted allowlisted value whose raw representation is unsupported by the selected processor | Fail explicitly at the raw/coarse boundary; do not relabel, transcode silently, or fall back to opaque handling. |")
replace(p, "Any valid Media Type whose normalized type/subtype is not in the fine-grained\nallowlist initially uses generic opaque-content behavior.", "Any accepted Media Type value whose parsed, normalized type/subtype is not in\nthe fine-grained allowlist initially uses generic opaque-content behavior.")
replace(p, "The caller supplies the exact valid Media Type when creating that payload.", "The caller supplies the exact accepted Media Type value when creating that payload.")

# Verification summaries and tests.
p = "docs/MVP_VERIFICATION_PLAN.md"
replace(p, "Step 4 selects and qualifies the first production raw-media processor capability.", "Step 4 selects and qualifies the production Media Type parser/acceptance contract and the first raw-media processor capability.")
replace(p, "It does not select the production raw-media processor or supported representation profiles.", "It does not select the production Media Type parser, accepted-input domain, raw-media processor, or supported representation profiles.")
replace(p, "- every materialized Step 4 InlineContent has exactly one caller-supplied valid Media Type and the engine supplies no default Media Type;", "- every materialized Step 4 InlineContent has exactly one caller-supplied accepted Media Type value and the engine supplies no default Media Type;")
replace(p, "- whole-payload replacement is available for every supported Media Type and can keep or change the Media Type;", "- whole-payload replacement is available for every accepted Media Type value and can keep or change the Media Type;")

# Portable format: reopen validates acceptance, not raw representation syntax/profile.
p = "docs/PORTABLE_DOCUMENT_FORMAT.md"
replace(p, "Step 4 must separately have selected and qualified the first production raw-media\nprocessor and its supported representation profiles.", "Step 4 must separately have selected and qualified the production Media Type\nparser/acceptance contract and the first raw-media processor with its supported\nrepresentation profiles.")
replace(p, "The complete Media Type still remains valid durable metadata and generic Media\nType syntax is validated here.\n\nAn accepted unfamiliar Media Type value is accepted through generic opaque\nhandling without format-specific validation. A syntactically valid allowlisted\nMedia Type can still fail a later Coedit-owned raw representation operation when\nthe selected processor does not support its representation profile. It is not\nreclassified as opaque or reported as rejected by the Media Type acceptance contract for\nthat reason.", "The complete supplied Media Type remains durable metadata and is checked against\nthe selected production acceptance contract here.\n\nAn accepted unfamiliar Media Type value uses generic opaque handling without\nformat-specific validation. An accepted allowlisted Media Type value can still\nfail a later Coedit-owned raw representation operation when the selected\nprocessor does not support its representation profile. It is not reclassified as\nopaque or reported as rejected by the Media Type acceptance contract for that\nreason.")

# Work order: Step 4 also owns parser/acceptance selection.
p = "SCAFFOLDING_PLAN.md"
replace(p, "Step 4 selects and implements the first raw-media processor capability.", "Step 4 selects and qualifies the production Media Type parser/acceptance contract and implements the first raw-media processor capability.")
replace(p, "Qualification code uses the same abstractions intended for production, but this step does not freeze the final Range API, lineage representation, production raw-media processor, or supported representation profiles.", "Qualification code uses the same abstractions intended for production, but this step does not freeze the final Range API, lineage representation, production Media Type parser or accepted-input domain, raw-media processor, or supported representation profiles.")
replace(p, "The initial compile-time fine-grained allowlist contains `text/markdown` and `text/plain`; all other valid Media Types use opaque byte handling.", "The initial compile-time fine-grained allowlist contains `text/markdown` and `text/plain`; all other accepted Media Type values use opaque byte handling.")
replace(p, "Step 4 selects and qualifies the first production raw-media processor and its supported representation profiles.", "Step 4 selects and qualifies the production Media Type parser/acceptance contract and the first raw-media processor with its supported representation profiles.")
replace(p, "**Exit gate:** Production code uses no rejected-candidate or carrier-specific public API. The initial raw-media processor and supported representation profiles are recorded.", "**Exit gate:** Production code uses no rejected-candidate or carrier-specific public API. The production Media Type parser/acceptance contract, representative accepted/rejected compatibility fixtures, initial raw-media processor, and supported representation profiles are recorded.")

# ADR rationale and gate ownership.
p = "docs/decisions/0010-typed-inline-content-payloads.md"
replace(p, "Early review also began\nto specify charset handling and other raw-media rules.", "Early review also began\nto specify generic Media Type grammar, charset handling, and other raw-media\nrules.")
replace(p, "- each InlineContent keeps the actual Internet Media Type supplied for its media\n  representation, including parameters;", "- each InlineContent keeps the accepted Internet Media Type value supplied for\n  its media representation, including parameters;")
replace(p, "- raw/coarse byte interpretation happens at a separate Media-Type-aware processor\n  boundary; and", "- production Media Type acceptance is selected as a parser contract rather than\n  frozen here from one standards grammar;\n- raw/coarse byte interpretation happens at a separate Media-Type-aware processor\n  boundary; and")
replace(p, "- actual Internet Media Types preserve format identity and supplied parameters;", "- accepted Internet Media Type values preserve format identity and supplied parameters;")
replace(p, "- universal replacement gives every Media Type a collaborative baseline; and", "- universal replacement gives every accepted Media Type value a collaborative baseline; and")
replace(p, "- a preserved Media Type can name a representation the selected processor does\n  not support, so raw/coarse operations can fail;", "- Step 4 must select and qualify a production Media Type parser/acceptance\n  contract and preserve its compatibility-visible accepted-input behavior;\n- a preserved Media Type can name a representation the selected processor does\n  not support, so raw/coarse operations can fail;")
replace(p, "### Normalize or discard recognized Media Type parameters", "### Normalize or discard allowlisted Media Type parameters")
replace(p, "  representative raw-media test codecs only to prove boundary independence.", "  representative Media Type labels and raw-media test codecs only to prove\n  capability dispatch and boundary independence; do not freeze the production\n  accepted-input grammar here.")
