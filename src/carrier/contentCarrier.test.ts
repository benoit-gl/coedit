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
      expect(carrier.snapshot()).toEqual({ items: [], marks: [], origins: [] });
      expect(factory.load(carrier.encode()).snapshot()).toEqual(carrier.snapshot());
    });

    it("assigns explicit non-inheriting Origin to text and hard breaks", () => {
      const carrier = factory.create();
      carrier.insertText(0, "ac", originA);
      carrier.insertText(1, "b", originB);
      carrier.insertHardBreak(3, originC);

      expect(carrier.snapshot().items).toEqual([
        { kind: "text", text: "a", originId: originA.id },
        { kind: "text", text: "b", originId: originB.id },
        { kind: "text", text: "c", originId: originA.id },
        { kind: "hardBreak", originId: originC.id },
      ]);
    });

    it("preserves all four mark insertion-boundary policies", () => {
      for (const [policy, startRange, endRange] of [
        ["none", [1, 3], [0, 2]],
        ["start", [0, 3], [0, 2]],
        ["end", [1, 3], [0, 3]],
        ["both", [0, 3], [0, 3]],
      ] as const) {
        const startCarrier = markedCarrier(factory, policy);
        startCarrier.insertText(0, "x", originB);
        expect(markRange(startCarrier.snapshot(), "bold")).toEqual(startRange);

        const endCarrier = markedCarrier(factory, policy);
        endCarrier.insertText(2, "x", originB);
        expect(markRange(endCarrier.snapshot(), "bold")).toEqual(endRange);
      }
    });

    it("round trips opaque and internal Block link targets", () => {
      const carrier = factory.create();
      carrier.insertText(0, "links", originA);
      const opaque: FormattingMark = {
        kind: "link",
        start: 0,
        end: 2,
        boundaryPolicy: "none",
        target: {
          kind: "opaque",
          metadata: { hostValue: ["custom:thing", 4, true] },
        },
      };
      const internal: FormattingMark = {
        kind: "link",
        start: 2,
        end: 5,
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
      carrier.addMark(opaque);
      carrier.addMark(internal);

      expect(sortedMarks(carrier.snapshot())).toEqual(sortedMarks({
        items: [],
        origins: [],
        marks: [opaque, internal],
      }));
      expect(sortedMarks(factory.load(carrier.encode()).snapshot())).toEqual(
        sortedMarks(carrier.snapshot()),
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
      expect(new Set(left.snapshot().items.map((item) => item.originId))).toEqual(
        new Set([originA.id, originB.id, originC.id]),
      );
    });

    it("converges independent concurrent formatting marks", () => {
      const base = factory.create();
      base.insertText(0, "abc", originA);
      const left = factory.load(base.encode());
      const right = factory.load(base.encode());
      left.addMark({
        kind: "bold",
        start: 0,
        end: 2,
        boundaryPolicy: "both",
      });
      right.addMark({
        kind: "italic",
        start: 1,
        end: 3,
        boundaryPolicy: "both",
      });

      const leftState = left.encode();
      const rightState = right.encode();
      left.mergeEncoded(rightState);
      right.mergeEncoded(leftState);

      expect(normalize(left.snapshot())).toEqual(normalize(right.snapshot()));
      expect(left.snapshot().marks.map((mark) => mark.kind).sort()).toEqual([
        "bold",
        "italic",
      ]);
      expect(left.snapshot().items).toEqual(base.snapshot().items);
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

    it("translates UTF-16 editor offsets without moving an emoji boundary", () => {
      const carrier = factory.create();
      carrier.insertText(0, "a😀b", originA);
      carrier.insertText(3, "x", originB);
      expect(carrier.snapshot().items).toEqual([
        { kind: "text", text: "a😀", originId: originA.id },
        { kind: "text", text: "x", originId: originB.id },
        { kind: "text", text: "b", originId: originA.id },
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
  carrier.addMark({
    kind: "bold",
    start: 0,
    end: 2,
    boundaryPolicy,
  });
  return carrier;
}

function markRange(
  value: InlineContentValue,
  kind: FormattingMark["kind"],
): readonly [number | undefined, number | undefined] {
  const mark = value.marks.find((entry) => entry.kind === kind);
  return [mark?.start, mark?.end];
}

function sortedMarks(value: InlineContentValue): readonly FormattingMark[] {
  return [...value.marks].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function normalize(value: InlineContentValue): InlineContentValue {
  return {
    items: value.items,
    marks: sortedMarks(value),
    origins: [...value.origins].sort((left, right) => left.id.localeCompare(right.id)),
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
