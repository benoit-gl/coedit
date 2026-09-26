import { describe, expect, it } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import type { StructuralPlacement } from "../../../src/carrier/index.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "./automergeIntegratedDocumentCarrier.js";
import type { IntegratedDocumentCarrierFactory } from "./carrier.js";
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
  describe(`${factory.candidate} integrated foundation`, () => {
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

      const beforePayloadFailure = carrier.snapshot();
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
      expect(carrier.snapshot()).toEqual(beforePayloadFailure);

      const beforePlacementFailure = carrier.snapshot();
      expect(() =>
        carrier.applyChange({
          placements: [
            { blockId: blockA, placement: position(2, 1) },
            { blockId: rootId, placement: position(3, 1) },
          ],
        }),
      ).toThrow(/root cannot have a placement/u);
      expect(carrier.snapshot()).toEqual(beforePlacementFailure);
    });

    it("applies sequential text operations against evolving transaction state", () => {
      const carrier = seeded(factory);
      carrier.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 5,
            text: " beta",
            origin: human,
          },
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 10,
            text: "!",
            origin: human,
          },
          {
            kind: "delete-text",
            inlineContentId: textId,
            start: 5,
            end: 6,
          },
        ],
      });
      expect(text(carrier)).toBe("alphabeta!");
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
