import { describe, expect, it } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import type { StructuralPlacement } from "../../../src/carrier/index.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "./automergeIntegratedDocumentCarrier.js";
import type {
  IntegratedDocumentCarrierFactory,
  IntegratedPayloadChange,
} from "./carrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "./yjsIntegratedDocumentCarrier.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";

const rootId = parseBlockId("70000000-0000-4000-8000-000000000001");
const blockA = parseBlockId("70000000-0000-4000-8000-000000000002");
const textId = parseInlineContentId("70000000-0000-4000-8000-000000000003");
const opaqueId = parseInlineContentId("70000000-0000-4000-8000-000000000004");
const human = { id: "human-a", kind: "human" as const };
const imported = { id: "import-a", kind: "imported" as const };

const factories: readonly IntegratedDocumentCarrierFactory<LocalDensePosition>[] =
  [
    createYjsIntegratedDocumentCarrierFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    ),
    createAutomergeIntegratedDocumentCarrierFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    ),
  ];

for (const factory of factories) {
  describe(`${factory.candidate} integrated qualification`, () => {
    it("publishes structure, text, and opaque payloads in one atomic change", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        placements: [{ blockId: blockA, placement: position(1, 1) }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: textId,
            mediaType: "text/plain",
            text: "alpha",
            origin: human,
          },
          {
            kind: "replace-opaque",
            inlineContentId: opaqueId,
            mediaType: "application/example",
            bytes: Uint8Array.of(1, 2, 3),
            origin: imported,
          },
        ],
      });
      const snapshot = carrier.snapshot();
      expect(snapshot.placements.get(blockA)).toEqual(position(1, 1));
      expect(snapshot.payloads.get(textId)).toMatchObject({
        kind: "text",
        text: "alpha",
      });
      expect(snapshot.payloads.get(opaqueId)).toMatchObject({
        kind: "opaque",
        bytes: Uint8Array.of(1, 2, 3),
      });

      const before = carrier.snapshot();
      expect(() =>
        carrier.applyChange({
          placements: [{ blockId: blockA, placement: position(2, 1) }],
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: opaqueId,
              offset: 0,
              text: "bad",
              origin: human,
            },
          ],
        }),
      ).toThrow(/text payload/u);
      expect(carrier.snapshot()).toEqual(before);
    });

    it("converges, reloads, and reopens candidate serialization", () => {
      const base = seeded(factory);
      const left = factory.load(base.encode());
      const right = factory.load(base.encode());
      left.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 5,
            text: "-left",
            origin: human,
          },
        ],
      });
      right.applyChange({
        placements: [{ blockId: blockA, placement: position(3, 1) }],
      });
      const leftState = left.encode();
      const rightState = right.encode();
      left.mergeEncoded(rightState);
      right.mergeEncoded(leftState);
      expect(right.snapshot()).toEqual(left.snapshot());
      expect(factory.load(left.encode()).snapshot()).toEqual(left.snapshot());
    });

    it("supports checkpoint restore and History materialization surrogates", () => {
      const carrier = seeded(factory);
      const checkpoint = carrier.encode();
      carrier.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 5,
            text: " beta",
            origin: human,
          },
        ],
      });
      const later = carrier.encode();
      expect(text(factory.load(checkpoint))).toBe("alpha");
      expect(text(factory.load(later))).toBe("alpha beta");
      expect(text(factory.load(checkpoint))).toBe("alpha");
    });

    it("keeps cursor and Range-feasibility positions usable through text edits", () => {
      const carrier = seeded(factory);
      const range = { start: 1, end: 4 };
      carrier.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 0,
            text: "X",
            origin: human,
          },
        ],
      });
      const shifted = { start: range.start + 1, end: range.end + 1 };
      const value = text(carrier);
      expect(value.slice(shifted.start, shifted.end)).toBe("lph");
      expect(() =>
        carrier.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: opaqueId,
              offset: 0,
              text: "x",
              origin: human,
            },
          ],
        }),
      ).toThrow(/text payload/u);
    });

    it("qualifies application transaction translation, IME, and undo/redo", () => {
      const carrier = seeded(factory);
      const before = carrier.encode();
      carrier.applyChange({
        payloads: translateApplicationTransaction([
          { from: 5, to: 5, text: " composed" },
        ]),
      });
      expect(text(carrier)).toBe("alpha composed");
      const afterComposition = carrier.encode();

      const undo = factory.load(before);
      expect(text(undo)).toBe("alpha");
      const redo = factory.load(afterComposition);
      expect(text(redo)).toBe("alpha composed");
    });

    it("qualifies cut/paste and the private clipboard trust boundary", () => {
      const carrier = seeded(factory);
      const fragment = encodePrivateFragment({
        mediaType: "text/plain",
        text: "alp",
      });
      const parsed = parsePrivateFragment(fragment);
      carrier.applyChange({
        payloads: [
          { kind: "delete-text", inlineContentId: textId, start: 0, end: 3 },
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 2,
            text: parsed.text,
            origin: imported,
          },
        ],
      });
      expect(text(carrier)).toBe("haalp");
      expect(() =>
        parsePrivateFragment('{"mediaType":"text/plain","text":7}'),
      ).toThrow(/clipboard/u);
      expect(() =>
        parsePrivateFragment('{"mediaType":"application/example","text":"x"}'),
      ).toThrow(/clipboard/u);
    });

    it("survives the candidate-supported serialization compaction boundary", () => {
      const carrier = seeded(factory);
      for (let index = 0; index < 16; index += 1) {
        carrier.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: textId,
              offset: text(carrier).length,
              text: String(index % 10),
              origin: human,
            },
          ],
        });
      }
      const reopened = factory.load(carrier.encode());
      expect(reopened.snapshot()).toEqual(carrier.snapshot());
    });
  });
}

