import { readFile, writeFile } from "node:fs/promises";

async function replaceIn(path, replacements) {
  let text = await readFile(path, "utf8");
  for (const [from, to] of replacements) {
    if (!text.includes(from)) {
      if (!text.includes(to)) {
        throw new Error(
          `Expected text not found in ${path}: ${from.slice(0, 80)}`,
        );
      }
      continue;
    }
    text = text.replace(from, to);
  }
  await writeFile(path, text, "utf8");
}

await replaceIn("src/domain/content.ts", [
  ["const MAX_TEXT_LENGTH = 100_000;\n", ""],
  [
    `    if (textLength > MAX_TEXT_LENGTH) {\n      return failure(\n        "LimitExceeded",\n        "CollaborativeContent exceeds the text limit.",\n      );\n    }\n`,
    "",
  ],
  [
    `  const record = value as { readonly [key: string]: OpaqueLinkValue };\n  for (const key of Object.keys(record)) {\n    const entry = record[key];\n    if (\n      entry === undefined ||\n      key.length === 0 ||\n      !isOpaqueValue(entry, depth + 1)\n    ) {\n`,
    `  const record = value as Readonly<Record<string, unknown>>;\n  for (const key of Object.keys(record)) {\n    const entry = record[key];\n    if (key.length === 0 || !isOpaqueValue(entry as OpaqueLinkValue, depth + 1)) {\n`,
  ],
]);

await replaceIn("src/carrier/yjsContentCarrier.ts", [
  [
    `    for (const operation of this.text.toDelta()) {\n`,
    `    const delta = this.text.toDelta() as unknown as readonly YTextDeltaOperation[];\n    for (const operation of delta) {\n`,
  ],
  [
    `const ORIGIN_ATTRIBUTE = "coedit:origin";\n`,
    `const ORIGIN_ATTRIBUTE = "coedit:origin";\n\ninterface YTextDeltaOperation {\n  readonly insert: string;\n  readonly attributes?: Readonly<Record<string, unknown>>;\n}\n`,
  ],
]);

await replaceIn("docs/PRODUCT_DOMAIN_MODEL.md", [
  [
    "Initial formatting values include bold, italic, underline, strikethrough, inline code, and link with a safe destination.",
    "Initial formatting values include bold, italic, underline, strikethrough, inline code, and link with a carrier-neutral target. Ordinary link metadata is opaque to the document model; typed internal Block links are interpreted only according to the focused attributed-text contract.",
  ],
]);

await replaceIn("docs/PORTABLE_DOCUMENT_FORMAT.md", [
  [
    "11. reconstructed text, hard breaks, marks, boundary policies, Origin coverage,\n    and safe link destinations; and",
    "11. reconstructed text, hard breaks, marks, boundary policies, Origin coverage,\n    opaque link-metadata shape/resource bounds, and typed internal-link shape; and",
  ],
  [
    "- malformed graph/frontiers, Contributor/Origin references, carrier state,\n  topology, ownership, marks, and safe links fail;",
    "- malformed graph/frontiers, Contributor/Origin references, carrier state,\n  topology, ownership, marks, opaque link metadata, and typed internal links fail;",
  ],
]);

await replaceIn("docs/MVP_VERIFICATION_PLAN.md", [
  [
    "- empty and realistic rich text, hard breaks, overlapping marks, and safe links;",
    "- empty and realistic rich text, hard breaks, overlapping marks, opaque link metadata, and typed internal Block links;",
  ],
  [
    "- 100,000-character content and 5,000-Contribution load, edit, growth,\n  materialization, and portable-open behavior against recorded budgets.",
    "- representative 100,000-code-point content and 5,000-Contribution load, edit, growth, materialization, and portable-open behavior. The 100,000-code-point fixture is a qualification workload, not a domain validity limit. Run smaller growth points as well so results expose local, linear, or worse scaling.",
  ],
  [
    "The suite must also verify stable diagnostics for normalization, literal fallback, unsafe links, unsupported nodes, malformed input, and resource limits.",
    "The suite must also verify stable diagnostics for normalization, unsupported-source literal preservation, unsupported nodes, malformed input, and importer resource limits. Link destinations are preserved as opaque metadata and are not classified as safe or unsafe by the importer.",
  ],
]);

