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
  parseInlineContentId,
  parseOriginId,
} from "../domain/ids.js";
import { automergeContentCarrierFactory } from "./automergeContentCarrier.js";
import type {
  ContentCarrier,
  ContentCarrierFactory,
} from "./contentCarrier.js";
import { yjsContentCarrierFactory } from "./yjsContentCarrier.js";

const factories: readonly ContentCarrierFactory[] = [
  yjsContentCarrierFactory,
  automergeContentCarrierFactory,
];

const originA = origin(1);
const originB = origin(2);
const originC = origin(3);

for (const factory of factories) {
  describe(`${factory.candidate} CollaborativeContent carrier`, () => {
    it("round trips empty content", () => {
      const carrier = factory.create();
      expect(carrier.snapshot()).toEqual({ items: [], origins: [] });
      expect(factory.load(carrier.encode()).snapshot()).toEqual(
        carrier.snapshot(),
      );
    });

    it("assigns explicit non-inheriting Origin to text and hard breaks", () => {
      const carrier = factory.create();
      carrier.insertText(0, "ac", originA);
      carrier.insertText(1, "b", originB);
      carrier.insertHardBreak(3, originC);

      expect(carrier.snapshot().items).toEqual([
        { kind: "text", text: "a", originId: originA.id, marks: [] },
        { kind: "text", text: "b", originId: originB.id, marks: [] },
        { kind: "text", text: "c", originId: originA.id, marks: [] },
        { kind: "hardBreak", originId: originC.id, marks: [] },
      ]);
    });

    it("preserves all four mark insertion-boundary policies", () => {
      for (const [policy, atStart, atEnd] of [
        ["none", false, false],
        ["start", true, false],
        ["end", false, true],
        ["both", true, true],
      ] as const) {
        const startCarrier = markedCarrier(factory, policy);
        startCarrier.insertText(0, "x", originB);
        expect(hasMarkAt(startCarrier.snapshot(), 0, "bold")).toBe(atStart);
        expect(hasMarkAt(startCarrier.snapshot(), 1, "bold")).toBe(true);

        const endCarrier = markedCarrier(factory, policy);
        endCarrier.insertText(2, "x", originB);
        expect(hasMarkAt(endCarrier.snapshot(), 1, "bold")).toBe(true);
        expect(hasMarkAt(endCarrier.snapshot(), 2, "bold")).toBe(atEnd);
      }
    });

    it("round trips opaque and internal Block link targets", () => {
      const carrier = factory.create();
      carrier.insertText(0, "links", originA);
      const opaque: FormattingMark = {
        kind: "link",
        boundaryPolicy: "none",
        target: {
          kind: "opaque",
          metadata: { hostValue: ["custom:thing", 4, true] },
        },
      };
      const internal: FormattingMark = {
        kind: "link",
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
      };
      carrier.addMark(0, 2, opaque);
      carrier.addMark(2, 5, internal);

      expect(marksAt(carrier.snapshot(), 0)).toEqual([opaque]);
      expect(marksAt(carrier.snapshot(), 1)).toEqual([opaque]);
      expect(marksAt(carrier.snapshot(), 2)).toEqual([internal]);
      expect(marksAt(carrier.snapshot(), 4)).toEqual([internal]);
      expect(factory.load(carrier.encode()).snapshot()).toEqual(
        carrier.snapshot(),
      );
    });

    it("converges concurrent inserts and tolerates duplicate delivery", () => {
      const base = factory.create();
      base.insertText(0, "ac", originA);
      const left = factory.load(base.encode());
      const right = factory.load(base.encode());

      left.insertText(1, "b", originB);
      right.insertText(1, "x", originC);
      const leftUpdate = left.encode();
      const rightUpdate = right.encode();
      left.mergeEncoded(rightUpdate);
      right.mergeEncoded(leftUpdate);
      left.mergeEncoded(rightUpdate);

      expect(normalize(left.snapshot())).toEqual(normalize(right.snapshot()));
      expect(
        new Set(left.snapshot().items.map((item) => item.originId)),
      ).toEqual(new Set([originA.id, originB.id, originC.id]));
    });

    it("converges independent concurrent formatting marks", () => {
      const base = factory.create();
      base.insertText(0, "abc", originA);
      const left = factory.load(base.encode());
      const right = factory.load(base.encode());
      left.addMark(0, 2, { kind: "bold", boundaryPolicy: "both" });
      right.addMark(1, 3, { kind: "italic", boundaryPolicy: "both" });

      const leftState = left.encode();
      const rightState = right.encode();
      left.mergeEncoded(rightState);
      right.mergeEncoded(leftState);

      expect(normalize(left.snapshot())).toEqual(normalize(right.snapshot()));
      expect(uniqueMarkKinds(left.snapshot())).toEqual(["bold", "italic"]);
      expect(visibleText(left.snapshot())).toBe("abc");
    });

    it("removes formatting without changing protected Origin", () => {
      const carrier = factory.create();
      const bold: FormattingMark = { kind: "bold", boundaryPolicy: "both" };
      carrier.insertText(0, "abc", originA);
      carrier.addMark(0, 3, bold);
      carrier.removeMark(1, 2, bold);

      const snapshot = carrier.snapshot();
      expect(hasMarkAt(snapshot, 0, "bold")).toBe(true);
      expect(hasMarkAt(snapshot, 1, "bold")).toBe(false);
      expect(hasMarkAt(snapshot, 2, "bold")).toBe(true);
      expect(snapshot.items.every((item) => item.originId === originA.id)).toBe(
        true,
      );
    });

    it("applies replacement and formatting as one ordered carrier batch", () => {
      const carrier = factory.create();
      const italic: FormattingMark = {
        kind: "italic",
        boundaryPolicy: "none",
      };
      carrier.insertText(0, "abc", originA);

      carrier.applyOperations([
        {
          kind: "deleteRange",
          startRuntimeUtf16Offset: 1,
          endRuntimeUtf16Offset: 2,
        },
        {
          kind: "insertText",
          runtimeUtf16Offset: 1,
          text: "XY",
          origin: originB,
        },
        {
          kind: "addMark",
          startRuntimeUtf16Offset: 1,
          endRuntimeUtf16Offset: 3,
          mark: italic,
        },
      ]);

      expect(carrier.snapshot().items).toEqual([
        { kind: "text", text: "a", originId: originA.id, marks: [] },
        {
          kind: "text",
          text: "XY",
          originId: originB.id,
          marks: [italic],
        },
        { kind: "text", text: "c", originId: originA.id, marks: [] },
      ]);
    });

    it("rejects an invalid carrier batch without partial publication", () => {
      const carrier = factory.create();
      carrier.insertText(0, "abc", originA);
      const before = carrier.snapshot();

      expect(() =>
        carrier.applyOperations([
          {
            kind: "insertText",
            runtimeUtf16Offset: 1,
            text: "x",
            origin: originB,
          },
          {
            kind: "deleteRange",
            startRuntimeUtf16Offset: 0,
            endRuntimeUtf16Offset: 99,
          },
        ]),
      ).toThrow();
      expect(carrier.snapshot()).toEqual(before);
    });

    it("keeps stable cursors attached through preceding edits and reload", () => {
      const carrier = factory.create();
      carrier.insertText(0, "ac", originA);
      const cursor = carrier.createCursor(1, "after");
      carrier.insertText(0, "x", originB);
      expect(carrier.resolveCursor(cursor)).toBe(2);

      const reloaded = factory.load(carrier.encode());
      expect(reloaded.resolveCursor(cursor)).toBe(2);
    });

    it("keeps UTF-16 confined to the candidate runtime boundary", () => {
      const carrier = factory.create();
      carrier.insertText(0, "a😀b", originA);
      carrier.insertText(3, "x", originB);
      expect(carrier.snapshot().items).toEqual([
        { kind: "text", text: "a😀", originId: originA.id, marks: [] },
        { kind: "text", text: "x", originId: originB.id, marks: [] },
        { kind: "text", text: "b", originId: originA.id, marks: [] },
      ]);
    });
  });
}

