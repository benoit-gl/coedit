# Markdown interchange specification

**Status:** Accepted MVP interchange contract.

## 1. Purpose and authority

This document defines Markdown import, export, diagnostics, and the Markdown round-trip contract for the document-engine MVP.

The input dialect is CommonMark plus GitHub Flavored Markdown (GFM). Markdown is an interchange and rendering format. It is not the lossless Coedit recovery format.

`PRODUCT_DOMAIN_MODEL.md` controls domain meaning. `INLINE_CONTENT_PAYLOADS.md` controls InlineContent Media Types and generic payload behavior. `MVP_CONTRACT.md` controls the MVP proof boundary. `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` controls fine-grained text editing and Origin behavior. Formatting and Markdown interpretation belong to this application/interchange layer. `MVP_IMPLEMENTATION_SPEC.md` controls implementation details that are not defined here. `CAPACITY_AND_PERFORMANCE_TARGETS.md` controls cross-cutting capacity semantics and contract maturity. This document owns Markdown hostile-input behavior, Markdown-to-`text/markdown` fine-grained text normalization, experimental guard candidates, and the guards selected during Step 7.

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

The invariant does **not** require `Markdown A` and `Markdown B` to be textually equal. Export may canonicalize structural Markdown spelling that the importer has already consumed into Block structure, such as heading markers, list markers, and structural blank-line layout. It may also apply a source normalization that this specification explicitly defines. It must otherwise preserve the canonical inline Markdown source stored in each `text/markdown` payload. In particular, export does not silently rewrite emphasis delimiters, inline-code delimiters, link spelling, or soft/hard line-break spelling merely to choose a preferred Markdown style.

The invariant also does not require every arbitrary Coedit tree or Media Type to be exactly representable in Markdown. A Coedit document can contain structures, opaque payloads, or metadata outside the canonical Markdown-representable subset. Export of those constructs must report stable diagnostics and must not claim exact structural interchange.

## 3. Coedit equivalence for this contract

For Markdown round-trip verification, two Coedit documents are equivalent when they have the same normalized semantic document shape produced by the importer:

- the same Block topology;
- the same sibling order;
- the same `childrenPresentation` values;
- the same number and order of InlineContents per Block;
- the exact imported text Media Type `text/markdown; charset=UTF-8` for every imported textual InlineContent;
- the same normalized `text/markdown` source strings after recognized structural syntax is consumed; and
- the same importer normalization semantics where this specification explicitly requires source normalization.

There is no separate hard-break content item in this relation. Markdown line-break spelling remains source syntax unless this specification explicitly defines a normalization for it or the application deliberately translates it during later editing. A structural Block or InlineContent boundary contributes no character merely because the boundary exists.

Generated IDs, Contributor IDs, Origin IDs, Contribution IDs, VersionTokens, timestamps, carrier internal identities, encoded update-byte order, and source-file metadata are not part of Markdown structural equivalence.

Exact comparison of collaborative state and opaque payload bytes belongs to `.coedit` recovery, not to this Markdown interchange invariant.

## 4. Import architecture

Use a maintained Markdown AST parser. The initial implementation uses `unified`, `remark-parse`, and `remark-gfm`.

Do not parse document structure with regular expressions.

Separate pure planning from engine mutation. The planner receives Markdown bytes and source metadata, then produces ordinary document operations plus diagnostics. A separate application service creates a candidate document engine and submits one atomic import Contribution.

The initial importer creates a new document. It does not merge Markdown into an already open document.

Recognized structural Markdown syntax is translated into Coedit Block structure and is not duplicated inside the payload string. Inline syntax and any syntax not consumed structurally remain literal Markdown source in `text/markdown` payloads. Markdown textual source creates fine-grained text payloads with the exact initial Media Type `text/markdown; charset=UTF-8`. The importer does not infer or manufacture opaque payloads from Markdown syntax under this contract.

The UX obtains a free-form human Contributor display name before document-session creation. Import creates an imported or unknown Origin agent/record for source material. The import Contribution is attributed to the human or system Contributor that performed the import; a source file is not impersonated as the operation actor. Available source name/hash and any separately supported author claims are derivation metadata.

## 5. Source handling

Decode source as UTF-8 with fatal error handling. Permit one optional UTF-8 BOM. Normalize CRLF and CR to LF before parsing.

This source-byte newline normalization is an interchange rule. It does not imply that the generic `text/markdown` fine-grained text payload rejects carriage-return characters supplied through another valid application path.

The importer always labels imported textual payloads `text/markdown; charset=UTF-8`. It therefore does not need arbitrary charset conversion. A later import format or caller that supplies another declared charset uses the generic payload processor contract rather than silently relabelling the bytes as UTF-8.

`sourceName` is display metadata only. Retain a basename, not an absolute local path.

