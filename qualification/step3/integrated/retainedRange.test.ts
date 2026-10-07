import { describe, expect, it } from "vitest";
import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { createYjsIntegratedDocumentCarrierFactory } from "./yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "./automergeIntegratedDocumentCarrier.js";
import { createProbeRange, resolveProbeText } from "./rangeProbe.js";
import {
  editsNotBasedOnWinner,
  replacementWinnerAlternatives,
} from "./replacementEvidence.js";

const root = parseBlockId("70000000-0000-4000-8000-000000000001");
const content = parseInlineContentId("70000000-0000-4000-8000-000000000003");
const actor = { id: "actor", kind: "human" as const };
const factories = [
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
  describe(
    factory.candidate + " retained range and effect qualification",
    () => {
      it("stores effect attribution atomically with semantic state and across reload", () => {
        const carrier = factory.create(root);
        carrier.applyChange({
          inlineContents: [{ inlineContentId: content, blockId: root }],
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: content,
              mediaType: "text/plain",
              text: "hello",
              origin: actor,
            },
          ],
          context: { effectId: "effect-1", actorId: "actor-1" },
        });
        expect(carrier.effects().get("effect-1")?.actorId).toBe("actor-1");
        expect(carrier.recordedPayloadEffects()).toHaveLength(1);
        const recovered = factory.load(carrier.encode());
        expect(recovered.effects()).toEqual(carrier.effects());
        expect(recovered.recordedPayloadEffects()).toEqual(
          carrier.recordedPayloadEffects(),
        );
        const before = recovered.snapshot();
        expect(() =>
          recovered.applyChange({
            payloads: [
              {
                kind: "insert-text",
                inlineContentId: content,
                offset: 5,
                text: "!",
                origin: actor,
              },
            ],
            context: { effectId: "effect-1", actorId: "actor-2" },
          }),
        ).toThrow(/reused/u);
        expect(recovered.snapshot()).toEqual(before);
      });

      it("retains independent concurrent replacements and losing-branch text edits", () => {
        const base = factory.create(root);
        base.applyChange({
          inlineContents: [{ inlineContentId: content, blockId: root }],
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: content,
              mediaType: "text/plain",
              text: "base",
              origin: actor,
            },
          ],
          context: { effectId: "genesis", actorId: "owner" },
        });
        const left = factory.load(base.encode());
        const right = factory.load(base.encode());
        left.applyChange({
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: content,
              mediaType: "text/plain",
              text: "left",
              origin: actor,
            },
          ],
          context: { effectId: "left", actorId: "alice" },
        });
        right.applyChange({
          payloads: [
            {
              kind: "replace-opaque",
              inlineContentId: content,
              mediaType: "application/example",
              bytes: Uint8Array.of(1),
              origin: actor,
            },
          ],
          context: { effectId: "right", actorId: "bob" },
        });
        const leftState = left.encode(),
          rightState = right.encode();
        left.mergeEncoded(rightState);
        right.mergeEncoded(leftState);
        expect(left.recordedPayloadEffects()).toEqual(
          right.recordedPayloadEffects(),
        );
        const choices = replacementWinnerAlternatives(
          left.recordedPayloadEffects(),
          content,
        );
        expect(choices).toEqual({ lowest: "left", highest: "right" });
        expect(factory.load(left.encode()).recordedPayloadEffects()).toEqual(
          left.recordedPayloadEffects(),
        );
        expect(
          editsNotBasedOnWinner(left.recordedPayloadEffects(), content, "left"),
        ).toEqual([]);
      });

      it("resolves lazily from retained tokens and does not follow replacement to opaque", () => {
        const carrier = factory.create(root);
        carrier.applyChange({
          inlineContents: [{ inlineContentId: content, blockId: root }],
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: content,
              mediaType: "text/plain",
              text: "abcd",
              origin: actor,
            },
          ],
        });
        const creation = carrier.captureHistoricalState();
        const range = createProbeRange(carrier, creation, "span", [
          { blockId: root, inlineContentId: content, start: 1, end: 3 },
          { blockId: root, inlineContentId: content, start: 1, end: 3 },
        ]);
        carrier.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: content,
              offset: 1,
              text: "X",
              origin: actor,
            },
          ],
        });
        const edited = carrier.captureHistoricalState();
        expect(
          resolveProbeText(carrier, range, edited, [
            {
              from: creation,
              to: edited,
              edits: [
                {
                  kind: "insert",
                  inlineContentId: content,
                  offset: 1,
                  length: 1,
                },
              ],
            },
          ]),
        ).toBe("XbcXbc");
        carrier.applyChange({
          payloads: [
            {
              kind: "replace-opaque",
              inlineContentId: content,
              mediaType: "application/example",
              bytes: Uint8Array.of(2),
              origin: actor,
            },
          ],
        });
        const opaque = carrier.captureHistoricalState();
        expect(
          resolveProbeText(carrier, range, opaque, [
            {
              from: creation,
              to: edited,
              edits: [
                {
                  kind: "insert",
                  inlineContentId: content,
                  offset: 1,
                  length: 1,
                },
              ],
            },
            { from: edited, to: opaque, invalidated: [content] },
          ]),
        ).toBe("");
      });
    },
  );
}
