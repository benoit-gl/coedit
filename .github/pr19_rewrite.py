from pathlib import Path

OLD = "application/vnd.coedit.text"

paths = [Path("README.md"), Path("SCAFFOLDING_PLAN.md"), *Path("docs").rglob("*.md")]
for path in paths:
    text = path.read_text(encoding="utf-8")
    text = text.replace(f"`{OLD}`", "allowlisted fine-grained text")
    text = text.replace(OLD, "allowlisted fine-grained text")
    text = text.replace("Coedit collaborative-text Media Type", "fine-grained text allowlist")
    text = text.replace("Coedit collaborative-text media type", "fine-grained text allowlist")
    text = text.replace("Coedit text Media Type", "fine-grained text allowlist")
    text = text.replace("Coedit text media type", "fine-grained text allowlist")
    path.write_text(text, encoding="utf-8")

replacements = {
    "README.md": [
        ("Media-Type-labelled InlineContent payloads (allowlisted fine-grained text and representative opaque Media Types)",
         "Media-Type-labelled InlineContent payloads (`text/markdown`, `text/plain`, and representative opaque Media Types)"),
        ("durable allowlisted fine-grained text Range service", "durable fine-grained text Range service"),
    ],
    "SCAFFOLDING_PLAN.md": [
        ("defines allowlisted fine-grained text attributed text, clipboard lineage, Range-holder behavior, and carrier qualification.",
         "defines attributed fine-grained text behavior, clipboard lineage, Range-holder behavior, and carrier qualification."),
        ("defines durable multi-span and positional allowlisted fine-grained text Range behavior",
         "defines durable multi-span and positional fine-grained text Range behavior"),
        ("Formatting uses native collaborative marks inside allowlisted fine-grained text;",
         "Formatting uses native collaborative marks inside allowlisted fine-grained text payloads;"),
        ("future comments and internal text links can use the shared durable allowlisted fine-grained text Range value;",
         "future comments and internal text links can use the shared durable fine-grained text Range value;"),
        ("- allowlisted fine-grained text and representative opaque Media Types, including a valid unfamiliar type;",
         "- both initial allowlisted fine-grained Media Types, `text/markdown` and `text/plain`, plus representative opaque Media Types including a valid unfamiliar type;"),
        ("- exact arbitrary Unicode allowlisted fine-grained text without a document-level hard-break item;",
         "- exact arbitrary Unicode native-string collaboration for both allowlisted fine-grained Media Types without a document-level hard-break item;"),
        ("- intrinsic allowlisted fine-grained text formatting and protected fine-grained Origin;",
         "- intrinsic fine-grained text formatting and protected fine-grained Origin for both allowlisted types;"),
        ("the allowlisted fine-grained text Range-feasibility subset", "the fine-grained text Range-feasibility subset"),
        ("whole-payload replacement of allowlisted fine-grained text feasibility", "whole-payload replacement of fine-grained text feasibility"),
        ("Each InlineContent has one initial Media Type: allowlisted fine-grained text or another supported Media Type. Every payload supports whole-payload replacement with explicit Origin and deterministic replicated convergence. allowlisted fine-grained text additionally supports fine-grained editing, intrinsic formatting, and protected non-inheriting Origin. Other supported Media Types preserve opaque bytes with payload-level Origin and initially have no finer mutation.",
         "Each InlineContent has one valid Media Type. The initial compile-time fine-grained allowlist contains `text/markdown` and `text/plain`; all other valid Media Types use opaque byte handling. Every payload supports whole-payload replacement with explicit Origin and deterministic replicated convergence. Allowlisted text additionally supports native-string fine-grained editing, intrinsic formatting, and protected non-inheriting Origin."),
        ("structural, allowlisted fine-grained text, and whole-payload replacement work", "structural, fine-grained text, and whole-payload replacement work"),
        ("fresh allowlisted fine-grained text carrier identities", "fresh fine-grained text carrier identities"),
        ("### Step 6 — Implement the durable allowlisted fine-grained text Range service", "### Step 6 — Implement the durable fine-grained text Range service"),
        ("whole-payload replacement of allowlisted fine-grained text lineage", "whole-payload replacement of fine-grained text lineage"),
        ("ordinary structural and allowlisted fine-grained text operations", "ordinary structural and `text/markdown` fine-grained operations"),
        ("Current and historical Media Types, allowlisted fine-grained text, opaque payload bytes", "Current and historical Media Types, allowlisted fine-grained text state, opaque payload bytes"),
        ("canonical allowlisted fine-grained text through the engine command boundary", "canonical fine-grained text through the engine command boundary"),
        ("semantic allowlisted fine-grained text for `X` and `Y`", "semantic `text/markdown` content for `X` and `Y`"),
        ("Reload preserves Media Types, allowlisted fine-grained text, opaque payload bytes", "Reload preserves Media Types, fine-grained text state, opaque payload bytes"),
    ],
    "docs/ATTRIBUTED_TEXT_AND_ANNOTATIONS.md": [
        ("**Status:** Accepted allowlisted fine-grained text behavioral contract;", "**Status:** Accepted fine-grained text behavioral contract;"),
        ("detailed behavior of the allowlisted fine-grained text InlineContent\npayload:", "detailed behavior shared by allowlisted fine-grained text InlineContent\npayloads (`text/markdown` and `text/plain` initially):"),
        ("must implement for allowlisted fine-grained text:", "must implement for every allowlisted fine-grained text payload:"),
        ("- **allowlisted fine-grained text:** the Media-Type-labelled InlineContent payload whose canonical state is\n  authored Unicode text, intrinsic formatting, and protected fine-grained Origin.\n- **Formatting mark:** intrinsic rich-text presentation metadata of allowlisted fine-grained text.",
         "- **Fine-grained text payload:** an InlineContent whose normalized Media Type `type/subtype` is in the compile-time allowlist. The initial entries are `text/markdown` and `text/plain`. Its canonical collaborative state is authored native-string text, intrinsic formatting, and protected fine-grained Origin.\n- **Formatting mark:** intrinsic presentation metadata of a fine-grained text payload; it is Coedit collaboration state and is not necessarily part of the raw media representation."),
        ("An empty allowlisted fine-grained text value is valid.", "An empty allowlisted fine-grained text payload is valid."),
        ("allowlisted fine-grained text has no canonical `HardBreak` item", "fine-grained text has no canonical `HardBreak` item"),
        ("generic allowlisted fine-grained text validity", "generic fine-grained text validity"),
        ("The allowlisted fine-grained text model validates", "The fine-grained text model validates"),
        ("intrinsic allowlisted fine-grained text formatting", "intrinsic fine-grained text formatting"),
        ("same allowlisted fine-grained text qualification suite", "same fine-grained text qualification suite for both initial allowlisted Media Types"),
    ],
    "docs/MARKDOWN_INTERCHANGE.md": [
        ("allowlisted fine-grained text", "`text/markdown` fine-grained text"),
    ],
    "docs/PRESERVED_BRANCH_RECONCILIATION.md": [
        ("allowlisted fine-grained text Range implementation", "fine-grained text Range implementation"),
    ],
    "docs/PRODUCT_DOMAIN_MODEL.md": [
        ("allowlisted fine-grained text Range implementation", "fine-grained text Range implementation"),
    ],
}

for name, pairs in replacements.items():
    path = Path(name)
    text = path.read_text(encoding="utf-8")
    for before, after in pairs:
        text = text.replace(before, after)
    path.write_text(text, encoding="utf-8")

# ADR 0010 and INLINE_CONTENT_PAYLOADS.md were rewritten directly before this script.
leftovers = []
for path in paths:
    if OLD in path.read_text(encoding="utf-8"):
        leftovers.append(str(path))
if leftovers:
    raise SystemExit(f"Old provisional Media Type remains in: {leftovers}")