Treat Markdown input as hostile. The Step 7 importer cannot ship until it has
selected and tested guards for dangerous byte, parser, tree, and metadata work.

**Maturity:** Experimental guard candidates; final selection pending.

**Owner:** This document.

**Promotion gate:** Step 7 Markdown implementation and profiling.

Use these values as initial characterization points:

- 10 MiB UTF-8 source bytes;
- 200,000 Markdown AST nodes;
- source nesting depth 100; and
- 1 KiB UTF-8 source-name metadata.

These candidates do not define current acceptance, rejection, compatibility, or
correctness-test thresholds. Step 7 records the parser version, target
environment, raw and decoded resource behavior, selected values, failure
behavior, and boundary tests before promoting any value to a frozen
implementation guard. The selected guards are not Markdown or Coedit semantic
maxima.

Do not add a separate generated-Block count guard. The resulting document is limited by semantic validity and the actual resources of the running implementation, not by a Markdown-specific document-size maximum.

Invalid UTF-8 is a source-format error. Resource exhaustion or an exceeded
selected importer guard is a capacity error. Either failure occurs before the
active document is replaced.

Step 7 must define a top-level import-failure result that distinguishes those
categories without requiring an AST node or source location. `ImportDiagnostic`
remains the shape for source-node normalization, preservation, and rejection
diagnostics; this requirement does not freeze the eventual TypeScript API in
advance.

## 6. Heading and section construction

Use one real root Block.

A first H1 becomes root content only when it is the first manuscript AST child after BOM and blank-line handling. If consumed as the root title, treat it as heading depth 1 for skipped-level diagnostics. Otherwise the root has heading depth 0.

Each later H1 attaches to the root. Each other heading attaches to the nearest open lower-depth heading. A skipped heading level creates no synthetic heading and produces `heading-level-skipped`.

An empty heading creates one InlineContent with an empty `text/markdown; charset=UTF-8` fine-grained text payload.

For a root or section that contains both body material and subsections:

- body material becomes direct `flow` children;
- subsections go in one transparent contentless grouping Block with `childrenPresentation="sections"`;
- the owner uses `flow`; and
- the subsection group follows the body material.

If a root or section contains subsections and no body material, it can use `sections` directly.

This construction is the canonical Markdown-representable Coedit structure. Export must invert this construction for imported or equivalent documents.

Block boundaries remain structural. The importer does not insert newline characters between Blocks merely to make the rendered manuscript look separated.

## 7. Supported block mapping

Use these initial mappings:

```text
paragraph                 -> terminal Block with one `text/markdown; charset=UTF-8` fine-grained text InlineContent
unordered list            -> transparent grouping Block with bullets children
ordered list              -> transparent grouping Block with numbers children
list item first paragraph -> list-item `text/markdown; charset=UTF-8` fine-grained text InlineContent
remaining item material   -> flow children of the list item
nested list               -> transparent list grouping among those flow children
```

A list item with no leading paragraph receives one empty `text/markdown; charset=UTF-8` fine-grained text InlineContent.

An ordered list whose start is not one is normalized to one and produces `ordered-list-start-normalized` until explicit start-number semantics exist.

GFM task markers are preserved as literal `[ ]` or `[x]` prefixes and produce `task-marker-literalized`.

## 8. Inline source preservation and application rendering

The document engine does not own an inline Markdown AST or formatting marks. After structural import consumes syntax such as headings, list containers, and list-item markers, the remaining inline source stays in the `text/markdown` payload as Markdown text.

For example, source equivalent to a list item containing `hello **world**` becomes a list-item Block whose payload contains `hello **world**`. The list marker is represented by structure; the emphasis delimiters remain source text. This avoids encoding the same structural fact twice while keeping inline Markdown available to application renderers.

CommonMark soft/hard line-break spelling, emphasis, strong text, strikethrough, inline code, links, images, raw inline HTML, and other inline constructs are therefore application/interchange syntax. The importer can normalize source spelling only where this specification explicitly requires a deterministic round trip; otherwise it preserves the source slice. The initial explicit source normalizations are the source-byte UTF-8/BOM/newline rules in section 5 and the structural mappings stated in this document. No separate inline delimiter or line-break canonicalization is implied. The document engine does not validate, repair, rewrite, or interpret embedded HTML or other inline syntax; it preserves the source text, including malformed or hostile source. A renderer can parse and display that syntax but does not thereby change canonical engine state.

Markdown link destinations remain ordinary Markdown source. The application decides whether a destination is external, document-local, a serialized Coedit Range reference, or another URI. The document engine does not create an intrinsic link object or classify link targets.

Block and InlineContent boundaries still add no characters. If a Markdown construct requires an actual newline character inside one payload, that character is stored as source text. The application owns the mapping between editor actions, Markdown source spelling, and structural operations.

