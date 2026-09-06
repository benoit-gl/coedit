import { getSchema, Mark, Node } from "@tiptap/core";
import type {
  Mark as ProseMirrorMark,
  MarkType,
  Node as ProseMirrorNode,
  NodeType,
  Schema,
} from "@tiptap/pm/model";

import {
  cloneInlineContentValue,
  type FormattingMark,
  type FormattingMarkKind,
  type InlineContentValue,
  type LinkTarget,
  type MarkBoundaryPolicy,
  type OriginRecord,
  validateFormattingMark,
  validateInlineContentValue,
} from "../domain/content.js";
import { parseOriginId } from "../domain/ids.js";

const ORIGIN_MARK_NAME = "coeditOrigin";
const FORMATTING_MARK_KINDS: readonly FormattingMarkKind[] = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "inlineCode",
  "link",
];

const Doc = Node.create({
  name: "doc",
  topNode: true,
  content: "inline*",
});

const Text = Node.create({
  name: "text",
  group: "inline",
});

const HardBreak = Node.create({
  name: "hardBreak",
  inline: true,
  group: "inline",
  atom: true,
  parseHTML() {
    return [{ tag: "br" }];
  },
  renderHTML() {
    return ["br"];
  },
});

function formattingExtension(kind: FormattingMarkKind): Mark {
  return Mark.create({
    name: kind,
    inclusive: false,
    addAttributes() {
      return {
        boundaryPolicy: { default: "none", rendered: false },
        ...(kind === "link"
          ? { target: { default: null, rendered: false } }
          : {}),
      };
    },
    parseHTML() {
      switch (kind) {
        case "bold":
          return [{ tag: "strong" }];
        case "italic":
          return [{ tag: "em" }];
        case "underline":
          return [{ tag: "u" }];
        case "strikethrough":
          return [{ tag: "s" }];
        case "inlineCode":
          return [{ tag: "code" }];
        case "link":
          return [{ tag: "span[data-coedit-link]" }];
      }
    },
    renderHTML() {
      switch (kind) {
        case "bold":
          return ["strong", 0];
        case "italic":
          return ["em", 0];
        case "underline":
          return ["u", 0];
        case "strikethrough":
          return ["s", 0];
        case "inlineCode":
          return ["code", 0];
        case "link":
          // Link targets are inert document metadata. The presentation layer decides
          // whether and how a link becomes interactive.
          return ["span", { "data-coedit-link": "" }, 0];
      }
    },
  });
}

const Origin = Mark.create({
  name: ORIGIN_MARK_NAME,
  inclusive: false,
  clearable: false,
  addAttributes() {
    return {
      originId: { default: null, rendered: false },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-coedit-origin]" }];
  },
  renderHTML() {
    return ["span", { "data-coedit-origin": "" }, 0];
  },
});

/** Flat Tiptap/ProseMirror schema used to qualify CollaborativeContent editing. */
export const inlineContentSchema: Schema = getSchema([
  Doc,
  Text,
  HardBreak,
  ...FORMATTING_MARK_KINDS.map(formattingExtension),
  Origin,
]);

/** Name of the protected editor-only Origin mark. */
export const originMarkName = ORIGIN_MARK_NAME;

/** Projects one canonical CollaborativeContent value into a derived ProseMirror document. */
export function proseMirrorDocFromInlineContent(
  value: InlineContentValue,
): ProseMirrorNode {
  const validation = validateInlineContentValue(value);
  if (!validation.ok) {
    throw new Error(validation.error.message);
  }

  const children: ProseMirrorNode[] = [];
  for (const item of value.items) {
    const marks = [
      ...item.marks.map(proseMirrorMarkFromFormatting),
      originProseMirrorMark(item.originId),
    ];
    children.push(
      item.kind === "text"
        ? inlineContentSchema.text(item.text, marks)
        : requiredNodeType("hardBreak").create(null, null, marks),
    );
  }
  return requiredNodeType("doc").create(null, children);
}

/** Projects a derived ProseMirror document back to carrier-neutral canonical content. */
export function inlineContentFromProseMirror(
  document: ProseMirrorNode,
  origins: readonly OriginRecord[],
): InlineContentValue {
  if (document.type !== requiredNodeType("doc")) {
    throw new Error(
      "CollaborativeContent projection requires the flat editor document.",
    );
  }

  const items: InlineContentValue["items"][number][] = [];
  document.forEach((node) => {
    const originId = originIdFromProseMirrorMarks(node.marks);
    const marks = formattingMarksFromProseMirror(node.marks);
    if (node.isText) {
      if (node.text === undefined || node.text.length === 0) {
        throw new Error("Projected editor text must be non-empty.");
      }
      items.push({ kind: "text", text: node.text, originId, marks });
      return;
    }
    if (node.type === requiredNodeType("hardBreak")) {
      items.push({ kind: "hardBreak", originId, marks });
      return;
    }
    throw new Error(
      `Unsupported CollaborativeContent editor node: ${node.type.name}.`,
    );
  });

  const projected: InlineContentValue = {
    items,
    origins: cloneInlineContentValue({ items: [], origins }).origins,
  };
  const validation = validateInlineContentValue(projected);
  if (!validation.ok) {
    throw new Error(validation.error.message);
  }
  return projected;
}

