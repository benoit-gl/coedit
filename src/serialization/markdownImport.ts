import type {
  Break,
  Content,
  Delete,
  Emphasis,
  Heading,
  InlineCode,
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  Strong,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type {
  BlockId,
  InlineContentId,
  OriginRecord,
} from "../domain/index.js";
import type {
  FormattingMark,
  InlineContentValue,
  StructuralOperation,
} from "../domain/index.js";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_AST_NODES = 200_000;
const MAX_BLOCKS = 50_000;
const MAX_SOURCE_DEPTH = 100;
const MAX_SOURCE_NAME_CODE_POINTS = 255;
const MAX_SOURCE_NAME_BYTES = 1024;

/** Source metadata retained by the Markdown import boundary. */
export interface MarkdownSourceMetadata {
  /** Optional source display name. Only its basename is retained. */
  readonly sourceName?: string;
}

/** Stable source location for one Markdown import diagnostic. */
export interface ImportDiagnosticSource {
  /** UTF-16 offset in the normalized Markdown source. */
  readonly startOffset: number;
  /** Exclusive UTF-16 offset in the normalized Markdown source. */
  readonly endOffset: number;
  /** One-based source line. */
  readonly line: number;
  /** One-based source column. */
  readonly column: number;
}

/** Stable Markdown planning diagnostic. */
export interface ImportDiagnostic {
  /** Stable machine-readable identifier. */
  readonly code:
    | "heading-level-skipped"
    | "ordered-list-start-normalized"
    | "task-marker-literalized"
    | "unsupported-node-literalized"
    | "unsupported-node-without-source";
  /** Severity of this diagnostic. */
  readonly severity: "info" | "warning" | "error";
  /** Human-readable detail. */
  readonly message: string;
  /** MDAST node type that caused the diagnostic. */
  readonly nodeKind: string;
  /** Location in normalized source. */
  readonly source: ImportDiagnosticSource;
  /** Import action taken for this source construct. */
  readonly action: "preserved" | "normalized" | "rejected";
}

/** Deterministic identity allocation supplied by trusted import application code. */
export interface MarkdownImportIdentityAllocator {
  /** Allocates one non-root Block identity. */
  readonly allocateBlockId: () => BlockId;
  /** Allocates one InlineContent identity. */
  readonly allocateInlineContentId: () => InlineContentId;
}

/** Input required to plan one new-document Markdown import. */
export interface MarkdownImportPlanRequest {
  /** Untrusted UTF-8 Markdown bytes. */
  readonly bytes: Uint8Array;
  /** Existing genesis root that the operations target. */
  readonly rootBlockId: BlockId;
  /** Imported or unknown Origin assigned to imported visible material. */
  readonly origin: OriginRecord;
  /** Trusted deterministic ID allocator. */
  readonly ids: MarkdownImportIdentityAllocator;
  /** Optional source display metadata. */
  readonly source?: MarkdownSourceMetadata;
}

/** Successful pure Markdown import plan. */
export interface MarkdownImportPlan {
  /** Sanitized source display metadata. */
  readonly source: MarkdownSourceMetadata;
  /** Ordinary structural operations for one blank candidate document. */
  readonly operations: readonly StructuralOperation[];
  /** Stable diagnostics produced while normalizing or preserving source. */
  readonly diagnostics: readonly ImportDiagnostic[];
}

/** Expected Markdown planning failure. */
export interface MarkdownImportError {
  /** Stable error kind. */
  readonly kind: "InvalidEncoding" | "LimitExceeded" | "UnsupportedSource";
  /** Human-readable detail. */
  readonly message: string;
  /** Diagnostics accumulated before rejection. */
  readonly diagnostics: readonly ImportDiagnostic[];
}

/** Result of pure Markdown import planning. */
export type MarkdownImportPlanResult =
  | { readonly ok: true; readonly value: MarkdownImportPlan }
  | { readonly ok: false; readonly error: MarkdownImportError };

interface PlannedInlineContent {
  readonly id: InlineContentId;
  readonly content: InlineContentValue;
}

interface PlannedBlock {
  readonly id: BlockId;
  childrenPresentation: "sections" | "flow" | "bullets" | "numbers";
  readonly contents: PlannedInlineContent[];
  readonly children: PlannedBlock[];
}

interface SectionPlan {
  readonly block: PlannedBlock;
  readonly headingDepth: number;
  readonly body: PlannedBlock[];
  readonly subsections: SectionPlan[];
}

interface PlanningContext {
  readonly source: string;
  readonly origin: OriginRecord;
  readonly ids: MarkdownImportIdentityAllocator;
  readonly diagnostics: ImportDiagnostic[];
  blockCount: number;
}

interface InlineBuilder {
  readonly items: Array<
    | { readonly kind: "text"; readonly text: string; readonly originId: OriginRecord["id"] }
    | { readonly kind: "hardBreak"; readonly originId: OriginRecord["id"] }
  >;
  readonly marks: FormattingMark[];
  offset: number;
}

/** Plans one Markdown import without mutating an engine or carrier. */
export function planMarkdownImport(
  request: MarkdownImportPlanRequest,
): MarkdownImportPlanResult {
  if (request.bytes.byteLength > MAX_SOURCE_BYTES) {
    return rejected(
      "LimitExceeded",
      `Markdown source cannot exceed ${MAX_SOURCE_BYTES} UTF-8 bytes.`,
      [],
    );
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(request.bytes);
  } catch {
    return rejected("InvalidEncoding", "Markdown source must be valid UTF-8.", []);
  }

  const source = normalizeSource(decoded);
  const sourceMetadata = normalizeSourceMetadata(request.source);
  if (!sourceMetadata.ok) {
    return rejected("LimitExceeded", sourceMetadata.message, []);
  }

  let tree: Root;
  try {
    tree = unified().use(remarkParse).use(remarkGfm).parse(source) as Root;
  } catch {
    return rejected("UnsupportedSource", "Markdown parser rejected the source.", []);
  }

  const astLimit = validateAstLimits(tree);
  if (astLimit !== undefined) {
    return rejected("LimitExceeded", astLimit, []);
  }

  const context: PlanningContext = {
    source,
    origin: request.origin,
    ids: request.ids,
    diagnostics: [],
    blockCount: 1,
  };
  const rootBlock: PlannedBlock = {
    id: request.rootBlockId,
    childrenPresentation: "flow",
    contents: [],
    children: [],
  };

  try {
    planRoot(tree, rootBlock, context);
  } catch (error: unknown) {
    if (error instanceof PlanningFailure) {
      return rejected(error.kind, error.message, context.diagnostics);
    }
    throw error;
  }

  const operations: StructuralOperation[] = [];
  emitBlockContents(rootBlock, operations);
  if (rootBlock.childrenPresentation !== "flow") {
    operations.push({
      kind: "SetChildrenPresentation",
      blockId: rootBlock.id,
      value: rootBlock.childrenPresentation,
    });
  }
  emitChildren(rootBlock, operations);

  return {
    ok: true,
    value: {
      source: sourceMetadata.value,
      operations,
      diagnostics: structuredClone(context.diagnostics),
    },
  };
}

function planRoot(tree: Root, rootBlock: PlannedBlock, context: PlanningContext): void {
  const children = tree.children;
  let startIndex = 0;
  let rootHeadingDepth = 0;

  const first = children[0];
  if (first?.type === "heading" && first.depth === 1) {
    rootBlock.contents.push(createInlineContent(first.children, context));
    rootHeadingDepth = 1;
    startIndex = 1;
  }

  const rootSection: SectionPlan = {
    block: rootBlock,
    headingDepth: rootHeadingDepth,
    body: [],
    subsections: [],
  };
  const stack: SectionPlan[] = [rootSection];

  for (let index = startIndex; index < children.length; index += 1) {
    const node = children[index];
    if (node === undefined) {
      continue;
    }
    if (node.type === "heading") {
      const parent = findHeadingParent(stack, node.depth, rootSection);
      diagnoseSkippedHeading(parent.headingDepth, node, context);
      const section = createSection(node, context);
      parent.subsections.push(section);
      while (stack.length > 1 && stack.at(-1) !== parent) {
        stack.pop();
      }
      if (stack.at(-1) !== parent) {
        stack.push(parent);
      }
      stack.push(section);
      continue;
    }

    const owner = stack.at(-1) ?? rootSection;
    owner.body.push(...planBodyNode(node, context));
  }

  finalizeSection(rootSection, context);
}

function findHeadingParent(
  stack: readonly SectionPlan[],
  depth: number,
  root: SectionPlan,
): SectionPlan {
  if (depth === 1) {
    return root;
  }
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const candidate = stack[index];
    if (candidate !== undefined && candidate.headingDepth < depth) {
      return candidate;
    }
  }
  return root;
}

