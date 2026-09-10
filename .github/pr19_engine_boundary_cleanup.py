from pathlib import Path
import re

# PRODUCT_DOMAIN_MODEL: payload/string/Origin are engine facts; formatting and links are application semantics.
p = Path('docs/PRODUCT_DOMAIN_MODEL.md')
t = p.read_text(encoding='utf-8')
t = t.replace('defines detailed allowlisted fine-grained text formatting, Origin, clipboard, link-holder, and comment-holder behavior.', 'defines detailed fine-grained text, Origin, clipboard, and Range-holder behavior.')
t = t.replace('Formatting is intrinsic metadata of allowlisted fine-grained text. Fine-grained Origin provenance is protected allowlisted fine-grained text metadata that travels with authored text but never inherits from neighboring text. An opaque payload has one payload-level Origin for its current whole value. Comments are external records with repairable text targets. Ordinary selections are transient.', 'Formatting and media syntax are application concerns. Fine-grained Origin provenance is protected metadata that travels with authored allowlisted text but never inherits from neighboring text. An opaque payload has one payload-level Origin for its current whole value. Comments are external records with repairable text targets. Ordinary selections are transient.')
t = t.replace('These concerns share atomic versioning where required, but formatting and Origin do not use a generic external anchor. Internal links, comments, navigation, and later durable reference holders can use the shared Range value for allowlisted fine-grained text without making Range a universal payload, formatting, or provenance entity.', 'Origin and Range lineage share atomic versioning with text where required. Comments, navigation, application links, and later durable reference holders can store or serialize the shared Range value for allowlisted fine-grained text without making Range a universal payload or provenance entity.')
t = t.replace('allowlisted fine-grained text capability\n  authored Unicode text\n  intrinsic formatting marks\n  protected fine-grained origin attribution', 'allowlisted fine-grained text capability\n  native source string\n  protected fine-grained origin attribution')
t = t.replace('An allowlisted fine-grained text payload owns its text, intrinsic formatting, and fine-grained Origin metadata as one canonical collaborative state.', 'An allowlisted fine-grained text payload owns its native source string and fine-grained Origin metadata as canonical collaborative state.')
t = re.sub(r'### 4\.5 allowlisted fine-grained text is canonical collaborative text\n\n.*?### 4\.7 Origin follows payload semantics', '''### 4.5 Allowlisted fine-grained text is canonical source text

An allowlisted fine-grained text payload stores a native source string plus protected fine-grained Origin. For `text/markdown`, the string is Markdown source. For `text/plain`, it is plain source text. The engine does not parse, render, or normalize application syntax merely because a Media Type is allowlisted.

There is no document-level `HardBreak` content item. Line-feed, carriage-return, delimiters, and other characters are text data. Block and InlineContent boundaries add no character.

Formatting, Markdown parsing/rendering, list interpretation, and link interpretation belong to application adapters. A Markdown application can consume recognized structural syntax into the Block tree while leaving inline or unrecognized syntax in the payload string. It can serialize a Coedit Range into a Markdown URL if that application convention is useful. None of these interpretations creates an engine-owned formatting or link object.

The carrier is private behind the document engine. Yjs stable v13 is the provisional implementation default, not a public domain type. The Elaboration carrier gate compares it with Automerge before carrier-dependent implementation and portable encoding are frozen.

### 4.6 Origin follows payload semantics''', t, flags=re.S)
t = t.replace('It is distinct from the Contributor who later copies, moves, formats, pastes, replaces, or restores that material.', 'It is distinct from the Contributor who later copies, moves, pastes, replaces, or restores that material.')
t = t.replace('Ordinary formatting operations cannot create, alter, or erase it. ', '')
t = t.replace('A Range can be stored outside the document, as with a future comment, or embedded as inert target metadata in an intrinsic internal-link mark.', 'A Range can be stored outside the document, as with a future comment, or serialized by an application into a URL, Markdown link destination, navigation record, or other holder.')
t = t.replace('Comments are a primary durable use case for a target outside authored text. Internal links can embed the same Range value as a finer text target while retaining a primary Block fallback. Ordinary selections and remote cursors remain transient. `RANGE_MODEL.md` owns text Range behavior; `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` owns link and comment-holder behavior.', 'Comments are a primary durable use case for a target outside authored text. Applications can also serialize the same Range value into links or navigation metadata and define their own fallback behavior. Ordinary selections and remote cursors remain transient. `RANGE_MODEL.md` owns text Range behavior.')
t = t.replace('28. intrinsic native formatting marks with explicit boundary expansion for allowlisted fine-grained text;\n', '')
t = t.replace('29. protected, non-inheriting fine-grained allowlisted fine-grained text Origin', '28. protected, non-inheriting fine-grained text Origin')
# Renumber is documentation-only; normalize the remainder mechanically.
for old,new in [(30,29),(31,30),(32,31),(33,32),(34,33),(35,34),(36,35),(37,36),(38,37),(39,38),(40,39),(41,40),(42,41)]:
    t = t.replace(f'{old}. ', f'{new}. ')
