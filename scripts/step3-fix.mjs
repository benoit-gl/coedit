import { readFile, writeFile } from "node:fs/promises";

async function replaceIn(path, replacements) {
  let text = await readFile(path, "utf8");
  for (const [from, to] of replacements) {
    if (!text.includes(from)) {
      if (!text.includes(to)) {
        throw new Error(
          `Expected text not found in ${path}: ${from.slice(0, 100)}`,
        );
      }
      continue;
    }
    text = text.replace(from, to);
  }
  await writeFile(path, text, "utf8");
}

await replaceIn("src/domain/content.ts", [
  [
    `const MAX_ITEMS = 100_000;\nconst MAX_MARKS = 100_000;\nconst MAX_ORIGINS = 50_000;\n`,
    "",
  ],
  [
    `  if (\n    value.items.length > MAX_ITEMS ||\n    value.marks.length > MAX_MARKS ||\n    value.origins.length > MAX_ORIGINS\n  ) {\n    return failure(\n      "LimitExceeded",\n      "CollaborativeContent exceeds item limits.",\n    );\n  }\n\n`,
    "",
  ],
  [
    `function isOpaqueValue(value: OpaqueLinkValue, depth: number): boolean {`,
    `function isOpaqueValue(value: unknown, depth: number): value is OpaqueLinkValue {`,
  ],
  [
    `      !isOpaqueValue(entry as OpaqueLinkValue, depth + 1)`,
    `      !isOpaqueValue(entry, depth + 1)`,
  ],
]);

await replaceIn("src/serialization/markdownImport.ts", [
  [
    `tree = unified().use(remarkParse).use(remarkGfm).parse(source) as Root;`,
    `tree = unified().use(remarkParse).use(remarkGfm).parse(source);`,
  ],
  [
    `function planBodyNode(node: Content, context: PlanningContext): PlannedBlock[] {\n  switch (node.type) {\n    case "paragraph":\n      return [planParagraph(node, context)];\n    case "list":\n      return [planList(node, context)];\n    default:\n      return [planUnsupportedBlock(node, context)];\n  }\n}`,
    `function planBodyNode(node: Content, context: PlanningContext): PlannedBlock[] {\n  if (node.type === "paragraph") {\n    return [planParagraph(node, context)];\n  }\n  if (node.type === "list") {\n    return [planList(node, context)];\n  }\n  return [planUnsupportedBlock(node, context)];\n}`,
  ],
  [
    `function appendInlineNode(\n  builder: InlineBuilder,\n  node: PhrasingContent,\n  context: PlanningContext,\n): void {\n  switch (node.type) {\n    case "text":\n      appendText(builder, node.value.replace(/\\r?\\n/gu, " "), context.origin);\n      return;\n    case "break":\n      appendBreak(builder, node, context.origin);\n      return;\n    case "emphasis":\n      appendContainerMark(builder, node, "italic", "both", context);\n      return;\n    case "strong":\n      appendContainerMark(builder, node, "bold", "both", context);\n      return;\n    case "delete":\n      appendContainerMark(builder, node, "strikethrough", "both", context);\n      return;\n    case "inlineCode":\n      appendInlineCode(builder, node, context.origin);\n      return;\n    case "link":\n      appendLink(builder, node, context);\n      return;\n    default: {\n      const sourceSlice = requireSourceSlice(node, context);\n      appendText(builder, sourceSlice, context.origin);\n      context.diagnostics.push(\n        diagnostic(\n          "unsupported-node-literalized",\n          "warning",\n          "Unsupported inline Markdown construct was preserved as plain text.",\n          node,\n          "preserved",\n        ),\n      );\n    }\n  }\n}`,
    `function appendInlineNode(\n  builder: InlineBuilder,\n  node: PhrasingContent,\n  context: PlanningContext,\n): void {\n  if (node.type === "text") {\n    appendText(builder, node.value.replace(/\\r?\\n/gu, " "), context.origin);\n    return;\n  }\n  if (node.type === "break") {\n    appendBreak(builder, node, context.origin);\n    return;\n  }\n  if (node.type === "emphasis") {\n    appendContainerMark(builder, node, "italic", "both", context);\n    return;\n  }\n  if (node.type === "strong") {\n    appendContainerMark(builder, node, "bold", "both", context);\n    return;\n  }\n  if (node.type === "delete") {\n    appendContainerMark(builder, node, "strikethrough", "both", context);\n    return;\n  }\n  if (node.type === "inlineCode") {\n    appendInlineCode(builder, node, context.origin);\n    return;\n  }\n  if (node.type === "link") {\n    appendLink(builder, node, context);\n    return;\n  }\n  const sourceSlice = requireSourceSlice(node, context);\n  appendText(builder, sourceSlice, context.origin);\n  context.diagnostics.push(\n    diagnostic(\n      "unsupported-node-literalized",\n      "warning",\n      "Unsupported inline Markdown construct was preserved as plain text.",\n      node,\n      "preserved",\n    ),\n  );\n}`,
  ],
  [
    `            node: child as Content | PhrasingContent,`,
    `            node: child,`,
  ],
]);

