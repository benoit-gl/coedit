# Markdown interchange specification

**Status:** Accepted MVP interchange contract.

## 1. Purpose and authority

This document defines Markdown import, Markdown export, diagnostics, and the Markdown round-trip contract for the document-engine MVP.

The input dialect is CommonMark plus GitHub Flavored Markdown (GFM). Markdown is an interchange and rendering format. It is not the lossless Coedit recovery format.

`PRODUCT_DOMAIN_MODEL.md` controls domain meaning. `MVP_CONTRACT.md` controls the MVP proof boundary. `MVP_IMPLEMENTATION_SPEC.md` controls implementation details that are not defined here.

## 2. Core round-trip invariant

The normal workflow is:

```text
arbitrary Markdown A
  -> import
  -> Coedit X
  -> export
  -> Markdown B
  -> import
  -> Coedit Y
```

For every successfully imported Markdown document, `X` and `Y` must be equivalent after normalization.

The invariant does **not** require `Markdown A` and `Markdown B` to be textually equal. Export may canonicalize whitespace, heading syntax, list markers, emphasis delimiters, or other Markdown spelling.

The invariant also does not require every arbitrary Coedit tree to be exactly representable in Markdown. A Coedit document can contain structures or metadata that are outside the canonical Markdown-representable subset. Export of those constructs must report stable diagnostics and must not claim exact structural interchange.

## 3. Coedit equivalence for this contract

For Markdown round-trip verification, two Coedit documents are equivalent when they have the same normalized semantic document shape produced by the importer:

- the same Block topology;
- the same sibling order;
- the same `childrenPresentation` values;
- the same number and order of InlineContents per Block;
- the same application-significant tags created by Markdown import;
- the same semantic inline text, hard breaks, formatting ranges, and safe link destinations; and
- the same importer diagnostics that describe required normalization of the source construct where those diagnostics are part of the normalized import result.

Generated IDs, Contributor IDs, Contribution IDs, VersionTokens, timestamps, Yjs internal identities, encoded update-byte order, and source-file metadata are not part of Markdown structural equivalence.

Exact comparison of rich-text collaborative state belongs to `.coedit` recovery, not to this Markdown interchange invariant.

## 4. Import architecture

Use a maintained Markdown AST parser. The initial implementation uses `unified`, `remark-parse`, and `remark-gfm`.

Do not parse document structure with regular expressions.

Separate pure planning from engine mutation. The planner receives Markdown bytes and source metadata, then produces ordinary document operations plus diagnostics. A separate application service creates a candidate document engine and submits one atomic import Contribution.

The initial importer creates a new document. It does not merge Markdown into an already open document.

The UX obtains a free-form human Contributor display name before document-session creation. Import creates an additional imported Contributor for the source. The import Contribution is attributed to that imported Contributor.

## 5. Source handling

Decode source as UTF-8 with fatal error handling. Permit one optional UTF-8 BOM. Normalize CRLF and CR to LF before parsing.

`sourceName` is display metadata only. Retain a basename, not an absolute local path.

The initial import limits are:

- 10 MiB UTF-8 source;
- 200,000 Markdown AST nodes;
- 50,000 generated Blocks;
- source nesting depth 100;
- 1,000,000 Unicode code points in one InlineContent; and
- source name at most 255 Unicode code points and 1 KiB UTF-8.

Invalid UTF-8 or an exceeded limit rejects the import before the active document is replaced.

## 6. Heading and section construction

Use one real root Block.

A first H1 becomes root content only when it is the first manuscript AST child after BOM and blank-line handling. If consumed as the root title, treat it as heading depth 1 for skipped-level diagnostics. Otherwise the root has heading depth 0.

Each later H1 attaches to the root. Each other heading attaches to the nearest open lower-depth heading. A skipped heading level creates no synthetic heading and produces `heading-level-skipped`.

An empty heading creates one InlineContent with empty text.

For a root or section that contains both body material and subsections:

- body material becomes direct `flow` children;
- subsections go in one transparent contentless grouping Block with `childrenPresentation="sections"`;
- the owner uses `flow`; and
- the subsection group follows the body material.

If a root or section contains subsections and no body material, it can use `sections` directly.

This construction is the canonical Markdown-representable Coedit structure. Export must invert this construction for imported or equivalent documents.

## 7. Supported block mapping

Use these initial mappings:

