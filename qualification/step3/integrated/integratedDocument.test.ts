import * as Automerge from "@automerge/automerge";
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
const otherRootId = parseBlockId("70000000-0000-4000-8000-000000000005");
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

    it("preserves complete Origin projection through fine-grained edits", () => {
      const carrier = seeded(factory);
      carrier.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 2,
            text: "X",
            origin: imported,
          },
        ],
      });

      expect(carrier.snapshot().payloads.get(textId)).toEqual({
        kind: "text",
        mediaType: "text/plain",
        text: "alXpha",
        spans: [
          { text: "al", origin: human },
          { text: "X", origin: imported },
          { text: "pha", origin: human },
        ],
      });
    });

    it("preserves edge-case text exactly or rejects the whole mixed change atomically", () => {
      const loneSurrogate = String.fromCharCode(0xd800);
      const cases: readonly IntegratedPayloadChange[] = [
        {
          kind: "replace-text",
          inlineContentId: textId,
          mediaType: "text/plain",
          text: loneSurrogate,
          origin: human,
        },
        {
          kind: "insert-text",
          inlineContentId: textId,
          offset: 5,
          text: loneSurrogate,
          origin: human,
        },
      ];

      for (const payload of cases) {
        const carrier = seeded(factory);
        const before = carrier.snapshot();
        let failed = false;
        try {
          carrier.applyChange({
            placements: [{ blockId: blockA, placement: position(2, 1) }],
            payloads: [payload],
          });
        } catch {
          failed = true;
        }

        if (failed) {
          expect(carrier.snapshot()).toEqual(before);
          continue;
        }

        expect(carrier.snapshot().placements.get(blockA)).toEqual(
          position(2, 1),
        );
        expect(text(carrier)).toBe(
          payload.kind === "replace-text"
            ? loneSurrogate
            : `alpha${loneSurrogate}`,
        );
      }
    });

    it("converges replicas from one encoded genesis and reloads serialization", () => {
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

    it("rejects the same root from a different replica lineage", () => {
      const carrier = seeded(factory);
      const before = carrier.snapshot();
      const encoded = factory.create(rootId).encode();
      expect(() => carrier.mergeEncoded(encoded)).toThrow(/replica lineage/u);
      expect(carrier.snapshot()).toEqual(before);
    });

    it("rejects a foreign root before mutating a live replica", () => {
      const carrier = seeded(factory);
      const before = carrier.snapshot();
      const encoded = factory.create(otherRootId).encode();
      expect(() => carrier.mergeEncoded(encoded)).toThrow(/root identity/u);
      expect(carrier.snapshot()).toEqual(before);
    });
  });
}

describe("automerge integrated Origin validation", () => {
  const factory = createAutomergeIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
  );

  it("rejects text that lacks complete Origin attribution", () => {
    const encoded = Automerge.save(
      Automerge.from({
        rootId,
        lineageId: "origin-validation-fixture",
        blocks: {},
        payloads: {
          [textId]: {
            kind: "text" as const,
            mediaType: "text/plain",
            text: "unattributed",
          },
        },
      }),
    );

    expect(() => factory.load(encoded).snapshot()).toThrow(/missing Origin/u);
  });
});

describe("yjs integrated transaction preflight", () => {
  const factory = createYjsIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
  );

  it("rejects Origin preparation failure before mutating structure", () => {
    const carrier = seeded(factory);
    const before = carrier.snapshot();
    const throwingOrigin = {
      get id(): string {
        throw new TypeError("Origin access failed.");
      },
      kind: "human" as const,
    };

    expect(() =>
      carrier.applyChange({
        placements: [{ blockId: blockA, placement: position(2, 1) }],
        payloads: [
          {
            kind: "replace-opaque",
            inlineContentId: opaqueId,
            mediaType: "application/example",
            bytes: Uint8Array.of(1, 2, 3),
            origin: throwingOrigin,
          },
        ],
      }),
    ).toThrow(/Origin access failed/u);
    expect(carrier.snapshot()).toEqual(before);
  });
});

describe("yjs integrated root identity", () => {
  const factory = createYjsIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
  );

  it("rejects encoded state whose envelope disagrees with native state", () => {
    const encoded = factory.create(otherRootId).encode();
    overwriteEnvelopeRoot(encoded, rootId);
    expect(() => factory.load(encoded)).toThrow(/root identity is invalid/u);
  });

  it("rejects a mismatched native root before mutating a live replica", () => {
    const carrier = seeded(factory);
    const before = carrier.snapshot();
    const encoded = factory.create(otherRootId).encode();
    overwriteEnvelopeRoot(encoded, rootId);
    expect(() => carrier.mergeEncoded(encoded)).toThrow(
      /root identity is invalid/u,
    );
    expect(carrier.snapshot()).toEqual(before);
  });
});

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

function overwriteEnvelopeRoot(encoded: Uint8Array, replacement: string): void {
  for (let index = 0; index < replacement.length; index += 1)
    encoded[index] = replacement.charCodeAt(index);
}
