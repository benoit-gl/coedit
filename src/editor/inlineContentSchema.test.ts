import { describe, expect, it } from "vitest";

import type {
  FormattingMark,
  InlineContentValue,
  OriginRecord,
} from "../domain/content.js";
import {
  parseBlockId,
  parseContributionId,
  parseContributorId,
  parseOriginId,
} from "../domain/ids.js";
import {
  inlineContentFromProseMirror,
  inlineContentSchema,
  proseMirrorDocFromInlineContent,
} from "./inlineContentSchema.js";

const originA = origin(1);
const originB = origin(2);

const bold: FormattingMark = { kind: "bold", boundaryPolicy: "start" };
const link: FormattingMark = {
  kind: "link",
  boundaryPolicy: "none",
  target: {
    kind: "block",
    blockId: parseBlockId("40000000-0000-4000-8000-000000000001"),
  },
};

describe("CollaborativeContent Tiptap schema", () => {
  it("uses a flat inline top-level document", () => {
    expect(inlineContentSchema.topNodeType.spec.content?.toString()).toBe(
      "inline*",
    );
    expect(inlineContentSchema.nodes.hardBreak?.isInline).toBe(true);
  });

  it("projects canonical attributed content and Origin without loss", () => {
    const value: InlineContentValue = {
      items: [
        {
          kind: "text",
          text: "ab",
          originId: originA.id,
          marks: [link, bold],
        },
        {
          kind: "hardBreak",
          originId: originB.id,
          marks: [bold],
        },
        {
          kind: "text",
          text: "c",
          originId: originB.id,
          marks: [],
        },
      ],
      origins: [originA, originB],
    };

    const projected = proseMirrorDocFromInlineContent(value);
    const roundTripped = inlineContentFromProseMirror(projected, value.origins);

    expect(roundTripped).toEqual({
      ...value,
      items: [
        { ...value.items[0], marks: [bold, link] },
        value.items[1],
        value.items[2],
      ],
    });
  });

  it("keeps link targets inert in the editor schema", () => {
    const linkType = inlineContentSchema.marks.link;
    if (linkType === undefined) {
      throw new Error("Test schema is missing link mark.");
    }
    expect(linkType.spec.inclusive).toBe(false);
    const editorMark = linkType.create({
      boundaryPolicy: link.boundaryPolicy,
      target: link.target,
    });
    expect(
      JSON.stringify(linkType.spec.toDOM?.(editorMark, true)),
    ).not.toContain("href");
  });

  it("requires a protected Origin mark on each visible editor node", () => {
    const docType = inlineContentSchema.nodes.doc;
    if (docType === undefined) {
      throw new Error("Test schema is missing doc node.");
    }
    const document = docType.create(null, [inlineContentSchema.text("x")]);
    expect(() => inlineContentFromProseMirror(document, [originA])).toThrow(
      "exactly one Origin",
    );
  });
});

function origin(index: number): OriginRecord {
  const suffix = index.toString().padStart(12, "0");
  return {
    id: parseOriginId(`10000000-0000-4000-8000-${suffix}`),
    agentId: parseContributorId(`20000000-0000-4000-8000-${suffix}`),
    kind: "human",
    createdBy: parseContributionId(`30000000-0000-4000-8000-${suffix}`),
  };
}
