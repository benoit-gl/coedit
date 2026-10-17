import { describe, expect, it } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import type { IntegratedDocumentCarrierFactory } from "../integrated/carrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";

const rootId = parseBlockId("84000000-0000-4000-8000-000000000001");
const textId = parseInlineContentId("84000000-0000-4000-8000-000000000002");
const opaqueId = parseInlineContentId("84000000-0000-4000-8000-000000000003");
const origin = { id: "human-original", kind: "human" as const };

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
  describe(factory.candidate + " integrated editor positions", () => {
    it("round-trips a transient selection through candidate positions and reload", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [
          { inlineContentId: textId, blockId: rootId },
          { inlineContentId: opaqueId, blockId: rootId },
        ],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: textId,
            mediaType: "text/plain",
            text: "ac",
            origin,
          },
          {
            kind: "replace-opaque",
            inlineContentId: opaqueId,
            mediaType: "application/octet-stream",
            bytes: new Uint8Array([1]),
            origin,
          },
        ],
      });
      const preceding = carrier.createStableTextPosition(textId, 1, "before");
      const following = carrier.createStableTextPosition(textId, 1, "after");
      carrier.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 1,
            text: "b",
            origin,
          },
        ],
      });
      const selection = [
        carrier.resolveStableTextPosition(preceding),
        carrier.resolveStableTextPosition(following),
      ];
      // Candidate affinity is observed, not normalized into a premature
      // carrier-neutral editor-position policy. The pinned candidates have
      // distinct, recorded boundary behavior.
      expect(selection).toEqual(factory.candidate === "yjs" ? [1, 2] : [2, 2]);
      const reopened = factory.load(carrier.encode());
      expect([
        reopened.resolveStableTextPosition(preceding),
        reopened.resolveStableTextPosition(following),
      ]).toEqual(selection);
      expect(() =>
        carrier.createStableTextPosition(opaqueId, 0, "after"),
      ).toThrow(/text payload/u);
      carrier.applyChange({
        payloads: [
          {
            kind: "replace-opaque",
            inlineContentId: textId,
            mediaType: "application/octet-stream",
            bytes: new Uint8Array([2]),
            origin,
          },
        ],
      });
      expect(carrier.resolveStableTextPosition(preceding)).toBeUndefined();
    });

    it("keeps a candidate position resolvable after concurrent carrier edits", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [{ inlineContentId: textId, blockId: rootId }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: textId,
            mediaType: "text/plain",
            text: "ac",
            origin,
          },
        ],
      });
      const position = carrier.createStableTextPosition(textId, 1, "after");
      const remote = factory.load(carrier.encode());
      carrier.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 1,
            text: "b",
            origin,
          },
        ],
      });
      remote.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 1,
            text: "B",
            origin,
          },
        ],
      });
      carrier.mergeEncoded(remote.encode());
      remote.mergeEncoded(carrier.encode());
      expect(remote.snapshot()).toEqual(carrier.snapshot());
      const resolved = carrier.resolveStableTextPosition(position);
      expect(resolved).toBeGreaterThanOrEqual(1);
      expect(resolved).toBeLessThanOrEqual(3);
      expect(
        factory.load(carrier.encode()).resolveStableTextPosition(position),
      ).toBe(resolved);
    });
  });
}