t = t.replace('11. allowlisted fine-grained text formatting is intrinsic, co-versioned with text, and has explicit boundary semantics.\n12. AI', '11. formatting and media-syntax interpretation remain application concerns rather than engine state.\n12. AI')
t = t.replace('allowlisted fine-grained text has fine-grained collaborative text, intrinsic formatting, protected Origin, and text Range capabilities.', 'allowlisted fine-grained text has native-string collaboration, protected Origin, and text Range capabilities.')
p.write_text(t, encoding='utf-8')

# MVP_IMPLEMENTATION_SPEC: remove formatting carrier/files/operations and link encoding assumptions.
p = Path('docs/MVP_IMPLEMENTATION_SPEC.md')
t = p.read_text(encoding='utf-8')
t = t.replace('for allowlisted fine-grained text formatting, fine-grained Origin, clipboard, and Range-holder behavior;', 'for fine-grained text, Origin, clipboard, and Range-holder behavior;')
t = t.replace('Tiptap/ProseMirror as the interactive allowlisted fine-grained text editor adapter;', 'Tiptap/ProseMirror as an application-level text/Markdown editor adapter;')
t = re.sub(r'The ProseMirror/Tiptap schema applies only to allowlisted fine-grained text.*?The recursive Coedit Block tree remains outside ProseMirror\.', 'ProseMirror/Tiptap is an application adapter. Its schema, Markdown parsing, formatting model, and rendered hierarchy are not canonical engine state. It translates user intent into Block operations and native-string text operations. The recursive Coedit Block tree remains outside ProseMirror.', t, flags=re.S)
t = t.replace('    formatting.ts\n', '')
t = t.replace('At the public human-edit boundary, text creation supplies visible content and formatting intent and the engine assigns Origin from the attributed command context.', 'At the public human-edit boundary, text creation supplies native string content and the engine assigns Origin from the attributed command context.')
t = re.sub(r'allowlisted fine-grained text stores authored Unicode text, intrinsic formatting marks, and protected fine-grained Origin in one atomic collaborative state\..*?Do not persist them as a parallel authority\.\n\n', 'Allowlisted fine-grained text stores a native source string and protected fine-grained Origin. For `text/markdown`, Markdown syntax remains in that string unless the application consumes recognized structural syntax into the Block tree. The engine does not own formatting marks, rendered rich-text state, or link interpretation.\n\n', t, flags=re.S)
t = t.replace('allowlisted fine-grained text also supports fine-grained text and formatting operations;', 'allowlisted fine-grained text also supports fine-grained native-string operations;')
t = re.sub(r'Formatting follows the vocabulary and boundary defaults in `ATTRIBUTED_TEXT_AND_ANNOTATIONS\.md`\..*?Clearing formatting cannot change Origin\.\n\n', '', t, flags=re.S)
t = t.replace('Select Yjs when its Media-Type-labelled payload, attributed-text, and structural carrier passes', 'Select Yjs when its Media-Type-labelled payload, attributed text/Origin, and structural carrier passes')
t = t.replace('including internal-link Block fallback', 'including any application-owned Range holder fallback that Gate C deliberately standardizes')
t = t.replace('- internal-link Range encoding; and\n', '- Range fragment encoding and reinjection; and\n')
t = re.sub(r'Embedded internal-link Range values resolve only in the current document.*?Comment records and repair UX remain post-MVP consumers of the text service\.', 'Applications can store or serialize Range values in comments, URLs, Markdown link destinations, navigation metadata, or other holders. The Range service resolves only the Range value against the application-selected document; holder-specific fallback and activation policy remain outside the engine. Generic opaque sub-content has no Range representation in the MVP.', t, flags=re.S)
t = t.replace('- paste, cut, selection replacement, formatting, undo, and redo are atomic editor actions;', '- paste, cut, selection replacement, undo, and redo are atomic editor actions;')
p.write_text(t, encoding='utf-8')