/** Converts one canonical formatting descriptor to its derived editor mark. */
export function proseMirrorMarkFromFormatting(
  mark: FormattingMark,
): ProseMirrorMark {
  const error = validateFormattingMark(mark);
  if (error !== undefined) {
    throw new Error(error.message);
  }
  const type = requiredMarkType(mark.kind);
  return type.create(
    mark.kind === "link"
      ? { boundaryPolicy: mark.boundaryPolicy, target: mark.target }
      : { boundaryPolicy: mark.boundaryPolicy },
  );
}

/** Converts one derived editor formatting mark to its canonical descriptor. */
export function formattingMarkFromProseMirror(
  mark: ProseMirrorMark,
): FormattingMark | undefined {
  if (!FORMATTING_MARK_KINDS.includes(mark.type.name as FormattingMarkKind)) {
    return undefined;
  }

  const kind = mark.type.name as FormattingMarkKind;
  const boundaryPolicy: unknown = mark.attrs.boundaryPolicy;
  if (!isBoundaryPolicy(boundaryPolicy)) {
    throw new Error(`Editor mark ${kind} has an invalid boundary policy.`);
  }

  const descriptor: FormattingMark =
    kind === "link"
      ? {
          kind,
          boundaryPolicy,
          target: linkTargetAttribute(mark.attrs.target),
        }
      : { kind, boundaryPolicy };
  const error = validateFormattingMark(descriptor);
  if (error !== undefined) {
    throw new Error(error.message);
  }
  return descriptor;
}

/** Returns the protected Origin ID carried by one editor node mark set. */
export function originIdFromProseMirrorMarks(
  marks: readonly ProseMirrorMark[],
): OriginRecord["id"] {
  const origins = marks.filter((mark) => mark.type.name === ORIGIN_MARK_NAME);
  if (origins.length !== 1) {
    throw new Error(
      "Each CollaborativeContent editor node requires exactly one Origin mark.",
    );
  }
  const originId: unknown = origins[0]?.attrs.originId;
  if (typeof originId !== "string") {
    throw new Error("CollaborativeContent Origin mark requires an Origin ID.");
  }
  return parseOriginId(originId);
}

/** Creates the protected editor Origin mark for one canonical Origin ID. */
export function originProseMirrorMark(
  originId: OriginRecord["id"],
): ProseMirrorMark {
  const type = inlineContentSchema.marks[ORIGIN_MARK_NAME];
  if (type === undefined) {
    throw new Error(
      "CollaborativeContent editor schema is missing the Origin mark.",
    );
  }
  return type.create({ originId });
}

/** Extracts the canonical formatting set from one editor mark set. */
export function formattingMarksFromProseMirror(
  marks: readonly ProseMirrorMark[],
): readonly FormattingMark[] {
  return marks
    .map(formattingMarkFromProseMirror)
    .filter((mark): mark is FormattingMark => mark !== undefined)
    .sort(compareFormattingMarks);
}

function compareFormattingMarks(
  left: FormattingMark,
  right: FormattingMark,
): number {
  const kindOrder =
    FORMATTING_MARK_KINDS.indexOf(left.kind) -
    FORMATTING_MARK_KINDS.indexOf(right.kind);
  if (kindOrder !== 0) {
    return kindOrder;
  }
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function isBoundaryPolicy(value: unknown): value is MarkBoundaryPolicy {
  return (
    value === "none" || value === "start" || value === "end" || value === "both"
  );
}

function linkTargetAttribute(value: unknown): LinkTarget {
  if (typeof value !== "object" || value === null) {
    throw new Error("Editor link mark requires an inert link target.");
  }
  return value as LinkTarget;
}

function requiredNodeType(name: string): NodeType {
  const type = inlineContentSchema.nodes[name];
  if (type === undefined) {
    throw new Error(
      `CollaborativeContent editor schema is missing node type ${name}.`,
    );
  }
  return type;
}

function requiredMarkType(name: string): MarkType {
  const type = inlineContentSchema.marks[name];
  if (type === undefined) {
    throw new Error(
      `CollaborativeContent editor schema is missing mark type ${name}.`,
    );
  }
  return type;
}
