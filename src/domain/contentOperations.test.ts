import { describe, expect, it } from "vitest";

import {
  addFormattingMark,
  clearFormattingRange,
  deleteContentRange,
  insertHardBreak,
  insertText,
} from "./contentOperations.js";
import {
  createEmptyInlineContentValue,
  validateInlineContentValue,
} from "./content.js";
import {
  parseBlockId,
  parseContributionId,
  parseContributorId,
  parseInlineContentId,
  parseOriginId,
} from "./ids.js";
import type { OriginRecord } from "./content.js";

const originA: OriginRecord = {
  id: parseOriginId("10000000-0000-4000-8000-000000000001"),
  agentId: parseContributorId("20000000-0000-4000-8000-000000000001"),
  kind: "human",
  createdBy: parseContributionId("30000000-0000-4000-8000-000000000001"),
};
const originB: OriginRecord = {
  id: parseOriginId("10000000-0000-4000-8000-000000000002"),
  agentId: parseContributorId("20000000-0000-4000-8000-000000000002"),
  kind: "human",
  createdBy: parseContributionId("30000000-0000-4000-8000-000000000002"),
};

describe("CollaborativeContent", () => {
  it("requires explicit Origin assignment and never inherits neighboring Origin", () => {
    const first = insertText(createEmptyInlineContentValue(), 0, "ac", originA);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = insertText(first.value, 1, "b", originB);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value.items).toEqual([
      { kind: "text", text: "a", originId: originA.id },
      { kind: "text", text: "b", originId: originB.id },
      { kind: "text", text: "c", originId: originA.id },
    ]);
  });

  it("gives a hard break its own explicit Origin", () => {
    const text = insertText(createEmptyInlineContentValue(), 0, "ab", originA);
    expect(text.ok).toBe(true);
    if (!text.ok) return;

    const result = insertHardBreak(text.value, 1, originB);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.items[1]).toEqual({
      kind: "hardBreak",
      originId: originB.id,
    });
  });

  it("implements all four mark boundary policies", () => {
    for (const [policy, startExpected, endExpected] of [
      ["none", [1, 3], [0, 2]],
      ["start", [0, 3], [0, 2]],
      ["end", [1, 3], [0, 3]],
      ["both", [0, 3], [0, 3]],
    ] as const) {
      const initial = insertText(
        createEmptyInlineContentValue(),
        0,
        "ab",
        originA,
      );
      expect(initial.ok).toBe(true);
      if (!initial.ok) continue;
      const marked = addFormattingMark(initial.value, {
        kind: "bold",
        start: 0,
        end: 2,
        boundaryPolicy: policy,
      });
      expect(marked.ok).toBe(true);
      if (!marked.ok) continue;

      const atStart = insertText(marked.value, 0, "x", originB);
      expect(atStart.ok).toBe(true);
      if (atStart.ok) {
        expect([
          atStart.value.marks[0]?.start,
          atStart.value.marks[0]?.end,
        ]).toEqual(startExpected);
      }

      const atEnd = insertText(marked.value, 2, "x", originB);
      expect(atEnd.ok).toBe(true);
      if (atEnd.ok) {
        expect([
          atEnd.value.marks[0]?.start,
          atEnd.value.marks[0]?.end,
        ]).toEqual(endExpected);
      }
    }
  });

  it("preserves Origin when formatting is added or cleared", () => {
    const initial = insertText(
      createEmptyInlineContentValue(),
      0,
      "abc",
      originA,
    );
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    const marked = addFormattingMark(initial.value, {
      kind: "italic",
      start: 0,
      end: 3,
      boundaryPolicy: "both",
    });
    expect(marked.ok).toBe(true);
    if (!marked.ok) return;
    const cleared = clearFormattingRange(marked.value, 1, 2);
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;

    expect(cleared.value.items).toEqual(initial.value.items);
    expect(cleared.value.origins).toEqual(initial.value.origins);
  });

  it("accepts opaque and document-local internal link targets", () => {
    const initial = insertText(
      createEmptyInlineContentValue(),
      0,
      "abc",
      originA,
    );
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;

    const opaque = addFormattingMark(initial.value, {
      kind: "link",
      start: 0,
      end: 1,
      boundaryPolicy: "none",
      target: { kind: "opaque", metadata: { hostValue: "custom:thing" } },
    });
    expect(opaque.ok).toBe(true);

    const internal = addFormattingMark(initial.value, {
      kind: "link",
      start: 1,
      end: 3,
      boundaryPolicy: "none",
      target: {
        kind: "block",
        blockId: parseBlockId("40000000-0000-4000-8000-000000000001"),
        range: {
          inlineContentId: parseInlineContentId(
            "50000000-0000-4000-8000-000000000001",
          ),
          startCursor: "carrier:start",
          endCursor: "carrier:end",
          startAffinity: "after",
          endAffinity: "before",
          quote: { exact: "target", prefix: "pre", suffix: "post" },
          approximatePosition: { start: 2, end: 8 },
        },
      },
    });
    expect(internal.ok).toBe(true);
  });

  it("rejects missing Origins and leaves the base detached", () => {
    const invalid = {
      items: [{ kind: "text" as const, text: "x", originId: originA.id }],
      marks: [],
      origins: [],
    };
    expect(validateInlineContentValue(invalid).ok).toBe(false);

    const initial = insertText(
      createEmptyInlineContentValue(),
      0,
      "abc",
      originA,
    );
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    const deleted = deleteContentRange(initial.value, 1, 2);
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(initial.value.items).toEqual([
      { kind: "text", text: "abc", originId: originA.id },
    ]);
    expect(deleted.value.items).toEqual([
      { kind: "text", text: "ac", originId: originA.id },
    ]);
  });

  it("uses UTF-16 logical offsets for surrogate pairs", () => {
    const initial = insertText(
      createEmptyInlineContentValue(),
      0,
      "a😀b",
      originA,
    );
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    const inserted = insertText(initial.value, 3, "x", originB);
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.value.items).toEqual([
      { kind: "text", text: "a😀", originId: originA.id },
      { kind: "text", text: "x", originId: originB.id },
      { kind: "text", text: "b", originId: originA.id },
    ]);
  });
});