function diagnoseSkippedHeading(
  parentDepth: number,
  heading: Heading,
  context: PlanningContext,
): void {
  if (heading.depth <= parentDepth + 1) {
    return;
  }
  context.diagnostics.push(
    diagnostic(
      "heading-level-skipped",
      "warning",
      "Heading depth skips one or more levels; no synthetic section was created.",
      heading,
      "normalized",
    ),
  );
}

function createSection(heading: Heading, context: PlanningContext): SectionPlan {
  const block = createBlock(context, "flow");
  block.contents.push(createInlineContent(heading.children, context));
  return {
    block,
    headingDepth: heading.depth,
    body: [],
    subsections: [],
  };
}

function finalizeSection(section: SectionPlan, context: PlanningContext): void {
  for (const child of section.subsections) {
    finalizeSection(child, context);
  }

  if (section.body.length > 0 && section.subsections.length > 0) {
    section.block.childrenPresentation = "flow";
    section.block.children.push(...section.body);
    const group = createBlock(context, "sections");
    group.children.push(...section.subsections.map((child) => child.block));
    section.block.children.push(group);
    return;
  }
  if (section.subsections.length > 0) {
    section.block.childrenPresentation = "sections";
    section.block.children.push(...section.subsections.map((child) => child.block));
    return;
  }
  section.block.childrenPresentation = "flow";
  section.block.children.push(...section.body);
}