function markedCarrier(
  factory: ContentCarrierFactory,
  boundaryPolicy: FormattingMark["boundaryPolicy"],
): ContentCarrier {
  const carrier = factory.create();
  carrier.insertText(0, "ab", originA);
  carrier.addMark(0, 2, { kind: "bold", boundaryPolicy });
  return carrier;
}

function marksAt(
  value: InlineContentValue,
  runtimeUtf16Offset: number,
): readonly FormattingMark[] {
  let current = 0;
  for (const item of value.items) {
    const length = item.kind === "text" ? item.text.length : 1;
    if (
      runtimeUtf16Offset >= current &&
      runtimeUtf16Offset < current + length
    ) {
      return item.marks;
    }
    current += length;
  }
  return [];
}

function hasMarkAt(
  value: InlineContentValue,
  runtimeUtf16Offset: number,
  kind: FormattingMark["kind"],
): boolean {
  return marksAt(value, runtimeUtf16Offset).some((mark) => mark.kind === kind);
}

function uniqueMarkKinds(
  value: InlineContentValue,
): readonly FormattingMark["kind"][] {
  return [
    ...new Set(
      value.items.flatMap((item) => item.marks.map((mark) => mark.kind)),
    ),
  ].sort();
}

function visibleText(value: InlineContentValue): string {
  return value.items
    .map((item) => (item.kind === "text" ? item.text : "\n"))
    .join("");
}

function normalize(value: InlineContentValue): InlineContentValue {
  return {
    items: value.items,
    origins: [...value.origins].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}

function origin(index: number): OriginRecord {
  const suffix = index.toString().padStart(12, "0");
  return {
    id: parseOriginId(`10000000-0000-4000-8000-${suffix}`),
    agentId: parseContributorId(`20000000-0000-4000-8000-${suffix}`),
    kind: "human",
    createdBy: parseContributionId(`30000000-0000-4000-8000-${suffix}`),
  };
}
