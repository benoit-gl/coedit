import { describe, expect, it } from "vitest";

import { parseBlockId, parseDocumentId, parseInlineContentId } from "./ids.js";
import type { Block, StructuralDocument } from "./model.js";
import { createEmptyInlineContentValue } from "./model.js";
import {
  applyStructuralOperations,
  createEmptyDocument,
  validateDocument,
} from "./structural.js";
import type { StructuralOperation } from "./structural.js";

const DOCUMENT_ID = parseDocumentId("00000000-0000-4000-8000-000000000001");
const ROOT_ID = parseBlockId("00000000-0000-4000-8000-000000000002");

function blockId(sequence: number): ReturnType<typeof parseBlockId> {
  return parseBlockId(uuid(sequence));
}

function inlineId(sequence: number): ReturnType<typeof parseInlineContentId> {
  return parseInlineContentId(uuid(sequence));
}

function uuid(sequence: number): string {
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
}

function emptyDocument(): StructuralDocument {
  const result = createEmptyDocument({
    documentId: DOCUMENT_ID,
    rootId: ROOT_ID,
    childrenPresentation: "sections",
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

describe("createEmptyDocument", () => {
  it("creates one real root with no authored or application content", () => {
    const document = emptyDocument();

    expect(document.root.tags).toEqual([]);
    expect(document.root.contents).toEqual([]);
    expect(document.root.children).toEqual([]);
  });

  it("rejects a document/root collision in the global durable UUID namespace", () => {
    const result = createEmptyDocument({
      documentId: DOCUMENT_ID,
      rootId: parseBlockId(DOCUMENT_ID),
      childrenPresentation: "flow",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("DuplicateId");
    }
  });
});

describe("structural operations", () => {
  it("creates, reorders, tags, moves, and deletes realistic structure", () => {
    const a = blockId(10);
    const b = blockId(11);
    const child = blockId(12);
    const firstContent = inlineId(20);
    const secondContent = inlineId(21);
    const content = createEmptyInlineContentValue();
    const operations: StructuralOperation[] = [
      {
        kind: "CreateBlock",
        blockId: a,
        parentId: ROOT_ID,
        index: 0,
        tags: [" Topic   Alpha "],
        childrenPresentation: "flow",
      },
      {
        kind: "CreateBlock",
        blockId: b,
        parentId: ROOT_ID,
        index: 1,
        tags: [],
        childrenPresentation: "sections",
      },
      {
        kind: "CreateBlock",
        blockId: child,
        parentId: a,
        index: 0,
        tags: [],
        childrenPresentation: "flow",
      },
      {
        kind: "CreateInlineContent",
        blockId: a,
        inlineContentId: firstContent,
        index: 0,
        tags: ["View:Main"],
        content,
      },
      {
        kind: "CreateInlineContent",
        blockId: a,
        inlineContentId: secondContent,
        index: 1,
        tags: [],
        content,
      },
      { kind: "MoveInlineContent", inlineContentId: secondContent, index: 0 },
      { kind: "MoveBlock", blockId: child, parentId: b, index: 0 },
      { kind: "SetBlockTags", blockId: b, tags: ["Container"] },
      {
        kind: "SetInlineContentTags",
        inlineContentId: firstContent,
        tags: ["View:Primary"],
      },
      { kind: "SetChildrenPresentation", blockId: b, value: "numbers" },
      { kind: "DeleteBlock", blockId: a },
    ];

    const result = applyStructuralOperations(emptyDocument(), operations);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.root.children.map((block) => block.id)).toEqual([b]);
      expect(
        result.value.root.children[0]?.children.map((block) => block.id),
      ).toEqual([child]);
      expect(result.value.root.children[0]?.tags).toEqual(["Container"]);
      expect(result.value.root.children[0]?.childrenPresentation).toBe(
        "numbers",
      );
    }
  });

  it("uses post-removal indices for same-parent moves and rejects no-effect moves", () => {
    const a = blockId(30);
    const b = blockId(31);
    const c = blockId(32);
    const created = applyStructuralOperations(emptyDocument(), [
      createBlock(a, 0),
      createBlock(b, 1),
      createBlock(c, 2),
    ]);
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const moved = applyStructuralOperations(created.value, [
      { kind: "MoveBlock", blockId: a, parentId: ROOT_ID, index: 2 },
    ]);
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.value.root.children.map((block) => block.id)).toEqual([
        b,
        c,
        a,
      ]);
    }

    const noEffect = applyStructuralOperations(created.value, [
      { kind: "MoveBlock", blockId: b, parentId: ROOT_ID, index: 1 },
    ]);
    expect(noEffect.ok).toBe(false);
    if (!noEffect.ok) {
      expect(noEffect.error.kind).toBe("NoEffect");
    }
  });

  it("rejects root mutation, cycles, invalid indices, and missing owners", () => {
    const parent = blockId(40);
    const child = blockId(41);
    const created = applyStructuralOperations(emptyDocument(), [
      createBlock(parent, 0),
      {
        ...createBlock(child, 0),
        parentId: parent,
      },
    ]);
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    expectFailure(
      created.value,
      [{ kind: "DeleteBlock", blockId: ROOT_ID }],
      "RootMutation",
    );
    expectFailure(
      created.value,
      [{ kind: "MoveBlock", blockId: parent, parentId: child, index: 0 }],
      "Cycle",
    );
    expectFailure(created.value, [createBlock(blockId(42), 2)], "InvalidIndex");
    expectFailure(
      created.value,
      [
        {
          kind: "CreateInlineContent",
          blockId: blockId(999),
          inlineContentId: inlineId(43),
          index: 0,
          tags: [],
          content: createEmptyInlineContentValue(),
        },
      ],
      "NotFound",
    );
  });

  it("enforces global UUID uniqueness across branded durable identity types", () => {
    const shared = uuid(50);
    const created = applyStructuralOperations(emptyDocument(), [
      createBlock(parseBlockId(shared), 0),
    ]);
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    expectFailure(
      created.value,
      [
        {
          kind: "CreateInlineContent",
          blockId: ROOT_ID,
          inlineContentId: parseInlineContentId(shared),
          index: 0,
          tags: [],
          content: createEmptyInlineContentValue(),
        },
      ],
      "DuplicateId",
    );
  });

  it("rolls back the whole group when a later operation fails", () => {
    const document = emptyDocument();
    const result = applyStructuralOperations(document, [
      createBlock(blockId(60), 0),
      createBlock(blockId(61), 9),
    ]);

    expect(result.ok).toBe(false);
    expect(document.root.children).toEqual([]);
  });

  it("allows reuse after deletion because Step 2 keeps no lifetime registry", () => {
    const id = blockId(70);
    const result = applyStructuralOperations(emptyDocument(), [
      createBlock(id, 0),
      { kind: "DeleteBlock", blockId: id },
      createBlock(id, 0),
    ]);

    expect(result.ok).toBe(true);
  });

  it("deletes complete subtrees and their owned InlineContents", () => {
    const parent = blockId(80);
    const child = blockId(81);
    const contentId = inlineId(82);
    const result = applyStructuralOperations(emptyDocument(), [
      createBlock(parent, 0),
      { ...createBlock(child, 0), parentId: parent },
      {
        kind: "CreateInlineContent",
        blockId: child,
        inlineContentId: contentId,
        index: 0,
        tags: [],
        content: createEmptyInlineContentValue(),
      },
      { kind: "DeleteBlock", blockId: parent },
      createBlock(parent, 0),
      {
        kind: "CreateInlineContent",
        blockId: parent,
        inlineContentId: contentId,
        index: 0,
        tags: [],
        content: createEmptyInlineContentValue(),
      },
    ]);

    expect(result.ok).toBe(true);
  });

  it("walks beyond the former depth boundary without recursive stack growth", () => {
    const operations: StructuralOperation[] = [];
    let parent = ROOT_ID;
    for (let depth = 2; depth <= 1_001; depth += 1) {
      const id = blockId(1_000 + depth);
      operations.push({
        kind: "CreateBlock",
        blockId: id,
        parentId: parent,
        index: 0,
        tags: [],
        childrenPresentation: "flow",
      });
      parent = id;
    }

    expect(applyStructuralOperations(emptyDocument(), operations).ok).toBe(
      true,
    );
  });
});