function planBodyNode(node: Content, context: PlanningContext): PlannedBlock[] {
  switch (node.type) {
    case "paragraph":
      return [planParagraph(node, context)];
    case "list":
      return [planList(node, context)];
    default:
      return [planUnsupportedBlock(node, context)];
  }
}

function planParagraph(node: Paragraph, context: PlanningContext): PlannedBlock {
  const block = createBlock(context, "flow");
  block.contents.push(createInlineContent(node.children, context));
  return block;
}

function planList(node: List, context: PlanningContext): PlannedBlock {
  const group = createBlock(context, node.ordered === true ? "numbers" : "bullets");
  if (node.ordered === true && node.start !== null && node.start !== undefined && node.start !== 1) {
    context.diagnostics.push(
      diagnostic(
        "ordered-list-start-normalized",
        "warning",
        "Ordered-list start value was normalized to one.",
        node,
        "normalized",
      ),
    );
  }
  for (const item of node.children) {
    group.children.push(planListItem(item, context));
  }
  return group;
}

function planListItem(node: ListItem, context: PlanningContext): PlannedBlock {
  const block = createBlock(context, "flow");
  const first = node.children[0];
  let remainingStart = 0;

  if (first?.type === "paragraph") {
    const prefix = taskPrefix(node, context);
    block.contents.push(createInlineContent(first.children, context, prefix));
    remainingStart = 1;
  } else {
    const prefix = taskPrefix(node, context);
    block.contents.push(createInlineContent([], context, prefix));
  }

  for (let index = remainingStart; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (child === undefined) {
      continue;
    }
    if (child.type === "list") {
      block.children.push(planList(child, context));
    } else if (child.type === "paragraph") {
      block.children.push(planParagraph(child, context));
    } else {
      block.children.push(planUnsupportedBlock(child, context));
    }
  }
  return block;
}

function taskPrefix(node: ListItem, context: PlanningContext): string {
  if (node.checked === null || node.checked === undefined) {
    return "";
  }
  context.diagnostics.push(
    diagnostic(
      "task-marker-literalized",
      "warning",
      "GFM task marker was preserved as literal text.",
      node,
      "preserved",
    ),
  );
  return node.checked ? "[x] " : "[ ] ";
}

function planUnsupportedBlock(node: Content, context: PlanningContext): PlannedBlock {
  const sourceSlice = requireSourceSlice(node, context);
  const block = createBlock(context, "flow");
  block.contents.push(createLiteralInlineContent(sourceSlice, context));
  context.diagnostics.push(
    diagnostic(
      "unsupported-node-literalized",
      "warning",
      "Unsupported Markdown construct was preserved as plain text.",
      node,
      "preserved",
    ),
  );
  return block;
}

function createBlock(
  context: PlanningContext,
  childrenPresentation: PlannedBlock["childrenPresentation"],
): PlannedBlock {
  context.blockCount += 1;
  if (context.blockCount > MAX_BLOCKS) {
    throw new PlanningFailure(
      "LimitExceeded",
      `Markdown import cannot generate more than ${MAX_BLOCKS} Blocks including the root.`,
    );
  }
  return {
    id: context.ids.allocateBlockId(),
    childrenPresentation,
    contents: [],
    children: [],
  };
}