await replaceIn("docs/MARKDOWN_INTERCHANGE.md", [
  [
    "- emphasis, strong, strikethrough, inline code, hard breaks, and safe links;",
    "- emphasis, strong, strikethrough, inline code, hard breaks, and links with opaque destination metadata;",
  ],
  [
    "- 50,000 generated Blocks;",
    "- 50,000 Blocks in the candidate imported document, including the root;",
  ],
]);

await replaceIn("docs/ATTRIBUTED_TEXT_AND_ANNOTATIONS.md", [
  [
    `Functional invariants are mandatory. Before running performance qualification,\nrecord representative target devices and budgets for open, ordinary edit,\ncheckpoint, history materialization, and export. Results and dependency/license\nreview are retained as qualification evidence.`,
    `Functional invariants are mandatory. Performance qualification records the actual\nhardware and software environment used for each run. Normal local text editing must\nupdate canonical local collaborative state within 50 ms on that qualification\nenvironment. Measure visible editor feedback separately and keep it in the tightest\npractical loop; routine carrier, persistence, History, or replica work must not block\nvisible local feedback. Open, reload, checkpoint, historical materialization, export,\nand other non-keystroke-critical operations are characterization data at this stage,\nnot general fixed hardware promises. Retain median and tail measurements, scaling\nresults, and dependency/license review as qualification evidence.`,
  ],
]);

await replaceIn("docs/MVP_VERIFICATION_PLAN.md", [
  [
    "The carrier qualification compares pinned Yjs v13 and Automerge under the same fixtures from `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` and `STRUCTURAL_CARRIER_MODEL.md`. It records exact dependency versions, license review, adapter complexity, representative target devices, performance budgets, measurements, and the selection rationale.",
    "The carrier qualification compares pinned Yjs v13 and Automerge under the same fixtures from `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` and `STRUCTURAL_CARRIER_MODEL.md`. It records exact dependency versions, license review, adapter complexity, the actual qualification hardware/software environment, measurements, scaling behavior, and the selection rationale.",
  ],
  [
    `### 6.5 Structural carrier qualification`,
    `### 6.5 Performance qualification\n\nUse paired, same-machine measurements for Yjs and Automerge and record OS, Node/browser versions, CPU, RAM, and exact carrier/library versions. Warm up each case and repeat it. Record median and tail latency rather than one stopwatch value.\n\nSeparate visible editor feedback from canonical local-model publication. Visible typing feedback is the critical hot path and must not wait for persistence, History materialization, network/replica delivery, or another slow subsystem. Normal local text editing must reach canonical local collaborative state and project back within 50 ms on the qualification environment. This limit is not a general hardware performance promise.\n\nExercise ordinary typing, delete/backspace, insertion at start/middle/end, selection replacement, hard breaks, formatting, mark boundaries, and Unicode. Use smaller growth points plus the representative 100,000-code-point fixture and multiple InlineContents. Detect accidental whole-document scans or reconstruction on a normal keystroke; whole-document work on routine typing is disqualifying even when one test runner is fast enough to hide the cost.\n\nMeasure Block create, move, subtree move, delete, and structure-plus-multiple-InlineContent atomic changes separately. Characterize open/reload, carrier serialization, checkpoint-state capture, historical materialization, export, convergence workloads, serialized-state growth, and supported garbage collection/compaction. Repeat critical measurements after reload/compaction. Deliberately slow persistence and replica delivery in browser tests; local typing must remain responsive.\n\n### 6.6 Structural carrier qualification`,
  ],
]);

await replaceIn("docs/PORTABLE_DOCUMENT_FORMAT.md", [
  [
    "If representative correct fixtures cannot fit or load within the recorded\ntarget-device budgets, change the container before declaring version 1 frozen;\ndo not silently relax hostile-input bounds.",
    "If representative correct fixtures cannot fit or load acceptably on the recorded\nqualification environment, change the container before declaring version 1 frozen.\nTreat these measurements as format-capacity evidence, not as a general hardware\nperformance promise, and do not silently relax hostile-input bounds.",
  ],
]);
