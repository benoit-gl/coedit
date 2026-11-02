import { describe, expect, it } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "./automergeIntegratedDocumentCarrier.js";
import type { IntegratedDocumentCarrierFactory } from "./carrier.js";
import { qualificationEffectIdentity } from "./effectContext.js";
import {
  replacementAlternatives,
  replacementWinnerAlternatives,
  editsNotBasedOnWinner,
} from "./replacementEvidence.js";
import { createYjsIntegratedDocumentCarrierFactory } from "./yjsIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";

const root = parseBlockId("71000000-0000-4000-8000-000000000001");
const content = parseInlineContentId("71000000-0000-4000-8000-000000000002");
const other = parseInlineContentId("71000000-0000-4000-8000-000000000003");
const origin = { id: "author", kind: "human" as const };
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
  describe(`${factory.candidate} replacement fan-in`, () => {
    it("follows replacement ancestry through unrelated effects and duplicate deliveries", () => {
      const base = factory.create(root);
      base.applyChange({
        inlineContents: [
          { inlineContentId: content, blockId: root },
          { inlineContentId: other, blockId: root },
        ],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "base",
            origin,
          },
          {
            kind: "replace-text",
            inlineContentId: other,
            mediaType: "text/plain",
            text: "other",
            origin,
          },
        ],
        context: { actorId: "owner", effectId: "base" },
      });
      const first = factory.load(base.encode());
      const concurrent = factory.load(base.encode());
      first.applyChange({
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "first",
            origin,
          },
        ],
        context: { actorId: "alice", effectId: "first" },
      });
      first.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: other,
            offset: 5,
            text: "!",
            origin,
          },
        ],
        context: { actorId: "alice", effectId: "unrelated" },
      });
      first.applyChange({
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "later",
            origin,
          },
        ],
        context: { actorId: "alice", effectId: "later" },
      });
      concurrent.applyChange({
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "concurrent",
            origin,
          },
        ],
        context: { actorId: "bob", effectId: "concurrent" },
      });
      const firstBytes = first.encode();
      const concurrentBytes = concurrent.encode();
      first.mergeEncoded(concurrentBytes);
      first.mergeEncoded(concurrentBytes);
      concurrent.mergeEncoded(firstBytes);
      concurrent.mergeEncoded(firstBytes);
      expect(first.snapshot()).toEqual(concurrent.snapshot());
      const effects = first.recordedPayloadEffects();
      expect(effects).toEqual(concurrent.recordedPayloadEffects());
      expect(
        replacementAlternatives(effects, content).map(
          ({ effectId }) => effectId,
        ),
      ).toEqual(
        [
          qualificationEffectIdentity({ actorId: "alice", effectId: "later" }),
          qualificationEffectIdentity({
            actorId: "bob",
            effectId: "concurrent",
          }),
        ].sort(),
      );
      expect(
        effects.some(
          ({ effectId }) =>
            effectId ===
            qualificationEffectIdentity({
              actorId: "alice",
              effectId: "first",
            }),
        ),
      ).toBe(true);
      expect(factory.load(first.encode()).recordedPayloadEffects()).toEqual(
        effects,
      );
    });
    for (const count of [2, 4, 8]) {
      it(`retains ${count} concurrent branches and their captured states across reordered fan-in and reload`, () => {
        const base = factory.create(root);
        base.applyChange({
          inlineContents: [{ inlineContentId: content, blockId: root }],
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: content,
              mediaType: "text/plain",
              text: "base",
              origin,
            },
          ],
          context: { actorId: "owner", effectId: "base" },
        });
        const genesis = base.encode();
        const branches = Array.from({ length: count }, (_, i) => {
          const branch = factory.load(genesis);
          const actorId = `actor-${i}`;
          branch.applyChange({
            payloads: [
              i % 2 === 0
                ? {
                    kind: "replace-text",
                    inlineContentId: content,
                    mediaType: "text/plain",
                    text: `branch-${i}`,
                    origin,
                  }
                : {
                    kind: "replace-opaque",
                    inlineContentId: content,
                    mediaType: "application/example",
                    bytes: Uint8Array.of(i, 255 - i),
                    origin,
                  },
            ],
            context: { actorId, effectId: "replace" },
          });
          if (i % 2 === 0)
            branch.applyChange({
              payloads: [
                {
                  kind: "insert-text",
                  inlineContentId: content,
                  offset: 8,
                  text: "!",
                  origin,
                },
              ],
              context: { actorId, effectId: "edit" },
            });
          const expected = branch.snapshot();
          const token = branch.captureHistoricalState();
          return { encoded: branch.encode(), expected, token, actorId };
        });
        const forward = factory.load(genesis);
        const reverse = factory.load(genesis);
        for (const branch of branches) forward.mergeEncoded(branch.encoded);
        for (const branch of [...branches].reverse())
          reverse.mergeEncoded(branch.encoded);
        expect(forward.snapshot()).toEqual(reverse.snapshot());
        const effects = forward.recordedPayloadEffects();
        expect(effects).toEqual(reverse.recordedPayloadEffects());
        const ids = branches
          .map(({ actorId }) =>
            qualificationEffectIdentity({ actorId, effectId: "replace" }),
          )
          .sort();
        expect(
          replacementAlternatives(effects, content).map(
            ({ effectId }) => effectId,
          ),
        ).toEqual(ids);
        expect(replacementWinnerAlternatives(effects, content)).toEqual({
          lowest: ids[0],
          highest: ids[ids.length - 1],
        });
        for (const branch of branches) {
          expect(forward.materializeHistoricalState(branch.token)).toEqual(
            branch.expected,
          );
          expect(reverse.materializeHistoricalState(branch.token)).toEqual(
            branch.expected,
          );
        }
        const reopened = factory.load(forward.encode());
        for (const branch of branches)
          expect(reopened.materializeHistoricalState(branch.token)).toEqual(
            branch.expected,
          );
        expect(
          replacementAlternatives(reopened.recordedPayloadEffects(), content),
        ).toEqual(replacementAlternatives(effects, content));
        // Even if either stable winner is chosen later, edits on other text branches remain attributable.
        expect(
          editsNotBasedOnWinner(effects, content, ids[1] as string),
        ).toContain(
          qualificationEffectIdentity({ actorId: "actor-0", effectId: "edit" }),
        );
        reopened.applyChange({
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: content,
              mediaType: "text/plain",
              text: "after fan-in",
              origin,
            },
          ],
          context: { actorId: "owner", effectId: "after" },
        });
        expect(
          replacementAlternatives(
            reopened.recordedPayloadEffects(),
            content,
          ).map(({ effectId }) => effectId),
        ).toEqual([
          qualificationEffectIdentity({ actorId: "owner", effectId: "after" }),
        ]);
        // A causally later winner removes old alternatives from the frontier, not from retained state.
        for (const branch of branches)
          expect(reopened.materializeHistoricalState(branch.token)).toEqual(
            branch.expected,
          );
        reopened.restoreHistoricalState(branches[0]!.token, {
          actorId: "owner",
          effectId: "restore",
        });
        expect(reopened.snapshot()).toEqual(branches[0]!.expected);
        const restored = factory.load(reopened.encode());
        for (const branch of branches)
          expect(restored.materializeHistoricalState(branch.token)).toEqual(
            branch.expected,
          );
      });
    }
  });
}