function createInlineContent(
  children: readonly PhrasingContent[],
  context: PlanningContext,
  prefix = "",
): PlannedInlineContent {
  const builder: InlineBuilder = { items: [], marks: [], offset: 0 };
  if (prefix.length > 0) {
    appendText(builder, prefix, context.origin);
  }
  for (const child of children) {
    appendInlineNode(builder, child, context);
  }
  return {
    id: context.ids.allocateInlineContentId(),
    content: finishInline(builder, context.origin),
  };
}

function createLiteralInlineContent(
  text: string,
  context: PlanningContext,
): PlannedInlineContent {
  const builder: InlineBuilder = { items: [], marks: [], offset: 0 };
  appendText(builder, text, context.origin);
  return {
    id: context.ids.allocateInlineContentId(),
    content: finishInline(builder, context.origin),
  };
}

function appendInlineNode(
  builder: InlineBuilder,
  node: PhrasingContent,
  context: PlanningContext,
): void {
  switch (node.type) {
    case "text":
      appendText(builder, node.value.replace(/\r?\n/gu, " "), context.origin);
      return;
    case "break":
      appendBreak(builder, node, context.origin);
      return;
    case "emphasis":
      appendContainerMark(builder, node, "italic", "both", context);
      return;
    case "strong":
      appendContainerMark(builder, node, "bold", "both", context);
      return;
    case "delete":
      appendContainerMark(builder, node, "strikethrough", "both", context);
      return;
    case "inlineCode":
      appendInlineCode(builder, node, context.origin);
      return;
    case "link":
      appendLink(builder, node, context);
      return;
    default: {
      const sourceSlice = requireSourceSlice(node, context);
      appendText(builder, sourceSlice, context.origin);
      context.diagnostics.push(
        diagnostic(
          "unsupported-node-literalized",
          "warning",
          "Unsupported inline Markdown construct was preserved as plain text.",
          node,
          "preserved",
        ),
      );
    }
  }
}

function appendBreak(
  builder: InlineBuilder,
  _node: Break,
  origin: OriginRecord,
): void {
  builder.items.push({ kind: "hardBreak", originId: origin.id });
  builder.offset += 1;
}

function appendContainerMark(
  builder: InlineBuilder,
  node: Emphasis | Strong | Delete,
  kind: "italic" | "bold" | "strikethrough",
  boundaryPolicy: "both",
  context: PlanningContext,
): void {
  const start = builder.offset;
  for (const child of node.children) {
    appendInlineNode(builder, child, context);
  }
  if (builder.offset > start) {
    builder.marks.push({ kind, start, end: builder.offset, boundaryPolicy });
  }
}

function appendInlineCode(
  builder: InlineBuilder,
  node: InlineCode,
  origin: OriginRecord,
): void {
  const start = builder.offset;
  appendText(builder, node.value.replace(/[\r\n]+/gu, " "), origin);
  if (builder.offset > start) {
    builder.marks.push({
      kind: "inlineCode",
      start,
      end: builder.offset,
      boundaryPolicy: "none",
    });
  }
}

function appendLink(
  builder: InlineBuilder,
  node: Link,
  context: PlanningContext,
): void {
  const start = builder.offset;
  for (const child of node.children) {
    appendInlineNode(builder, child, context);
  }
  if (builder.offset > start) {
    builder.marks.push({
      kind: "link",
      start,
      end: builder.offset,
      boundaryPolicy: "none",
      target: {
        kind: "opaque",
        metadata: {
          interchange: "markdown",
          destination: node.url,
          ...(node.title === null || node.title === undefined
            ? {}
            : { title: node.title }),
        },
      },
    });
  }
}

function appendText(
  builder: InlineBuilder,
  text: string,
  origin: OriginRecord,
): void {
  if (text.length === 0) {
    return;
  }
  const previous = builder.items.at(-1);
  if (previous?.kind === "text" && previous.originId === origin.id) {
    builder.items[builder.items.length - 1] = {
      kind: "text",
      text: previous.text + text,
      originId: origin.id,
    };
  } else {
    builder.items.push({ kind: "text", text, originId: origin.id });
  }
  builder.offset += text.length;
}

function finishInline(
  builder: InlineBuilder,
  origin: OriginRecord,
): InlineContentValue {
  return {
    items: builder.items,
    marks: builder.marks,
    origins: builder.items.length === 0 ? [] : [origin],
  };
}

