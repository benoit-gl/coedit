from pathlib import Path

# Focused payload authority: text capability is string/Origin/Range only.
p = Path('docs/INLINE_CONTENT_PAYLOADS.md')
t = p.read_text(encoding='utf-8')
t = t.replace('fine-grained text formatting and Origin behavior.', 'fine-grained text and Origin behavior.')
t = t.replace('Fine-grained insertion, deletion, replacement, intrinsic collaborative\nformatting/annotations, protected fine-grained Origin, text positions, and durable\nRange operations are available for allowlisted text.', 'Fine-grained insertion, deletion, replacement, protected fine-grained Origin, text positions, and durable Range operations are available for allowlisted text.')
t = t.replace('Coedit collaboration metadata such as Origin, formatting, Range lineage, and\ncarrier state is not part of the raw `text/markdown` or `text/plain` byte stream.', 'Coedit collaboration metadata such as Origin, Range lineage, History, and carrier state is not part of the raw `text/markdown` or `text/plain` byte stream.')
t = t.replace('| Intrinsic collaborative formatting/annotations | yes | yes | no |\n', '')
t = t.replace('concurrent with fine-grained text insertion, deletion, or formatting.', 'concurrent with fine-grained text insertion, deletion, or replacement.')
t = t.replace('allowlist path for editing, formatting, Origin, cursor, and Range feasibility;', 'allowlist path for editing, Origin, cursor, and Range feasibility;')
t = t.replace('versus insertion, deletion, and formatting cases, including edits to a losing', 'versus insertion, deletion, and replacement cases, including edits to a losing')
p.write_text(t, encoding='utf-8')

# ADR 0010: place the application-formatting decision inside section 3 and remove stale rationale.
p = Path('docs/decisions/0010-typed-inline-content-payloads.md')
t = p.read_text(encoding='utf-8')
t = t.replace('  for fine-grained text formatting and Origin;', '  for fine-grained text and Origin;')
t = t.replace('ADR 0001 remains accepted for intrinsic collaborative-text formatting, protected\nfine-grained Origin, causal History, persistence, and carrier qualification. This\nADR refines and supersedes the parts of ADR 0001 that treated attributed rich\ntext and hard breaks as the universal shape of all InlineContent content.', 'ADR 0001 remains accepted for protected fine-grained Origin, causal History, persistence, and carrier qualification. This ADR supersedes its engine-owned rich-text formatting assumptions and the parts that treated rich text and hard breaks as the universal shape of InlineContent content.')
t = t.replace('introduced allowlisted fine-grained text as a Coedit-specific fine-grained text\nformat.', 'introduced a provisional Coedit-specific fine-grained text format.')
section = '''### 3.9 Formatting and media syntax belong to the application

The document engine is agnostic to formatting. It owns structural relationships,
payload Media Types, payload content, attribution/History/Range mechanics,
serialization, and collaboration. It does not own bold, italic, link, list, or
other rendering semantics and does not keep a parallel rich-text mark layer.

A Markdown importer can consume recognized structural syntax into the Block tree
while preserving unconsumed inline or unknown syntax in the `text/markdown`
source string. Editors can translate user actions into structural operations and
source-string edits. Renderers can parse the resulting hierarchy and payload
syntax. Link targets, including whether a URL is local or remote, are application
interpretation. These are application behaviors, not canonical document-engine
semantics.

'''
old_section = '\n\n### 3.9 Formatting and media syntax belong to the application\n\nThe document engine is agnostic to formatting. It owns structural relationships, payload Media Types, payload content, attribution/History/Range mechanics, serialization, and collaboration. It does not own bold/italic/link/list rendering semantics or a parallel rich-text mark layer.\n\nA Markdown importer can consume recognized structural syntax into the Block tree while preserving unconsumed inline or unknown syntax in the `text/markdown` source string. Editors can translate user actions into structural operations and source-string edits. Renderers can parse the resulting hierarchy and payload syntax. These are application behaviors, not canonical document-engine semantics.'
t = t.replace(old_section, '')
marker = '## 4. Consequences\n'
t = t.replace(marker, section + marker)
p.write_text(t, encoding='utf-8')

# Markdown wording: no stale reference to a canonical hard-break character that section 8 no longer defines.
p = Path('docs/MARKDOWN_INTERCHANGE.md')
t = p.read_text(encoding='utf-8')
t = t.replace('There is no separate hard-break content item in this relation. A Markdown hard break is represented by the canonical text character selected in section 8. A structural Block or InlineContent boundary contributes no character merely because the boundary exists.', 'There is no separate hard-break content item in this relation. Markdown line-break spelling remains source syntax unless the application deliberately translates it during editing or structural import. A structural Block or InlineContent boundary contributes no character merely because the boundary exists.')
t = t.replace('an `text/markdown` fine-grained text character', 'a `text/markdown` fine-grained text character')
p.write_text(t, encoding='utf-8')

# Fix stale index/summary phrases where the focused text contract used to own formatting.
for name in ['docs/README.md', 'SCAFFOLDING_PLAN.md', 'README.md']:
    p = Path(name)
    t = p.read_text(encoding='utf-8')
    t = t.replace('attributed text', 'fine-grained text')
    t = t.replace('Attributed text', 'Fine-grained text')
    p.write_text(t, encoding='utf-8')

# Audit active documentation for rejected engine semantics. Historical ADR 0001 may mention
# earlier formatting decisions, but current authorities and ADR 0010 must supersede them clearly.
current = [Path('README.md'), Path('SCAFFOLDING_PLAN.md'), *Path('docs').glob('*.md'), Path('docs/decisions/0010-typed-inline-content-payloads.md')]
for path in current:
    text = path.read_text(encoding='utf-8')
    if 'application/vnd.coedit.text' in text:
        raise SystemExit(f'{path}: provisional media type remains')

for name, needles in {
    'docs/INLINE_CONTENT_PAYLOADS.md': ['Intrinsic collaborative formatting', 'formatting/annotations', 'editing, formatting, Origin'],
    'docs/PRODUCT_DOMAIN_MODEL.md': ['intrinsic formatting', 'Formatting marks commit', 'typed internal Block link', 'intrinsic internal-link'],
    'docs/MVP_ARCHITECTURE.md': ['intrinsic formatting', 'native formatting semantics', 'text-plus-formatting-plus-Origin'],
    'docs/MVP_CONTRACT.md': ['intrinsic formatting marks', 'owns intrinsic formatting'],
    'docs/MVP_IMPLEMENTATION_SPEC.md': ['intrinsic formatting marks', 'Formatting follows the vocabulary', 'formatting.ts'],
    'docs/MARKDOWN_INTERCHANGE.md': ['intrinsic italic mark', 'intrinsic bold mark', 'intrinsic link mark', 'native marks are canonical'],
    'docs/RANGE_MODEL.md': ['intrinsic internal-link', 'primary `BlockId` remains the fallback'],
    'docs/decisions/0010-typed-inline-content-payloads.md': ['Coedit-specific fine-grained text\nformat', 'for fine-grained text formatting and Origin'],
}.items():
    text = Path(name).read_text(encoding='utf-8')
    bad = [x for x in needles if x in text]
    if bad:
        raise SystemExit(f'{name}: stale semantics: {bad}')