describe("former live capacity boundaries", () => {
  it("creates a Block beyond the former live Block boundary", () => {
    const children = Array.from({ length: 49_999 }, (_, index) =>
      flatBlock(index + 10_000),
    );
    const document: StructuralDocument = {
      id: DOCUMENT_ID,
      root: { ...flatBlock(9_999), id: ROOT_ID, children },
    };

    expect(validateDocument(document).ok).toBe(true);
    const result = applyStructuralOperations(document, [
      {
        kind: "CreateBlock",
        blockId: blockId(60_000),
        parentId: ROOT_ID,
        index: children.length,
        tags: [],
        childrenPresentation: "flow",
      },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.root.children).toHaveLength(50_000);
    }
  });

  it("creates InlineContent beyond the former live boundary", () => {
    const contents = Array.from({ length: 50_000 }, (_, index) => ({
      id: inlineId(100_000 + index),
      tags: [],
      content: createEmptyInlineContentValue(),
    }));
    const document: StructuralDocument = {
      id: DOCUMENT_ID,
      root: { ...flatBlock(90_000), id: ROOT_ID, contents },
    };

    expect(validateDocument(document).ok).toBe(true);
    const result = applyStructuralOperations(document, [
      {
        kind: "CreateInlineContent",
        blockId: ROOT_ID,
        inlineContentId: inlineId(160_000),
        index: contents.length,
        tags: [],
        content: createEmptyInlineContentValue(),
      },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.root.contents).toHaveLength(50_001);
    }
  });
});

function createBlock(
  blockIdValue: ReturnType<typeof blockId>,
  index: number,
): Extract<StructuralOperation, { readonly kind: "CreateBlock" }> {
  return {
    kind: "CreateBlock",
    blockId: blockIdValue,
    parentId: ROOT_ID,
    index,
    tags: [],
    childrenPresentation: "flow",
  };
}

function flatBlock(sequence: number): Block {
  return {
    id: blockId(sequence),
    tags: [],
    childrenPresentation: "flow",
    contents: [],
    children: [],
  };
}

function expectFailure(
  document: StructuralDocument,
  operations: readonly StructuralOperation[],
  kind: string,
): void {
  expectFailureResult(applyStructuralOperations(document, operations), kind);
}

function expectFailureResult(
  result: ReturnType<typeof validateDocument>,
  kind: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.kind).toBe(kind);
  }
}
