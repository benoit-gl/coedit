from pathlib import Path
import re

files = [
    Path('README.md'), Path('SCAFFOLDING_PLAN.md'),
    Path('docs/MVP_ARCHITECTURE.md'), Path('docs/MVP_CONTRACT.md'),
    Path('docs/MVP_IMPLEMENTATION_SPEC.md'), Path('docs/MVP_VERIFICATION_PLAN.md'),
    Path('docs/COLLABORATION_MODEL.md'), Path('docs/MARKDOWN_INTERCHANGE.md'),
    Path('docs/PRODUCT_DOMAIN_MODEL.md'), Path('docs/PRESERVED_BRANCH_RECONCILIATION.md'),
    Path('docs/PORTABLE_DOCUMENT_FORMAT.md'), Path('docs/BROWSER_PERSISTENCE.md'),
    Path('docs/CAPACITY_AND_PERFORMANCE_TARGETS.md'), Path('docs/RANGE_MODEL.md'),
    Path('docs/TEXT_POSITION_MODEL.md'), Path('docs/STRUCTURAL_CARRIER_MODEL.md'),
    Path('docs/README.md'), Path('docs/decisions/0010-typed-inline-content-payloads.md'),
    Path('docs/decisions/README.md'),
]

repls = [
    ('attributed fine-grained text behavior', 'fine-grained text and attribution behavior'),
    ('attributed collaborative text', 'fine-grained collaborative text'),
    ('Attributed collaborative text', 'Fine-grained collaborative text'),
    ('intrinsic fine-grained text formatting and protected fine-grained Origin for both allowlisted types', 'protected fine-grained Origin and native-string editing for both allowlisted types'),
    ('intrinsic formatting and protected non-inheriting Origin', 'protected non-inheriting fine-grained Origin'),
    ('intrinsic formatting, and protected non-inheriting Origin', 'protected non-inheriting fine-grained Origin'),
    ('intrinsic allowlisted fine-grained text formatting and protected, non-inheriting fine-grained Origin semantics', 'protected, non-inheriting fine-grained text Origin semantics'),
    ('allowlisted fine-grained text canonical text state, intrinsic formatting, and protected fine-grained Origin', 'allowlisted native-string text state and protected fine-grained Origin'),
    ('allowlisted fine-grained text formatting/fine-grained Origin', 'allowlisted fine-grained text/Origin state'),
    ('allowlisted fine-grained text additionally supports fine-grained collaborative text,\n  formatting, and Origin operations', 'allowlisted fine-grained text additionally supports native-string collaborative text and fine-grained Origin operations'),
    ('text and formatting cannot publish in mismatched state', 'text and its fine-grained Origin cannot publish in mismatched state'),
    ('ordinary formatting cannot alter it', 'ordinary text operations cannot spoof or alter existing Origin'),
    ('text, formatting, or whole-payload replacement', 'text or whole-payload replacement'),
    ('structural, text, opaque-payload replacement, and formatting changes', 'structural, text, and opaque-payload replacement changes'),
    ('exact text/formatting/Origin state', 'exact text/Origin state'),
    ('text + formatting + Origin atomically', 'text + Origin atomically'),
    ('text-plus-formatting-plus-Origin contract', 'text-plus-Origin contract'),
    ('paste/cut/replacement/formatting/undo/redo', 'paste/cut/replacement/undo/redo'),
    ('paste, cut, selection\nreplacement, formatting, undo, and redo', 'paste, cut, selection\nreplacement, undo, and redo'),
    ('text, formatting, Origin, and Contribution', 'text, Origin, and Contribution'),
    ('formatting, Origins, History semantics', 'Origins, History semantics'),
    ('formatting, Origins, source document/Version', 'Origins, source document/Version'),
    ('Formatting uses native collaborative marks inside allowlisted fine-grained text payloads; ', 'Formatting and media syntax are application concerns; '),
    ('formatting uses native collaborative marks inside allowlisted fine-grained text payloads; ', 'formatting and media syntax are application concerns; '),
    ('rich allowlisted fine-grained text', 'allowlisted fine-grained text'),
    ('rich-text editor', 'text editor'),
    ('rich-text', 'text'),
]

for path in files:
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    original = text
    for a, b in repls:
        text = text.replace(a, b)
    path.write_text(text, encoding='utf-8')

