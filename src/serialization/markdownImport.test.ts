import attributedText from "../../docs/ATTRIBUTED_TEXT_AND_ANNOTATIONS.md?raw";
import implementationSpec from "../../docs/MVP_IMPLEMENTATION_SPEC.md?raw";
import productDomainModel from "../../docs/PRODUCT_DOMAIN_MODEL.md?raw";
import structuralCarrier from "../../docs/STRUCTURAL_CARRIER_MODEL.md?raw";
import { describe, expect, it } from "vitest";

import {
  applyStructuralOperations,
  createEmptyDocument,
  parseBlockId,
  parseContributionId,
  parseContributorId,
  parseDocumentId,
  parseInlineContentId,
  parseOriginId,
} from "../domain/index.js";
import type {
  Block,
  BlockId,
  InlineContentId,
  OriginRecord,
  StructuralDocument,
} from "../domain/index.js";
import { planMarkdownImport } from "./markdownImport.js";

const encoder = new TextEncoder();

const importedOrigin: OriginRecord = {
  id: parseOriginId("00000000-0000-4000-8000-000000000101"),
  agentId: parseContributorId("00000000-0000-4000-8000-000000000102"),
  kind: "imported",
  createdBy: parseContributionId("00000000-0000-4000-8000-000000000103"),
};

interface FixtureContext {
  readonly rootId: BlockId;
  readonly document: StructuralDocument;
  readonly ids: {
    readonly allocateBlockId: () => BlockId;
    readonly allocateInlineContentId: () => InlineContentId;
  };
}

describe("planMarkdownImport", () => {
  it("constructs the canonical mixed body plus subsection shape", () => {
    const fixture = createFixture();
    const result = planMarkdownImport({
      bytes: encoder.encode(
        "# Title\n\nIntro paragraph.\n\n## Section\n\nBody.",
      ),
      rootBlockId: fixture.rootId,
      origin: importedOrigin,
      ids: fixture.ids,
      source: { sourceName: "C:\\docs\\essay.md" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.source).toEqual({ sourceName: "essay.md" });
    const applied = applyStructuralOperations(
      fixture.document,
      result.value.operations,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    const root = applied.value.root;
    expect(inlineText(root)).toBe("Title");
    expect(root.childrenPresentation).toBe("flow");
    expect(root.children).toHaveLength(2);
    expect(inlineText(root.children[0]!)).toBe("Intro paragraph.");
    expect(root.children[1]!.contents).toHaveLength(0);
    expect(root.children[1]!.childrenPresentation).toBe("sections");
    expect(inlineText(root.children[1]!.children[0]!)).toBe("Section");
  });

  it("preserves arbitrary Markdown link destinations as opaque metadata", () => {
    const fixture = createFixture();
    const result = planMarkdownImport({
      bytes: encoder.encode('[Run](javascript:alert(1) "demo")'),
      rootBlockId: fixture.rootId,
      origin: importedOrigin,
      ids: fixture.ids,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.diagnostics).toEqual([]);
    const createContent = result.value.operations.find(
      (operation) => operation.kind === "CreateInlineContent",
    );
    expect(createContent?.kind).toBe("CreateInlineContent");
    if (createContent?.kind !== "CreateInlineContent") {
      return;
    }
    expect(createContent.tags).toEqual([]);
    expect(createContent.content.marks).toEqual([
      {
        kind: "link",
        start: 0,
        end: 3,
        boundaryPolicy: "none",
        target: {
          kind: "opaque",
          metadata: {
            interchange: "markdown",
            destination: "javascript:alert(1)",
            title: "demo",
          },
        },
      },
    ]);
  });

  it("preserves unsupported block syntax as plain text without a durable importer tag", () => {
    const fixture = createFixture();
    const markdown = "| A | B |\n| - | - |\n| 1 | 2 |";
    const result = planMarkdownImport({
      bytes: encoder.encode(markdown),
      rootBlockId: fixture.rootId,
      origin: importedOrigin,
      ids: fixture.ids,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.diagnostics.map((entry) => entry.code)).toContain(
      "unsupported-node-literalized",
    );
    const contentOperation = result.value.operations.find(
      (operation) => operation.kind === "CreateInlineContent",
    );
    expect(contentOperation?.kind).toBe("CreateInlineContent");
    if (contentOperation?.kind !== "CreateInlineContent") {
      return;
    }
    expect(contentOperation.tags).toEqual([]);
    expect(contentOperation.content.items).toEqual([
      { kind: "text", text: markdown, originId: importedOrigin.id },
    ]);
  });

  it("normalizes list start and literalizes GFM task markers with diagnostics", () => {
    const fixture = createFixture();
    const result = planMarkdownImport({
      bytes: encoder.encode("3. [x] done\n4. next"),
      rootBlockId: fixture.rootId,
      origin: importedOrigin,
      ids: fixture.ids,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.diagnostics.map((entry) => entry.code)).toEqual([
      "ordered-list-start-normalized",
      "task-marker-literalized",
    ]);
    const applied = applyStructuralOperations(
      fixture.document,
      result.value.operations,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    const list = applied.value.root.children[0]!;
    expect(list.childrenPresentation).toBe("numbers");
    expect(inlineText(list.children[0]!)).toBe("[x] done");
    expect(inlineText(list.children[1]!)).toBe("next");
  });

  it("accepts a 100,000-code-point qualification source without making it a validity limit", () => {
    const fixture = createFixture();
    const text = "x".repeat(100_000);
    const result = planMarkdownImport({
      bytes: encoder.encode(text),
      rootBlockId: fixture.rootId,
      origin: importedOrigin,
      ids: fixture.ids,
    });

    expect(result.ok).toBe(true);
  });

  it.each([
    ["PRODUCT_DOMAIN_MODEL.md", productDomainModel],
    ["ATTRIBUTED_TEXT_AND_ANNOTATIONS.md", attributedText],
    ["STRUCTURAL_CARRIER_MODEL.md", structuralCarrier],
    ["MVP_IMPLEMENTATION_SPEC.md", implementationSpec],
  ])(
    "plans representative project documentation: %s",
    (sourceName, markdown) => {
      const fixture = createFixture();
      const result = planMarkdownImport({
        bytes: encoder.encode(markdown),
        rootBlockId: fixture.rootId,
        origin: importedOrigin,
        ids: fixture.ids,
        source: { sourceName },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.operations.length).toBeGreaterThan(20);
      const applied = applyStructuralOperations(
        fixture.document,
        result.value.operations,
      );
      expect(applied.ok).toBe(true);
    },
  );
});

function createFixture(): FixtureContext {
  let next = 200;
  const allocateUuid = (): string => {
    next += 1;
    return `00000000-0000-4000-8000-${next.toString().padStart(12, "0")}`;
  };
  const rootId = parseBlockId("00000000-0000-4000-8000-000000000002");
  const created = createEmptyDocument({
    documentId: parseDocumentId("00000000-0000-4000-8000-000000000001"),
    rootId,
    childrenPresentation: "flow",
  });
  if (!created.ok) {
    throw new Error(created.error.message);
  }
  return {
    rootId,
    document: created.value,
    ids: {
      allocateBlockId: () => parseBlockId(allocateUuid()),
      allocateInlineContentId: () => parseInlineContentId(allocateUuid()),
    },
  };
}

function inlineText(block: Block): string {
  const content = block.contents[0]?.content;
  if (content === undefined) {
    return "";
  }
  return content.items
    .map((item) => (item.kind === "text" ? item.text : "\n"))
    .join("");
}