## 9. Unsupported structural source preservation

Unsupported structural source must not disappear silently.

When a block or other structural Markdown node cannot be represented by the canonical Block mappings and has a usable normalized source slice, preserve that complete source slice in one terminal `text/markdown; charset=UTF-8` fine-grained text InlineContent. Produce a warning that identifies the structural presentation that was not represented. Do not add a durable tag whose only meaning is that the current Markdown importer could not represent the original structure.

This fallback is structural only. Inline Markdown syntax remains source text in its containing payload and does not become unsupported merely because the document engine has no semantic model for it. Images, links, inline HTML, emphasis, code spans, and other inline constructs therefore require no fallback diagnostic solely because of their presentation semantics.

Initially apply structural fallback to:

- fenced or indented code blocks;
- tables;
- block quotes;
- raw HTML blocks that have no canonical structural mapping;
- thematic breaks; and
- unknown block constructs.

A raw HTML block preserved through this fallback remains its original Markdown/HTML source text. The engine does not validate, repair, or rewrite the embedded HTML.

If an unsupported structural source node has no usable source offsets, reject the import with `unsupported-node-without-source`.

An opaque payload already present in an edited Coedit document is not an unsupported Markdown source node. It is a valid Coedit payload with no current Markdown representation and is handled by export diagnostics in section 11.

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

Export accepts an explicit VersionToken plus optional lens and subtree selection. It returns Markdown and stable export diagnostics. The renderer has no file, clipboard, browser-storage, or carrier authority.

For a document inside the canonical Markdown-representable subset, export must invert the import construction so that re-import produces an equivalent normalized Coedit document.

Export can choose deterministic spelling for structural syntax that it reconstructs, including headings, list markers, and structural blank-line layout. For a `text/markdown` payload, export writes the stored inline Markdown source without style-only canonicalization. It changes that source only when this specification explicitly defines a normalization or when an application edit has already changed canonical payload text. Export never reconstructs inline syntax from engine-owned formatting state because no such state exists.

For a Coedit construct that the importer cannot reconstruct exactly, export must produce a stable diagnostic. The renderer must not claim an exact Markdown round trip for that selection.

Examples include:

- a selected InlineContent whose Media Type has no Markdown representation under this contract;
- application or user tags with no Markdown representation;
- multiple simultaneously selected InlineContents for one Block;
- a structural grouping that is valid Coedit but not produced by the Markdown importer;
- a `text/markdown` fine-grained text character with no accepted Markdown round-trip spelling under this contract;
- future overlays such as comments or conversations; and
- future presentation modes with no importer mapping.

Do not decode opaque payload bytes as text, infer a media type, or embed them in Markdown merely because a renderer might know how to display them. A future payload-specific Markdown convention requires its own explicit contract change.

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
- inline Markdown such as alternative emphasis/strong delimiters, strikethrough, inline code, links, images, raw inline HTML, and distinct soft/hard line-break spellings preserved exactly in payload source across export/re-import without presentation-only fallback diagnostics;
- proof that Block/InlineContent boundaries add no text character;
- task markers and non-one ordered-list starts;
- unsupported structural block constructs that use literal fallback; and
- proof that malformed or hostile embedded HTML source is preserved rather than repaired or rewritten by the document engine.

Also verify that all imported textual InlineContents use `text/markdown; charset=UTF-8`, and that exporting a selected opaque payload produces the stable non-representability behavior and never silently byte-decodes it as text.

When Step 7 selects importer guards, add tests below and around each selected
guard when practical, prove that capacity failure leaves no active candidate,
and verify the top-level source-format/capacity distinction. Experimental
candidate values produce characterization evidence until they are promoted;
they do not fail correctness CI.

Include one golden fixture that contains introductory paragraphs, a list, and subsections under the same heading. It must prove both importer grouping and exporter inversion without relying on implicit text separators between structural units.

Origin and derivation are intrinsic Coedit metadata but deliberately absent from ordinary Markdown. Their omission does not make every Markdown export warn: Markdown is already declared non-lossless for these fields. If a caller explicitly requests provenance-preserving export, return a stable non-representability diagnostic rather than implying that Markdown preserves it.

Re-imported Markdown receives new imported/unknown Origin. Origin equality is therefore intentionally outside the Markdown round-trip relation.

## 13. Non-goals

Markdown interchange does not preserve:

- opaque payload bytes or payload-level Origin;
- Coedit History;
- Contributors or attribution;
- Version identity;
- semantic Checkpoints;
- command idempotency data;
- exact CRDT identities or update bytes;
- browser-storage metadata; or
- Origin/provenance, comments, or discussions.

Use `.coedit` for lossless recovery of those capabilities.