await replaceIn("docs/MVP_ARCHITECTURE.md", [
  [
    "Authority, not deployment, defines the boundary.\n\n## 3. Public engine behavior",
    `Authority, not deployment, defines the boundary.\n\n### 2.4 Semantic interpretation and capacity boundaries\n\nCanonical document state stores durable document facts and accepted product semantics. Adapters and consumers derive judgments that depend on current source syntax, host capabilities, security policy, renderer behavior, or implementation capacity.\n\nBefore a new classification becomes durable state, ask:\n\n1. Is it an objective fact about the document, or a judgment made by the current adapter, environment, policy, or implementation?\n2. Would it still mean the same thing in another renderer, host, importer version, security policy, or future application?\n3. Is there a real document workflow that requires it to survive independently of the component that derived it?\n\nA contextual classification that can change with the consumer and has no durable workflow normally remains a diagnostic, projection result, activation decision, or other boundary result. ADR 0005 records the rationale and examples.\n\nThe same rule applies to capacity. The domain does not impose an arbitrary text or payload-size ceiling only because one carrier, parser, codec, browser, or storage implementation needs a resource guard. Boundary implementations can reject work they cannot process safely and must return explicit resource/capacity failure. Qualification records the tested envelope. Such an implementation limit does not make larger content semantically invalid.\n\nResource protection remains mandatory for hostile external inputs. Parser byte limits, nesting limits, archive bounds, opaque-metadata bounds, and similar guards protect the consuming implementation without redefining document ontology.\n\n## 3. Public engine behavior`,
  ],
]);

await replaceIn("docs/decisions/0005-semantic-interpretation-boundaries.md", [
  [
    "### Carrier semantic activity\n",
    `### Implementation capacity\n\nAn arbitrary maximum text or payload size is not a canonical document invariant only because the current carrier or runtime has a practical limit. Carrier, parser, codec, browser, and storage implementations can enforce explicit resource/capacity limits at their boundaries. Qualification records the tested envelope. Representative performance fixtures do not become validity limits.\n\nFor Step 3, 100,000 code points is a deliberately demanding content-performance fixture. It is not the largest semantically valid InlineContent.\n\n### Carrier semantic activity\n`,
  ],
  [
    "- Opaque metadata can still have size, depth, type, and canonical-shape limits.\n",
    "- Opaque metadata can still have size, depth, type, and canonical-shape limits.\n- Implementation capacity and hostile-input resource guards remain explicit boundary constraints rather than arbitrary domain semantics.\n",
  ],
]);

await replaceIn("docs/decisions/README.md", [
  [
    "| [`0004-intrinsic-link-targets.md`](0004-intrinsic-link-targets.md)                                                 | Accepted | Opaque link metadata, document-local Block targets, and optional range refinement                         |",
    "| [`0004-intrinsic-link-targets.md`](0004-intrinsic-link-targets.md)                                                 | Accepted | Opaque link metadata, document-local Block targets, and optional range refinement                         |\n| [`0005-semantic-interpretation-boundaries.md`](0005-semantic-interpretation-boundaries.md)                           | Accepted | Durable semantic boundaries, contextual judgments, and implementation-capacity limits                    |",
  ],
]);

await replaceIn("docs/MARKDOWN_INTERCHANGE.md", [
  [
    "- the same application-significant tags created by Markdown import;\n- the same semantic inline text, hard breaks, intrinsic formatting marks, mark-boundary policies, and safe link destinations; and",
    "- the same semantic inline text, hard breaks, intrinsic formatting marks, mark-boundary policies, and preserved link metadata; and",
  ],
  ["- 1,000,000 Unicode code points in one InlineContent; and\n", ""],
  [
    "link                  -> intrinsic link mark with safe href",
    "link                  -> intrinsic link mark with opaque destination metadata",
  ],
  [
    "Safe links are `http`, `https`, `mailto`, same-document fragments, and relative references. Reject control characters and unsafe explicit schemes from the formatting model.\n",
    "Markdown link destinations are preserved as opaque bounded link metadata. The importer does not classify destinations as safe or unsafe and does not decide whether they are URLs, commands, citations, or activatable targets. A renderer or integration that activates the metadata applies its own policy at that boundary.\n",
  ],
  [
    "When a source node has a usable normalized source slice, preserve that exact slice as plain text in one terminal InlineContent tagged `import:markdown-literal`. Produce a warning that identifies the lost presentation.",
    "When a source node has a usable normalized source slice, preserve that exact slice as plain authored text and produce a warning that identifies the lost presentation. Do not add a durable tag whose only meaning is that the current Markdown importer could not represent the original syntax. For an unsupported block node, preserve the complete source slice in one terminal InlineContent. For an unsupported inline node, preserve that node's source slice as literal text inside the containing InlineContent.",
  ],
  ["- unsafe links.\n", ""],
  ["- `unsafe-link-literalized`;\n", ""],
  [
    "- unsafe links and unsupported inline constructs.\n",
    "- opaque link destinations and unsupported inline constructs.\n",
  ],
]);