function seeded(factory: IntegratedDocumentCarrierFactory<LocalDensePosition>) {
  const carrier = factory.create(rootId);
  carrier.applyChange({
    placements: [{ blockId: blockA, placement: position(1, 1) }],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: textId,
        mediaType: "text/plain",
        text: "alpha",
        origin: human,
      },
      {
        kind: "replace-opaque",
        inlineContentId: opaqueId,
        mediaType: "application/example",
        bytes: Uint8Array.of(9),
        origin: imported,
      },
    ],
  });
  return carrier;
}
function position(
  order: number,
  depth: number,
): StructuralPlacement<LocalDensePosition> {
  return {
    position: {
      digits: [order],
      run: "70000000-0000-4000-8000-000000000099",
      member: 1,
    },
    depth,
  };
}
function text(
  carrier: ReturnType<
    IntegratedDocumentCarrierFactory<LocalDensePosition>["create"]
  >,
): string {
  const payload = carrier.snapshot().payloads.get(textId);
  if (payload?.kind !== "text") throw new TypeError("Expected text fixture.");
  return payload.text;
}
function translateApplicationTransaction(
  steps: readonly {
    readonly from: number;
    readonly to: number;
    readonly text: string;
  }[],
): readonly IntegratedPayloadChange[] {
  const changes: IntegratedPayloadChange[] = [];
  for (const step of steps) {
    if (step.from !== step.to)
      changes.push({
        kind: "delete-text",
        inlineContentId: textId,
        start: step.from,
        end: step.to,
      });
    if (step.text.length > 0)
      changes.push({
        kind: "insert-text",
        inlineContentId: textId,
        offset: step.from,
        text: step.text,
        origin: human,
      });
  }
  return changes;
}
function encodePrivateFragment(value: {
  readonly mediaType: string;
  readonly text: string;
}): string {
  return JSON.stringify({ version: 1, ...value });
}
function parsePrivateFragment(encoded: string): {
  readonly mediaType: string;
  readonly text: string;
} {
  const value: unknown = JSON.parse(encoded);
  if (
    typeof value !== "object" ||
    value === null ||
    !("version" in value) ||
    value.version !== 1 ||
    !("mediaType" in value) ||
    value.mediaType !== "text/plain" ||
    !("text" in value) ||
    typeof value.text !== "string"
  )
    throw new TypeError("Private clipboard fragment is invalid.");
  return { mediaType: value.mediaType, text: value.text };
}