```text
paragraph                 -> terminal Block with one InlineContent
unordered list            -> transparent grouping Block with bullets children
ordered list              -> transparent grouping Block with numbers children
list item first paragraph -> list-item InlineContent
remaining item material   -> flow children of the list item
nested list               -> transparent list grouping among those flow children
```

A list item with no leading paragraph receives one empty InlineContent.

An ordered list whose start is not one is normalized to one and produces `ordered-list-start-normalized` until explicit start-number semantics exist.

GFM task markers are preserved as literal `[ ]` or `[x]` prefixes and produce `task-marker-literalized`.

## 8. Supported inline mapping

The Markdown interchange model supports:

```text
text              -> text range
hard break        -> hard break
CommonMark soft break -> one ordinary space
emphasis          -> italic Formatting range
strong            -> bold Formatting range
delete            -> strikethrough Formatting range
inline code       -> inline-code Formatting range
link               -> link Formatting range with safe href
```

Formatting is a logical external `RangeAnnotation<Formatting>` over opaque `TextAnchor` endpoints. This specification does not choose the concrete TextAnchor representation.

The importer and exporter must use the same logical formatting vocabulary. They must not make ProseMirror/Yjs marks a separate domain authority.

Safe links are `http`, `https`, `mailto`, same-document fragments, and relative references. Reject control characters and unsafe explicit schemes from the formatting model.

## 9. Unsupported source preservation

Unsupported source must not disappear silently.

When a source node has a usable normalized source slice, preserve that exact slice as plain text in one terminal InlineContent tagged `import:markdown-literal`. Produce a warning that identifies the lost presentation.

Initially apply this fallback to:

- fenced or indented code blocks;
- tables;
- block quotes;
- images;
- raw HTML;
- thematic breaks;
- unknown block constructs;
- unsupported inline constructs; and
- unsafe links.

If an unsupported source node has no usable source offsets, reject the import with `unsupported-node-without-source`.

## 10. Import diagnostics

Use stable machine-readable diagnostics with at least:

```ts
interface ImportDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly nodeKind: string;
  readonly source: {
    readonly startOffset: number;
    readonly endOffset: number;
    readonly line: number;
    readonly column: number;
  };
  readonly action: "preserved" | "normalized" | "rejected";
}
```

Initial codes include:

- `heading-level-skipped`;
- `ordered-list-start-normalized`;
- `task-marker-literalized`;
- `unsafe-link-literalized`;
- `unsupported-node-literalized`; and
- `unsupported-node-without-source`.

Message text is not a machine identifier.

## 11. Export contract

Export accepts an explicit VersionToken plus optional lens and subtree selection. It returns Markdown and stable export diagnostics. The renderer has no file, clipboard, or browser-storage authority.

For a document inside the canonical Markdown-representable subset, export must invert the import construction so that re-import produces an equivalent normalized Coedit document.

Export can choose canonical Markdown spelling. Use deterministic spelling for headings, lists, links, inline formatting, hard breaks, and blank-line separation.

For a Coedit construct that the importer cannot reconstruct exactly, export must produce a stable diagnostic. The renderer must not claim an exact Markdown round trip for that selection.

Examples include:

- application or user tags with no Markdown representation;
- multiple simultaneously selected InlineContents for one Block;
- a structural grouping that is valid Coedit but not produced by the Markdown importer;
- future overlays such as comments, conversations, or provenance; and
- future presentation modes with no importer mapping.

## 12. Required round-trip tests

Every successfully imported fixture must run the complete property:

```text
import(Markdown A) = Coedit X
export(Coedit X) = Markdown B
aimport(Markdown B) = Coedit Y
assert markdownEquivalent(X, Y)
```

The test suite must include at least:

- a conventional essay;
- a document with and without an initial H1 title;
- several top-level headings;
- skipped heading levels;
- paragraphs before the first heading;
- mixed introductory body plus subsections;
- ordered, unordered, and nested lists;
- empty headings and empty list items;
- emphasis, strong, strikethrough, inline code, hard breaks, and safe links;
- task markers and non-one ordered-list starts;
- unsupported block constructs that use literal fallback; and
- unsafe links and unsupported inline constructs.

Include one golden fixture that contains introductory paragraphs, a list, and subsections under the same heading. It must prove both importer grouping and exporter inversion.

## 13. Non-goals

Markdown interchange does not preserve:

- Coedit History;
- Contributors or attribution;
- Version identity;
- semantic checkpoints;
- command idempotency data;
- exact CRDT identities or update bytes;
- browser-storage metadata; or
- future provenance/comments/discussions.

Use `.coedit` for lossless recovery of those capabilities.