function emitBlockContents(
  block: PlannedBlock,
  operations: StructuralOperation[],
): void {
  for (let index = 0; index < block.contents.length; index += 1) {
    const content = block.contents[index];
    if (content === undefined) {
      continue;
    }
    operations.push({
      kind: "CreateInlineContent",
      blockId: block.id,
      inlineContentId: content.id,
      index,
      tags: [],
      content: content.content,
    });
  }
}

function emitChildren(
  parent: PlannedBlock,
  operations: StructuralOperation[],
): void {
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    if (child === undefined) {
      continue;
    }
    operations.push({
      kind: "CreateBlock",
      blockId: child.id,
      parentId: parent.id,
      index,
      tags: [],
      childrenPresentation: child.childrenPresentation,
    });
    emitBlockContents(child, operations);
    emitChildren(child, operations);
  }
}

function requireSourceSlice(node: Content | PhrasingContent, context: PlanningContext): string {
  const location = sourceLocation(node);
  if (location === undefined) {
    context.diagnostics.push({
      code: "unsupported-node-without-source",
      severity: "error",
      message: "Unsupported Markdown construct has no usable source offsets.",
      nodeKind: node.type,
      source: { startOffset: 0, endOffset: 0, line: 1, column: 1 },
      action: "rejected",
    });
    throw new PlanningFailure(
      "UnsupportedSource",
      "Unsupported Markdown construct has no usable source offsets.",
    );
  }
  return context.source.slice(location.startOffset, location.endOffset);
}

function diagnostic(
  code: ImportDiagnostic["code"],
  severity: ImportDiagnostic["severity"],
  message: string,
  node: Content | PhrasingContent,
  action: ImportDiagnostic["action"],
): ImportDiagnostic {
  return {
    code,
    severity,
    message,
    nodeKind: node.type,
    source: sourceLocation(node) ?? {
      startOffset: 0,
      endOffset: 0,
      line: 1,
      column: 1,
    },
    action,
  };
}

function sourceLocation(
  node: Content | PhrasingContent,
): ImportDiagnosticSource | undefined {
  const start = node.position?.start;
  const end = node.position?.end;
  if (
    start?.offset === undefined ||
    end?.offset === undefined ||
    end.offset < start.offset
  ) {
    return undefined;
  }
  return {
    startOffset: start.offset,
    endOffset: end.offset,
    line: start.line,
    column: start.column,
  };
}

function validateAstLimits(root: Root): string | undefined {
  let count = 0;
  const stack: Array<{ readonly node: Root | Content | PhrasingContent; readonly depth: number }> = [
    { node: root, depth: 1 },
  ];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    count += 1;
    if (count > MAX_AST_NODES) {
      return `Markdown AST cannot exceed ${MAX_AST_NODES} nodes.`;
    }
    if (current.depth > MAX_SOURCE_DEPTH) {
      return `Markdown source nesting cannot exceed ${MAX_SOURCE_DEPTH}.`;
    }
    if ("children" in current.node && Array.isArray(current.node.children)) {
      for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
        const child = current.node.children[index];
        if (child !== undefined) {
          stack.push({
            node: child as Content | PhrasingContent,
            depth: current.depth + 1,
          });
        }
      }
    }
  }
  return undefined;
}

function normalizeSource(value: string): string {
  const withoutBom = value.startsWith("\uFEFF") ? value.slice(1) : value;
  return withoutBom.replace(/\r\n?/gu, "\n");
}

function normalizeSourceMetadata(
  source: MarkdownSourceMetadata | undefined,
):
  | { readonly ok: true; readonly value: MarkdownSourceMetadata }
  | { readonly ok: false; readonly message: string } {
  if (source?.sourceName === undefined) {
    return { ok: true, value: {} };
  }
  const parts = source.sourceName.split(/[\\/]/u);
  const basename = parts.at(-1) ?? "";
  if (
    [...basename].length > MAX_SOURCE_NAME_CODE_POINTS ||
    new TextEncoder().encode(basename).byteLength > MAX_SOURCE_NAME_BYTES
  ) {
    return {
      ok: false,
      message: "Markdown source name exceeds its display-metadata limit.",
    };
  }
  return { ok: true, value: { sourceName: basename } };
}

function rejected(
  kind: MarkdownImportError["kind"],
  message: string,
  diagnostics: readonly ImportDiagnostic[],
): MarkdownImportPlanResult {
  return {
    ok: false,
    error: { kind, message, diagnostics: structuredClone(diagnostics) },
  };
}

class PlanningFailure extends Error {
  public constructor(
    public readonly kind: MarkdownImportError["kind"],
    message: string,
  ) {
    super(message);
    this.name = "PlanningFailure";
  }
}
