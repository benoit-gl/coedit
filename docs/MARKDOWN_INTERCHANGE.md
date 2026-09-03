# Markdown interchange specification

**Status:** Accepted MVP interchange contract.

## 1. Purpose and authority

This document defines Markdown import, export, diagnostics, and the Markdown round-trip contract for the document-engine MVP.

The input dialect is CommonMark plus GitHub Flavored Markdown (GFM). Markdown is an interchange and rendering format. It is not the lossless Coedit recovery format.

`PRODUCT_DOMAIN_MODEL.md` controls domain meaning. `MVP_CONTRACT.md` controls the MVP proof boundary. `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` controls formatting and Origin behavior. `MVP_IMPLEMENTATION_SPEC.md` controls implementation details that are not defined here. `CAPACITY_AND_PERFORMANCE_TARGETS.md` controls cross-cutting capacity semantics. This document owns the exact Markdown hostile-input guard values below.

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

The invariant also does not require every arbitrary Coedit tree to be exactly representable in Markdown. A Coedit document can contain structures or metadata outside the canonical Markdown-representable subset. Export of those constructs must report stable diagnostics and must not claim exact structural interchange.

## 3. Coedit equivalence for this contract

For Markdown round-trip verification, two Coedit documents are equivalent when they have the same normalized semantic document shape produced by the importer:

- the same Block topology;
- the same sibling order;
- the same `childrenPresentation` values;
- the same number and order of InlineContents per Block;
- the same semantic inline text, hard breaks, intrinsic formatting marks, mark-boundary policies, and preserved link metadata; and
- the same importer normalization semantics where a source construct requires normalization.

Generated IDs, Contributor IDs, Origin IDs, Contribution IDs, VersionTokens, timestamps, carrier internal identities, encoded update-byte order, and source-file metadata are not part of Markdown structural equivalence.

Exact comparison of collaborative state belongs to `.coedit` recovery, not to this Markdown interchange invariant.

## 4. Import architecture

Use a maintained Markdown AST parser. The initial implementation uses `unified`, `remark-parse`, and `remark-gfm`.

Do not parse document structure with regular expressions.

Separate pure planning from engine mutation. The planner receives Markdown bytes and source metadata, then produces ordinary document operations plus diagnostics. A separate application service creates a candidate document engine and submits one atomic import Contribution.

The initial importer creates a new document. It does not merge Markdown into an already open document.

The UX obtains a free-form human Contributor display name before document-session creation. Import creates an imported or unknown Origin agent/record for source material. The import Contribution is attributed to the human or system Contributor that performed the import; a source file is not impersonated as the operation actor. Available source name/hash and any separately supported author claims are derivation metadata.

## 5. Source handling

Decode source as UTF-8 with fatal error handling. Permit one optional UTF-8 BOM. Normalize CRLF and CR to LF before parsing.

`sourceName` is display metadata only. Retain a basename, not an absolute local path.

Treat Markdown input as hostile. The first importer uses these resource guards:

- 10 MiB UTF-8 source bytes;
- 200,000 Markdown AST nodes;
- source nesting depth 100; and
- source names of 255 Unicode code points and 1 KiB UTF-8.

These values protect the importer implementation. They are not Markdown or Coedit semantic maxima. This document is the direct owner of the exact guard values. Revise them from parser profiling, target-device measurements, interoperability work, and later usage evidence.

Do not add a separate generated-Block count guard. The resulting document is limited by semantic validity and the actual resources of the running implementation, not by a Markdown-specific document-size maximum.

Invalid UTF-8 is a source-format error. Resource exhaustion or an exceeded importer guard is a capacity error. Either failure occurs before the active document is replaced.

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
text                  -> text range
hard break            -> hard break
CommonMark soft break -> one ordinary space
emphasis              -> intrinsic italic mark
strong                -> intrinsic bold mark
delete                -> intrinsic strikethrough mark
inline code           -> intrinsic inline-code mark
link                  -> intrinsic link mark with opaque destination metadata
```

The importer and exporter use the intrinsic formatting vocabulary and boundary defaults in `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`. The selected collaborative carrier's native marks are canonical; ProseMirror and Markdown remain adapters/projections.

Markdown link destinations are preserved as opaque bounded link metadata. The importer does not classify destinations as safe or unsafe and does not decide whether they are URLs, commands, citations, or activatable targets. A renderer or integration that activates the metadata applies its own policy at that boundary.

Raw HTML remains literal fallback under this contract and is never rendered with `innerHTML`. If a later design introduces a raw-HTML/HAST rendering path, apply an allowlist sanitizer such as `rehype-sanitize` after the last unsafe HAST transform. DOMPurify or equivalent remains the DOM/clipboard boundary sanitizer, not the Markdown structural parser.

## 9. Unsupported source preservation

Unsupported source must not disappear silently.

When a source node has a usable normalized source slice, preserve that exact slice as plain authored text and produce a warning that identifies the lost presentation. Do not add a durable tag whose only meaning is that the current Markdown importer could not represent the original syntax. For an unsupported block node, preserve the complete source slice in one terminal InlineContent. For an unsupported inline node, preserve that node's source slice as literal text inside the containing InlineContent.

Initially apply this fallback to:

- fenced or indented code blocks;
- tables;
- block quotes;
- images;
- raw HTML;
- thematic breaks;
- unknown block constructs;
- unsupported inline constructs; and

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
- future overlays such as comments or conversations; and
- future presentation modes with no importer mapping.

## 12. Required round-trip tests

Every successfully imported fixture must run the complete property:

```text
import(Markdown A) = Coedit X
export(Coedit X) = Markdown B
import(Markdown B) = Coedit Y
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
- emphasis, strong, strikethrough, inline code, hard breaks, and links with opaque destination metadata;
- task markers and non-one ordered-list starts;
- unsupported block constructs that use literal fallback; and
- opaque link destinations and unsupported inline constructs.

Include one golden fixture that contains introductory paragraphs, a list, and subsections under the same heading. It must prove both importer grouping and exporter inversion.

Origin and derivation are intrinsic Coedit metadata but deliberately absent from ordinary Markdown. Their omission does not make every Markdown export warn: Markdown is already declared non-lossless for these fields. If a caller explicitly requests provenance-preserving export, return a stable non-representability diagnostic rather than implying that Markdown preserves it.

Re-imported Markdown receives new imported/unknown Origin. Origin equality is therefore intentionally outside the Markdown round-trip relation.

## 13. Non-goals

Markdown interchange does not preserve:

- Coedit History;
- Contributors or attribution;
- Version identity;
- semantic Checkpoints;
- command idempotency data;
- exact CRDT identities or update bytes;
- browser-storage metadata; or
- Origin/provenance, comments, or discussions.

Use `.coedit` for lossless recovery of those capabilities.