# RANGE_MODEL: remove intrinsic/internal-link ownership, keep reusable Range value.
p = Path('docs/RANGE_MODEL.md')
t = p.read_text(encoding='utf-8')
t = t.replace('An intrinsic internal-link mark can embed\nthe value in allowlisted fine-grained text. Neither use creates a Range registry, independent\nRange identity, or a document-owned table of retained references.', 'An application can serialize the value into a URL, Markdown link destination, navigation record, or another holder. These uses create no Range registry, independent Range identity, or document-owned table of retained references.')
t = t.replace('An internal allowlisted fine-grained text link always resolves its optional Range or Positional\nRange against the current document. Its primary `BlockId` remains the fallback\nwhen the Range produces no target and the Block still exists.\n\n', '')
t = t.replace('internal-link encoding', 'application-holder Range encoding')
t = t.replace('internal-link fallback', 'application-holder fallback')
t = t.replace('Internal Block-link', 'Application link')
t = t.replace('Internal link', 'Application link')
t = t.replace('internal link', 'application link')
t = t.replace('internal-link', 'application-link')
p.write_text(t, encoding='utf-8')

# MVP_CONTRACT: Range is reusable; links are application-owned.
p = Path('docs/MVP_CONTRACT.md')
t = p.read_text(encoding='utf-8')
t = t.replace('; and embed a Range value as optional internal-link refinement.', '; and make the Range value available for application-owned comments, URLs, links, and navigation metadata.')
t = t.replace('or the internal-link Range encoding', 'or the portable Range-fragment encoding')
t = t.replace('Embed a Range value as same-document internal-link refinement, preserve the primary Block fallback, and round trip it and its creation Version through `.coedit`. The application composes external deep links from a document URI and Range fragment.', 'Round trip the Range and its creation Version through `.coedit`. The application can compose links from its own document URI plus a serialized Range fragment and owns any fallback or activation policy.')
p.write_text(t, encoding='utf-8')

# Architecture: remove the last awkward wording and make application formatting explicit.
p = Path('docs/MVP_ARCHITECTURE.md')
t = p.read_text(encoding='utf-8')
t = t.replace('Attributed allowlisted fine-grained text, durable text Range behavior', 'Fine-grained text attribution, durable text Range behavior')
t = t.replace('The client can request ordinary editing intent but cannot assign arbitrary Origin through formatting or raw carrier updates.', 'The client can request ordinary editing intent but cannot assign arbitrary Origin or submit raw carrier updates.')
t = t.replace('every live fine-grained allowlisted fine-grained text unit', 'every live fine-grained text unit')
p.write_text(t, encoding='utf-8')

# Work order: remove remaining engine formatting references and intrinsic-link assumptions.
p = Path('SCAFFOLDING_PLAN.md')
t = p.read_text(encoding='utf-8')
t = t.replace('Formatting and media syntax are application concerns; fine-grained text Origin is protected content-native metadata;', 'Formatting and media syntax are application concerns; fine-grained text Origin is protected content-native metadata;')
t = t.replace('text editor integration', 'application text-editor integration')
t = t.replace('the internal-link Range wire shape', 'the portable Range-fragment wire shape')
t = t.replace('internal-link wire decisions', 'Range-holder wire decisions')
t = t.replace('internal-link fallback', 'application-holder fallback')
p.write_text(t, encoding='utf-8')

# Verification and collaboration summaries: no formatting operation is an engine invariant.
for name in ['docs/MVP_VERIFICATION_PLAN.md', 'docs/COLLABORATION_MODEL.md', 'docs/BROWSER_PERSISTENCE.md', 'docs/PORTABLE_DOCUMENT_FORMAT.md']:
    p = Path(name)
    t = p.read_text(encoding='utf-8')
    t = t.replace('fine-grained text formatting', 'fine-grained text')
    t = t.replace('allowlisted fine-grained text formatting/fine-grained Origin', 'allowlisted fine-grained text/Origin')
    t = t.replace('concurrent text insert, delete, formatting, Block move', 'concurrent text insert, delete, Block move')
    t = t.replace('copy, paste, formatting clear, or restore', 'copy, paste, or restore')
    t = t.replace('formatting clear', 'text edit')
    t = t.replace('formatting,', '')
    t = t.replace('formatting and ', '')
    p.write_text(t, encoding='utf-8')

# Assert current authorities contain no positive engine-owned formatting/link model.
checks = {
    'docs/PRODUCT_DOMAIN_MODEL.md': ['intrinsic formatting', 'Formatting marks commit', 'intrinsic internal-link', 'typed internal Block link'],
    'docs/MVP_IMPLEMENTATION_SPEC.md': ['Formatting follows the vocabulary', 'fine-grained text and formatting operations', 'intrinsic formatting marks', 'Embedded internal-link'],
    'docs/RANGE_MODEL.md': ['intrinsic internal-link', 'primary `BlockId` remains the fallback'],
    'docs/MVP_CONTRACT.md': ['intrinsic formatting marks', 'owns intrinsic formatting'],
}
for name, needles in checks.items():
    text = Path(name).read_text(encoding='utf-8')
    bad = [n for n in needles if n in text]
    if bad:
        raise SystemExit(f'{name}: stale engine semantics: {bad}')