# Architecture-specific canonical editor boundary cleanup.
p = Path('docs/MVP_ARCHITECTURE.md')
t = p.read_text(encoding='utf-8')
t = t.replace('The text editor boundary is specifically for allowlisted fine-grained text. Conceptually:', 'The fine-grained text editor boundary is specifically for allowlisted text. Conceptually:')
t = re.sub(r'interface CoeditTextEditorContentValue \{.*?\n\}\n```\n\n`DetachedCoeditText` contains.*?carrier-neutral at the public boundary\.', '''interface CoeditTextEditorContentValue {
  readonly inlineContentId: InlineContentId;
  readonly mediaType: string;
  readonly text: string;
  readonly origins: DetachedTextOriginState;
}
```

The value contains the exact supplied Media Type, the current native string, and detached protected Origin information required for correct attributed editing. It contains no engine-owned formatting, parsed Markdown, rendered tree, or document-level `HardBreak` value.''', t, flags=re.S)
t = t.replace('The editor adapter can reconstruct or bind transient ProseMirror/Tiptap/carrier state from this value or a controlled engine session.', 'The application editor can parse or render the source string and can reconstruct or bind transient editor/carrier state from this value or a controlled engine session.')
t = t.replace('Do not expose a live engine-owned Y.Doc/Automerge object, a formatting-only side channel, an Origin mutation side channel, or a generic payload capability registry', 'Do not expose a live engine-owned Y.Doc/Automerge object, an Origin mutation side channel, or a generic payload capability registry')
t = t.replace('engine validates text + formatting + Origin atomically', 'engine validates text + Origin atomically')
p.write_text(t, encoding='utf-8')

# Markdown interchange: structural syntax becomes structure; inline/unconsumed syntax stays source text.
p = Path('docs/MARKDOWN_INTERCHANGE.md')
t = p.read_text(encoding='utf-8')
t = t.replace('`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` controls `text/markdown` fine-grained text formatting and fine-grained Origin behavior.', '`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` controls fine-grained text editing and Origin behavior. Formatting and Markdown interpretation belong to this application/interchange layer.')
t = t.replace('- the same semantic Unicode text, intrinsic formatting marks, mark-boundary policies, and preserved link metadata; and', '- the same normalized `text/markdown` source strings after recognized structural syntax is consumed; and')
t = t.replace('The initial importer creates a new document. It does not merge Markdown into an already open document.\n\nMarkdown textual source creates `text/markdown` fine-grained text payloads.', 'The initial importer creates a new document. It does not merge Markdown into an already open document.\n\nRecognized structural Markdown syntax is translated into Coedit Block structure and is not duplicated inside the payload string. Inline syntax and any syntax not consumed structurally remain literal Markdown source in `text/markdown` payloads. Markdown textual source creates `text/markdown` fine-grained text payloads.')
start = t.index('## 8. Supported inline mapping')
end = t.index('## 9. Unsupported source preservation')
section = '''## 8. Inline source preservation and application rendering

The document engine does not own an inline Markdown AST or formatting marks. After structural import consumes syntax such as headings, list containers, and list-item markers, the remaining inline source stays in the `text/markdown` payload as Markdown text.

For example, source equivalent to a list item containing `hello **world**` becomes a list-item Block whose payload contains `hello **world**`. The list marker is represented by structure; the emphasis delimiters remain source text. This avoids encoding the same structural fact twice while keeping inline Markdown available to application renderers.

CommonMark soft/hard line-break spelling, emphasis, strong text, strikethrough, inline code, links, raw inline HTML, and other inline constructs are therefore application/interchange syntax. The importer can normalize source spelling only where this specification explicitly requires a deterministic round trip; otherwise it preserves the source slice. A renderer can parse and display that syntax but does not thereby change canonical engine state.

Markdown link destinations remain ordinary Markdown source. The application decides whether a destination is external, document-local, a serialized Coedit Range reference, or another URI. The document engine does not create an intrinsic link object or classify link targets.

Block and InlineContent boundaries still add no characters. If a Markdown construct requires an actual newline character inside one payload, that character is stored as source text. The application owns the mapping between editor actions, Markdown source spelling, and structural operations.

'''
t = t[:start] + section + t[end:]
t = t.replace('Use deterministic spelling for headings, lists, links, inline formatting, U+000A hard breaks, and blank-line separation.', 'Use deterministic spelling for structural headings/lists and for any inline syntax that the interchange layer deliberately normalizes. Preserve or regenerate payload Markdown source without consulting engine-owned formatting state.')
t = t.replace('- emphasis, strong, strikethrough, inline code, hard breaks represented as U+000A, and links with opaque destination metadata;\n- soft breaks normalized to one space;', '- inline Markdown such as emphasis, strong text, strikethrough, inline code, links, and line-break syntax preserved in payload source;')
t = t.replace('- opaque link destinations and unsupported inline constructs.', '- link destinations and unsupported inline constructs preserved as Markdown source.')
p.write_text(t, encoding='utf-8')

# MVP contract: remove formatting as an engine capability.
p = Path('docs/MVP_CONTRACT.md')
t = p.read_text(encoding='utf-8')
t = t.replace('Edit canonical allowlisted fine-grained text, intrinsic formatting, and protected fine-grained Origin through the engine command boundary.', 'Edit canonical allowlisted native-string text with protected fine-grained Origin through the engine command boundary.')
t = re.sub(r'allowlisted fine-grained text contains authored Unicode text, intrinsic formatting marks, and protected fine-grained Origin attribution\..*?Formatting commands cannot erase or rewrite Origin\.\n\n', 'Allowlisted fine-grained text contains a native source string and protected fine-grained Origin attribution. The engine does not parse or render Markdown, own formatting marks, or interpret links. Application/editor/interchange layers own those semantics. New fine-grained text Origin is assigned by the trusted engine/import boundary and never inherited from neighboring text.\n\n', t, flags=re.S)
t = t.replace('- allowlisted fine-grained text owns intrinsic formatting and protected fine-grained Origin;', '- allowlisted fine-grained text owns native-string content and protected fine-grained Origin;')
t = t.replace('Clearing formatting preserves Origin. ', '')
t = t.replace('exact text/formatting/Origin state', 'exact text/Origin state')
p.write_text(t, encoding='utf-8')

# ADR: record the now-settled engine/application formatting boundary.
p = Path('docs/decisions/0010-typed-inline-content-payloads.md')
t = p.read_text(encoding='utf-8')
t = t.replace('plus Coedit collaboration metadata such as intrinsic formatting and\nfine-grained Origin.', 'plus Coedit collaboration metadata such as fine-grained Origin and Range lineage.')
t = t.replace('Intrinsic Coedit formatting and Origin metadata can accompany both initial\nallowlisted text formats. That collaboration metadata is part of `.coedit` state;\nit is not necessarily representable in the raw `text/markdown` or `text/plain`\nbyte stream.', 'Fine-grained Origin and Range lineage can accompany both initial allowlisted text formats. Formatting, Markdown parsing/rendering, and link interpretation are application concerns. For `text/markdown`, inline formatting is represented by Markdown source syntax when present, not by a parallel engine-owned mark model.')
t += '\n\n### 3.9 Formatting and media syntax belong to the application\n\nThe document engine is agnostic to formatting. It owns structural relationships, payload Media Types, payload content, attribution/History/Range mechanics, serialization, and collaboration. It does not own bold/italic/link/list rendering semantics or a parallel rich-text mark layer.\n\nA Markdown importer can consume recognized structural syntax into the Block tree while preserving unconsumed inline or unknown syntax in the `text/markdown` source string. Editors can translate user actions into structural operations and source-string edits. Renderers can parse the resulting hierarchy and payload syntax. These are application behaviors, not canonical document-engine semantics.\n'
p.write_text(t, encoding='utf-8')

# Work-order targeted cleanup.
p = Path('SCAFFOLDING_PLAN.md')
t = p.read_text(encoding='utf-8')
t = t.replace('Formatting and media syntax are application concerns; fine-grained text Origin is protected content-native metadata;', 'Formatting and media syntax are application concerns; fine-grained text Origin is protected content-native metadata;')
t = t.replace('- intrinsic fine-grained text formatting and protected fine-grained Origin for both allowlisted types;', '- protected fine-grained Origin and native-string editing for both allowlisted types;')
t = t.replace('Allowlisted text additionally supports native-string fine-grained editing, intrinsic formatting, and protected non-inheriting Origin.', 'Allowlisted text additionally supports native-string fine-grained editing and protected non-inheriting Origin.')
t = t.replace('one active text editor preserves canonical allowlisted fine-grained text, intrinsic marks, and protected fine-grained Origin', 'one active text editor preserves canonical allowlisted source text and protected fine-grained Origin')
p.write_text(t, encoding='utf-8')

# Assert that current-authority files do not retain the rejected engine-formatting model.
checks = {
    'docs/MVP_ARCHITECTURE.md': ['intrinsic formatting', 'native formatting semantics', 'text-plus-formatting-plus-Origin', 'formatting-only side channel'],
    'docs/MVP_CONTRACT.md': ['intrinsic formatting marks', 'owns intrinsic formatting', 'Formatting has explicit insertion-boundary behavior'],
    'docs/MARKDOWN_INTERCHANGE.md': ['intrinsic italic mark', 'intrinsic bold mark', 'intrinsic link mark', "carrier's native marks are canonical"],
    'SCAFFOLDING_PLAN.md': ['intrinsic fine-grained text formatting'],
}
for name, needles in checks.items():
    text = Path(name).read_text(encoding='utf-8')
    bad = [n for n in needles if n in text]
    if bad:
        raise SystemExit(f'{name}: stale engine-formatting assumptions: {bad}')
