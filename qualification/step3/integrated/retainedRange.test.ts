import { describe, expect, it } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import type { StructuralPlacement } from "../../../src/carrier/index.js";
import type {
  IntegratedDocumentCarrier,
  IntegratedDocumentCarrierFactory,
} from "./carrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "./automergeIntegratedDocumentCarrier.js";
import { qualificationEffectIdentity } from "./effectContext.js";
import { buildRetainedRangeScalingFixture } from "./rangeScaling.js";
import {
  createProbeRange,
  resolveProbeRange,
  resolveProbeText,
} from "./rangeProbe.js";
import type { ProbeTransition } from "./rangeProbe.js";
import {
  editsNotBasedOnWinner,
  replacementAlternatives,
  replacementWinnerAlternatives,
} from "./replacementEvidence.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { createYjsIntegratedDocumentCarrierFactory } from "./yjsIntegratedDocumentCarrier.js";

const root = parseBlockId("70000000-0000-4000-8000-000000000001");
const block = parseBlockId("70000000-0000-4000-8000-000000000002");
const splitBlock = parseBlockId("70000000-0000-4000-8000-000000000006");
const content = parseInlineContentId("70000000-0000-4000-8000-000000000003");
const splitContent = parseInlineContentId(
  "70000000-0000-4000-8000-000000000007",
);
const copiedContent = parseInlineContentId(
  "70000000-0000-4000-8000-000000000008",
);
const opaqueContent = parseInlineContentId(
  "70000000-0000-4000-8000-000000000009",
);
const collisionBlock = parseBlockId("70000000-0000-4000-8000-000000000010");
const actor = { id: "actor", kind: "human" as const };

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
  describe(`${factory.candidate} retained range and effect qualification`, () => {
    it("publishes attribution and copy/restore derivation with semantic state", () => {
      const carrier = factory.create(root);
      carrier.applyChange({
        placements: [{ blockId: block, placement: position(1) }],
        inlineContents: [{ inlineContentId: content, blockId: block }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "source",
            origin: actor,
          },
        ],
        context: { effectId: "source", actorId: "author" },
      });
      const retained = carrier.captureHistoricalState();
      carrier.applyChange({
        inlineContents: [{ inlineContentId: copiedContent, blockId: root }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: copiedContent,
            mediaType: "text/plain",
            text: "source",
            origin: actor,
          },
        ],
        context: {
          effectId: "copy",
          actorId: "copier",
          source: {
            kind: "copy",
            reference: effectKey("author", "source"),
          },
        },
      });
      const beforeFailure = carrier.snapshot();
      expect(() =>
        carrier.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: content,
              offset: 99,
              text: "!",
              origin: actor,
            },
          ],
          context: { effectId: "failed", actorId: "author" },
        }),
      ).toThrow();
      expect(carrier.snapshot()).toEqual(beforeFailure);
      expect(carrier.effects().has(effectKey("author", "failed"))).toBe(false);

      carrier.restoreHistoricalState(retained, {
        effectId: "restore",
        actorId: "restorer",
        source: { kind: "restore", reference: retained },
      });
      const recovered = factory.load(carrier.encode());
      expect(recovered.effects()).toEqual(
        new Map([
          [
            effectKey("copier", "copy"),
            {
              effectId: "copy",
              actorId: "copier",
              source: {
                kind: "copy",
                reference: effectKey("author", "source"),
              },
            },
          ],
          [
            effectKey("restorer", "restore"),
            {
              effectId: "restore",
              actorId: "restorer",
              source: { kind: "restore", reference: retained },
            },
          ],
          [
            effectKey("author", "source"),
            { effectId: "source", actorId: "author" },
          ],
        ]),
      );
      expect(recovered.snapshot()).toEqual(
        carrier.materializeHistoricalState(retained),
      );
    });

    it("qualifies direct ranges across edits, movement, split, merge, delete, and reload", () => {
      const carrier = factory.create(root);
      carrier.applyChange({
        placements: [{ blockId: block, placement: position(1) }],
        inlineContents: [{ inlineContentId: content, blockId: block }],
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
      const created = carrier.captureHistoricalState();
      const range = createProbeRange(carrier, created, "span", [
        { blockId: block, inlineContentId: content, start: 1, end: 2 },
        { blockId: block, inlineContentId: content, start: 2, end: 3 },
      ]);
      const spanningRange = createProbeRange(carrier, created, "span", [
        { blockId: block, inlineContentId: content, start: 1, end: 3 },
      ]);
      const greedyBoundary = createProbeRange(carrier, created, "span", [
        { blockId: block, inlineContentId: content, start: 2, end: 2 },
      ]);
      const precedingPosition = createProbeRange(carrier, created, "position", [
        { blockId: block, inlineContentId: content, start: 2, end: 2 },
      ]);

      carrier.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: content,
            offset: 2,
            text: "X",
            origin: actor,
          },
        ],
      });
      const inserted = carrier.captureHistoricalState();
      const insertTransition = {
        from: created,
        to: inserted,
        edits: [
          {
            kind: "insert" as const,
            inlineContentId: content,
            offset: 2,
            length: 1,
          },
        ],
      };
      expect(
        resolveProbeText(carrier, range, inserted, [insertTransition]),
      ).toBe("bXXc");
      expect(
        resolveProbeText(carrier, greedyBoundary, inserted, [insertTransition]),
      ).toBe("X");
      expect(
        resolveProbeRange(carrier, precedingPosition, inserted, [
          insertTransition,
        ])[0],
      ).toMatchObject({ start: 2, end: 2, text: "" });

      carrier.applyChange({
        payloads: [
          {
            kind: "delete-text",
            inlineContentId: content,
            start: 2,
            end: 3,
          },
        ],
      });
      const deletedText = carrier.captureHistoricalState();
      const deleteTransition = {
        from: inserted,
        to: deletedText,
        edits: [
          {
            kind: "delete" as const,
            inlineContentId: content,
            start: 2,
            end: 3,
          },
        ],
      };
      expect(
        resolveProbeText(carrier, range, deletedText, [
          insertTransition,
          deleteTransition,
        ]),
      ).toBe("bc");

      carrier.applyChange({
        placements: [{ blockId: block, placement: position(2) }],
      });
      const moved = carrier.captureHistoricalState();
      const moveTransition = { from: deletedText, to: moved };
      expect(
        resolveProbeText(carrier, range, moved, [
          insertTransition,
          deleteTransition,
          moveTransition,
        ]),
      ).toBe("bc");

      carrier.applyChange({
        placements: [{ blockId: splitBlock, placement: position(3) }],
        inlineContents: [
          { inlineContentId: splitContent, blockId: splitBlock },
        ],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "ab",
            origin: actor,
          },
          {
            kind: "replace-text",
            inlineContentId: splitContent,
            mediaType: "text/plain",
            text: "cd",
            origin: actor,
          },
        ],
      });
      const split = carrier.captureHistoricalState();
      const splitTransition = {
        from: moved,
        to: split,
        lineage: [
          {
            sourceInlineContentId: content,
            sourceStart: 0,
            sourceEnd: 2,
            targetBlockId: block,
            targetInlineContentId: content,
            targetStart: 0,
          },
          {
            sourceInlineContentId: content,
            sourceStart: 2,
            sourceEnd: 4,
            targetBlockId: splitBlock,
            targetInlineContentId: splitContent,
            targetStart: 0,
          },
        ],
      };
      expect(
        resolveProbeText(carrier, range, split, [
          insertTransition,
          deleteTransition,
          moveTransition,
          splitTransition,
        ]),
      ).toBe("bc");
      expect(
        resolveProbeRange(carrier, spanningRange, split, [
          insertTransition,
          deleteTransition,
          moveTransition,
          splitTransition,
        ]),
      ).toMatchObject([
        { inlineContentId: content, start: 1, end: 2, text: "b" },
        { inlineContentId: splitContent, start: 0, end: 1, text: "c" },
      ]);

      carrier.applyChange({
        deleteBlockIds: [splitBlock],
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
      const merged = carrier.captureHistoricalState();
      const mergeTransition = {
        from: split,
        to: merged,
        lineage: [
          {
            sourceInlineContentId: content,
            sourceStart: 0,
            sourceEnd: 2,
            targetBlockId: block,
            targetInlineContentId: content,
            targetStart: 0,
          },
          {
            sourceInlineContentId: splitContent,
            sourceStart: 0,
            sourceEnd: 2,
            targetBlockId: block,
            targetInlineContentId: content,
            targetStart: 2,
          },
        ],
      };
      const transitions = [
        insertTransition,
        deleteTransition,
        moveTransition,
        splitTransition,
        mergeTransition,
      ];
      expect(resolveProbeText(carrier, range, merged, transitions)).toBe("bc");
      expect(
        resolveProbeRange(carrier, range, merged, transitions),
      ).toMatchObject([
        { inlineContentId: content, start: 1, end: 2, text: "b" },
        { inlineContentId: content, start: 2, end: 3, text: "c" },
      ]);
      const reopened = factory.load(carrier.encode());
      expect(resolveProbeText(reopened, range, merged, transitions)).toBe("bc");

      carrier.applyChange({ deleteBlockIds: [block] });
      const deleted = carrier.captureHistoricalState();
      expect(
        resolveProbeText(carrier, range, deleted, [
          ...transitions,
          { from: merged, to: deleted },
        ]),
      ).toBe("");
    });

    it("maps combined text edits and structural lineage", () => {
      const carrier = factory.create(root);
      carrier.applyChange({
        placements: [{ blockId: block, placement: position(1) }],
        inlineContents: [{ inlineContentId: content, blockId: block }],
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
      const before = carrier.captureHistoricalState();
      const range = createProbeRange(carrier, before, "span", [
        { blockId: block, inlineContentId: content, start: 1, end: 3 },
      ]);

      // Both the insertion and the split publish in one native carrier change.
      carrier.applyChange({
        placements: [{ blockId: splitBlock, placement: position(2) }],
        inlineContents: [
          { inlineContentId: splitContent, blockId: splitBlock },
        ],
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: content,
            offset: 0,
            text: "X",
            origin: actor,
          },
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "Xab",
            origin: actor,
          },
          {
            kind: "replace-text",
            inlineContentId: splitContent,
            mediaType: "text/plain",
            text: "cd",
            origin: actor,
          },
        ],
      });
      const afterSplit = carrier.captureHistoricalState();
      const splitEdge: ProbeTransition = {
        from: before,
        to: afterSplit,
        edits: [
          { kind: "insert", inlineContentId: content, offset: 0, length: 1 },
        ],
        lineage: [
          {
            sourceInlineContentId: content,
            sourceStart: 0,
            sourceEnd: 3,
            targetBlockId: block,
            targetInlineContentId: content,
            targetStart: 0,
          },
          {
            sourceInlineContentId: content,
            sourceStart: 3,
            sourceEnd: 5,
            targetBlockId: splitBlock,
            targetInlineContentId: splitContent,
            targetStart: 0,
          },
        ],
      };
      expect(
        resolveProbeRange(carrier, range, afterSplit, [splitEdge]),
      ).toMatchObject([
        { inlineContentId: content, start: 2, end: 3, text: "b" },
        { inlineContentId: splitContent, start: 0, end: 1, text: "c" },
      ]);
      expect(
        resolveProbeText(carrier, range, afterSplit, [splitEdge]),
      ).toBe("bc");
      expect(() =>
        resolveProbeRange(carrier, range, afterSplit, [
          {
            ...splitEdge,
            edits: [
              {
                kind: "insert",
                inlineContentId: content,
                offset: 5,
                length: 1,
              },
            ],
          },
        ]),
      ).toThrow(/Probe edit exceeds source text bounds/u);

      // A deletion and merge likewise share one atomic carrier change.
      carrier.applyChange({
        deleteBlockIds: [splitBlock],
        payloads: [
          {
            kind: "delete-text",
            inlineContentId: content,
            start: 0,
            end: 1,
          },
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "abcd",
            origin: actor,
          },
        ],
      });
      const afterMerge = carrier.captureHistoricalState();
      const mergeEdge: ProbeTransition = {
        from: afterSplit,
        to: afterMerge,
        edits: [
          { kind: "delete", inlineContentId: content, start: 0, end: 1 },
        ],
        lineage: [
          {
            sourceInlineContentId: content,
            sourceStart: 0,
            sourceEnd: 2,
            targetBlockId: block,
            targetInlineContentId: content,
            targetStart: 0,
          },
          {
            sourceInlineContentId: splitContent,
            sourceStart: 0,
            sourceEnd: 2,
            targetBlockId: block,
            targetInlineContentId: content,
            targetStart: 2,
          },
        ],
      };
      expect(
        resolveProbeText(carrier, range, afterMerge, [splitEdge, mergeEdge]),
      ).toBe("bc");
      expect(() =>
        resolveProbeRange(carrier, range, afterMerge, [
          splitEdge,
          {
            ...mergeEdge,
            lineage: mergeEdge.lineage?.map((segment) =>
              segment.sourceInlineContentId === content
                ? { ...segment, sourceEnd: 3 }
                : segment,
            ),
          },
        ]),
      ).toThrow(/Probe lineage source offsets are invalid/u);
    });

    it("maps atomic replacement like delete then insert across span boundaries", () => {
      const carrier = factory.create(root);
      carrier.applyChange({
        inlineContents: [{ inlineContentId: content, blockId: root }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "abcdef",
            origin: actor,
          },
        ],
      });
      const before = carrier.captureHistoricalState();
      const boundary = createProbeRange(carrier, before, "span", [
        { blockId: root, inlineContentId: content, start: 1, end: 5 },
      ]);
      const crossing = createProbeRange(carrier, before, "span", [
        { blockId: root, inlineContentId: content, start: 0, end: 6 },
      ]);
      carrier.applyChange({
        payloads: [
          {
            kind: "delete-text",
            inlineContentId: content,
            start: 1,
            end: 5,
          },
          {
            kind: "insert-text",
            inlineContentId: content,
            offset: 1,
            text: "WXYZ",
            origin: actor,
          },
        ],
      });
      const after = carrier.captureHistoricalState();
      const replacement = {
        from: before,
        to: after,
        edits: [
          {
            kind: "replace" as const,
            inlineContentId: content,
            start: 1,
            end: 5,
            length: 4,
          },
        ],
      };
      const separateEdits = {
        from: before,
        to: after,
        edits: [
          {
            kind: "delete" as const,
            inlineContentId: content,
            start: 1,
            end: 5,
          },
          {
            kind: "insert" as const,
            inlineContentId: content,
            offset: 1,
            length: 4,
          },
        ],
      };
      expect(resolveProbeText(carrier, boundary, after, [replacement])).toBe(
        "WXYZ",
      );
      expect(
        resolveProbeRange(carrier, boundary, after, [replacement]),
      ).toEqual(resolveProbeRange(carrier, boundary, after, [separateEdits]));
      expect(resolveProbeText(carrier, crossing, after, [replacement])).toBe(
        "aWXYZf",
      );
    });

    it("rejects opaque members and never rebinds after an opaque replacement", () => {
      const carrier = factory.create(root);
      carrier.applyChange({
        inlineContents: [
          { inlineContentId: content, blockId: root },
          { inlineContentId: opaqueContent, blockId: root },
        ],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "same",
            origin: actor,
          },
          {
            kind: "replace-opaque",
            inlineContentId: opaqueContent,
            mediaType: "application/example",
            bytes: Uint8Array.of(1),
            origin: actor,
          },
        ],
      });
      const created = carrier.captureHistoricalState();
      const range = createProbeRange(carrier, created, "span", [
        { blockId: root, inlineContentId: content, start: 0, end: 4 },
      ]);
      const beforeOpaqueFailure = carrier.snapshot();
      expect(() =>
        createProbeRange(carrier, created, "span", [
          { blockId: root, inlineContentId: opaqueContent, start: 0, end: 0 },
        ]),
      ).toThrow(/text target/u);
      expect(carrier.snapshot()).toEqual(beforeOpaqueFailure);

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
      carrier.applyChange({
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "same",
            origin: actor,
          },
        ],
      });
      const coincidentalText = carrier.captureHistoricalState();
      expect(
        resolveProbeText(carrier, range, coincidentalText, [
          { from: created, to: opaque, invalidated: [content] },
          { from: opaque, to: coincidentalText },
        ]),
      ).toBe("");
    });

    it("exposes only the final same- and cross-type replacement in one effect", () => {
      const carrier = factory.create(root);
      carrier.applyChange({
        inlineContents: [
          { inlineContentId: content, blockId: root },
          { inlineContentId: opaqueContent, blockId: root },
        ],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "superseded",
            origin: actor,
          },
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "effective",
            origin: actor,
          },
          {
            kind: "replace-text",
            inlineContentId: opaqueContent,
            mediaType: "text/plain",
            text: "superseded",
            origin: actor,
          },
          {
            kind: "replace-opaque",
            inlineContentId: opaqueContent,
            mediaType: "application/example",
            bytes: Uint8Array.of(9),
            origin: actor,
          },
        ],
        context: { effectId: "double-replacement", actorId: "actor" },
      });
      expect(
        replacementAlternatives(carrier.recordedPayloadEffects(), content),
      ).toMatchObject([
        {
          effectId: effectKey("actor", "double-replacement"),
          operation: { text: "effective" },
        },
      ]);
      expect(
        replacementAlternatives(
          carrier.recordedPayloadEffects(),
          opaqueContent,
        ),
      ).toMatchObject([
        {
          effectId: effectKey("actor", "double-replacement"),
          operation: { kind: "replace-opaque", bytes: [9] },
        },
      ]);
    });

    it("does not continue a probe Range through copied text", () => {
      const carrier = factory.create(root);
      carrier.applyChange({
        placements: [{ blockId: block, placement: position(1) }],
        inlineContents: [{ inlineContentId: content, blockId: block }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "source",
            origin: actor,
          },
        ],
      });
      const created = carrier.captureHistoricalState();
      const range = createProbeRange(carrier, created, "span", [
        { blockId: block, inlineContentId: content, start: 0, end: 6 },
      ]);
      carrier.applyChange({
        placements: [{ blockId: splitBlock, placement: position(2) }],
        inlineContents: [
          { inlineContentId: copiedContent, blockId: splitBlock },
        ],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: copiedContent,
            mediaType: "text/plain",
            text: "source",
            origin: actor,
          },
        ],
        context: {
          effectId: "copy-effect",
          actorId: "copier",
          source: { kind: "copy", reference: created },
        },
      });
      const copied = carrier.captureHistoricalState();
      carrier.applyChange({ deleteBlockIds: [block] });
      const sourceDeleted = carrier.captureHistoricalState();
      expect(
        resolveProbeText(carrier, range, sourceDeleted, [
          { from: created, to: copied },
          { from: copied, to: sourceDeleted },
        ]),
      ).toBe("");
      expect(carrier.snapshot().payloads.get(copiedContent)).toMatchObject({
        kind: "text",
        text: "source",
      });
    });

    for (const replacementKind of ["same-type", "cross-type"] as const) {
      it(`retains ${replacementKind} replacement alternatives and losing edits across delivery faults`, () => {
        const { left, right, leftUpdates, rightUpdates } = replacementBranches(
          factory,
          replacementKind,
        );
        convergeWithDuplicates(left, right, leftUpdates, rightUpdates);
        expect(left.snapshot()).toEqual(right.snapshot());
        const effects = left.recordedPayloadEffects();
        expect(effects).toEqual(right.recordedPayloadEffects());
        expect(replacementWinnerAlternatives(effects, content)).toEqual({
          lowest: effectKey("alice", "left-replace"),
          highest: effectKey("bob", "right-replace"),
        });
        expect(replacementAlternatives(effects, content)).toMatchObject(
          replacementKind === "same-type"
            ? [
                {
                  effectId: effectKey("alice", "left-replace"),
                  operation: {
                    mediaType: "text/plain",
                    text: "left",
                    origin: '{"id":"actor","kind":"human"}',
                  },
                },
                {
                  effectId: effectKey("bob", "right-replace"),
                  operation: {
                    mediaType: "text/plain",
                    text: "right",
                    origin: '{"id":"actor","kind":"human"}',
                  },
                },
              ]
            : [
                {
                  effectId: effectKey("alice", "left-replace"),
                  operation: {
                    mediaType: "text/plain",
                    text: "left",
                    origin: '{"id":"actor","kind":"human"}',
                  },
                },
                {
                  effectId: effectKey("bob", "right-replace"),
                  operation: {
                    mediaType: "application/example",
                    bytes: [7],
                    origin: '{"id":"actor","kind":"human"}',
                  },
                },
              ],
        );
        expect(
          editsNotBasedOnWinner(
            effects,
            content,
            effectKey("bob", "right-replace"),
          ),
        ).toEqual([
          effectKey("alice", "left-delete"),
          effectKey("alice", "left-insert"),
          effectKey("alice", "left-text-replace"),
        ]);
        if (replacementKind === "same-type")
          expect(
            editsNotBasedOnWinner(
              effects,
              content,
              effectKey("alice", "left-replace"),
            ),
          ).toEqual([
            effectKey("bob", "right-delete"),
            effectKey("bob", "right-insert"),
          ]);
        expect(factory.load(left.encode()).recordedPayloadEffects()).toEqual(
          effects,
        );
      });
    }

    it("separates actors sharing an effect component and rejects pair reuse", () => {
      const base = factory.create(root);
      base.applyChange({
        placements: [{ blockId: block, placement: position(1) }],
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
      });
      const alice = factory.load(base.encode());
      const bob = factory.load(base.encode());
      alice.applyChange({
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "alice",
            origin: actor,
          },
        ],
        context: { actorId: "alice", effectId: "shared-component" },
      });
      bob.applyChange({
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "bob",
            origin: actor,
          },
        ],
        context: { actorId: "bob", effectId: "shared-component" },
      });
      alice.mergeEncoded(bob.encode());
      expect(alice.effects()).toEqual(
        new Map([
          [
            effectKey("alice", "shared-component"),
            { actorId: "alice", effectId: "shared-component" },
          ],
          [
            effectKey("bob", "shared-component"),
            { actorId: "bob", effectId: "shared-component" },
          ],
        ]),
      );
      expect(
        replacementAlternatives(alice.recordedPayloadEffects(), content),
      ).toHaveLength(2);

      const conflictingLeft = factory.load(base.encode());
      const conflictingRight = factory.load(base.encode());
      conflictingLeft.applyChange({
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "one",
            origin: actor,
          },
        ],
        context: { actorId: "same", effectId: "reused" },
      });
      conflictingRight.applyChange({
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "two",
            origin: actor,
          },
        ],
        context: { actorId: "same", effectId: "reused" },
      });
      const beforeRejectedMerge = conflictingLeft.encode();
      expect(() =>
        conflictingLeft.mergeEncoded(conflictingRight.encode()),
      ).toThrow(/Conflicting qualification effect identity/u);
      expect(conflictingLeft.encode()).toEqual(beforeRejectedMerge);

      const structuralLeft = factory.load(base.encode());
      const structuralRight = factory.load(base.encode());
      structuralLeft.applyChange({
        placements: [{ blockId: block, placement: position(2) }],
        context: { actorId: "same", effectId: "structural-reused" },
      });
      structuralRight.applyChange({
        placements: [{ blockId: block, placement: position(3) }],
        context: { actorId: "same", effectId: "structural-reused" },
      });
      expect(() =>
        structuralLeft.mergeEncoded(structuralRight.encode()),
      ).toThrow(/Conflicting qualification effect identity/u);

      const mixedLeft = factory.load(base.encode());
      const mixedRight = factory.load(base.encode());
      mixedLeft.applyChange({
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "payload",
            origin: actor,
          },
        ],
        context: { actorId: "same", effectId: "mixed-reused" },
      });
      mixedRight.applyChange({
        placements: [{ blockId: block, placement: position(4) }],
        context: { actorId: "same", effectId: "mixed-reused" },
      });
      expect(() => mixedLeft.mergeEncoded(mixedRight.encode())).toThrow(
        /Conflicting qualification effect identity/u,
      );

      const identicalLeft = factory.load(base.encode());
      const identicalRight = factory.load(base.encode());
      const identicalContext = {
        actorId: "same",
        effectId: "identical-structural-reuse",
      };
      identicalLeft.applyChange({
        placements: [{ blockId: block, placement: position(5) }],
        context: identicalContext,
      });
      identicalRight.applyChange({
        placements: [{ blockId: block, placement: position(5) }],
        context: identicalContext,
      });
      const beforeIdenticalRejectedMerge = identicalLeft.encode();
      expect(() => identicalLeft.mergeEncoded(identicalRight.encode())).toThrow(
        /Conflicting qualification effect identity/u,
      );
      expect(identicalLeft.encode()).toEqual(beforeIdenticalRejectedMerge);

      const creationLeft = factory.load(base.encode());
      const creationRight = factory.load(base.encode());
      const creationContext = {
        actorId: "same",
        effectId: "identical-creation-reuse",
      };
      for (const carrier of [creationLeft, creationRight])
        carrier.applyChange({
          placements: [{ blockId: collisionBlock, placement: position(6) }],
          context: creationContext,
        });
      expect(() => creationLeft.mergeEncoded(creationRight.encode())).toThrow(
        /Conflicting qualification effect identity/u,
      );

      const deletionLeft = factory.load(base.encode());
      const deletionRight = factory.load(base.encode());
      const deletionContext = {
        actorId: "same",
        effectId: "identical-deletion-reuse",
      };
      for (const carrier of [deletionLeft, deletionRight])
        carrier.applyChange({
          deleteBlockIds: [block],
          context: deletionContext,
        });
      expect(() => deletionLeft.mergeEncoded(deletionRight.encode())).toThrow(
        /Conflicting qualification effect identity/u,
      );

      const deleteVsCreateLeft = factory.load(base.encode());
      const deleteVsCreateRight = factory.load(base.encode());
      const deleteVsCreateContext = {
        actorId: "same",
        effectId: "deletion-versus-creation-reuse",
      };
      deleteVsCreateLeft.applyChange({
        deleteBlockIds: [block],
        context: deleteVsCreateContext,
      });
      deleteVsCreateRight.applyChange({
        placements: [{ blockId: collisionBlock, placement: position(9) }],
        context: deleteVsCreateContext,
      });
      const beforeDeleteVsCreateRejectedMerge = deleteVsCreateLeft.encode();
      expect(() =>
        deleteVsCreateLeft.mergeEncoded(deleteVsCreateRight.encode()),
      ).toThrow(/Conflicting qualification effect identity/u);
      expect(deleteVsCreateLeft.encode()).toEqual(
        beforeDeleteVsCreateRejectedMerge,
      );

      const restoreBase = factory.load(base.encode());
      const restoreToken = restoreBase.captureHistoricalState();
      const restoreLeft = factory.load(restoreBase.encode());
      const restoreRight = factory.load(restoreBase.encode());
      restoreLeft.applyChange({
        placements: [{ blockId: block, placement: position(7) }],
      });
      restoreRight.applyChange({
        placements: [{ blockId: block, placement: position(8) }],
      });
      const restoreContext = {
        actorId: "same",
        effectId: "identical-restore-reuse",
      };
      restoreLeft.restoreHistoricalState(restoreToken, restoreContext);
      restoreRight.restoreHistoricalState(restoreToken, restoreContext);
      expect(() => restoreLeft.mergeEncoded(restoreRight.encode())).toThrow(
        /Conflicting qualification effect identity/u,
      );

      const differentRestoreBase = factory.load(base.encode());
      const firstRestoreToken = differentRestoreBase.captureHistoricalState();
      differentRestoreBase.applyChange({
        placements: [{ blockId: block, placement: position(10) }],
      });
      const secondRestoreToken = differentRestoreBase.captureHistoricalState();
      const differentRestoreLeft = factory.load(differentRestoreBase.encode());
      const differentRestoreRight = factory.load(differentRestoreBase.encode());
      const differentRestoreContext = {
        actorId: "same",
        effectId: "different-restore-reuse",
      };
      differentRestoreLeft.restoreHistoricalState(
        firstRestoreToken,
        differentRestoreContext,
      );
      differentRestoreRight.restoreHistoricalState(
        secondRestoreToken,
        differentRestoreContext,
      );
      const beforeDifferentRestoreRejectedMerge = differentRestoreLeft.encode();
      expect(() =>
        differentRestoreLeft.mergeEncoded(differentRestoreRight.encode()),
      ).toThrow(/Conflicting qualification effect identity/u);
      expect(differentRestoreLeft.encode()).toEqual(
        beforeDifferentRestoreRejectedMerge,
      );
    });

    it("retains evidence through supported native lifecycle behavior and builds scaling fixtures", () => {
      const carrier = factory.create(root);
      carrier.applyChange({
        placements: [{ blockId: block, placement: position(1) }],
        inlineContents: [{ inlineContentId: content, blockId: block }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "abcd",
            origin: actor,
          },
        ],
        context: { effectId: "retained", actorId: "author" },
      });
      const retained = carrier.captureHistoricalState();
      const encodedBeforeRanges = carrier.encode();
      const fixtures = [1, 64, 256].map((count) =>
        buildRetainedRangeScalingFixture(
          carrier,
          retained,
          { blockId: block, inlineContentId: content, start: 1, end: 2 },
          count,
        ),
      );
      expect(fixtures.map((fixture) => fixture.length)).toEqual([1, 64, 256]);
      expect(carrier.encode()).toEqual(encodedBeforeRanges);

      carrier.applyChange({
        placements: [{ blockId: block, placement: position(2) }],
        payloads: [
          {
            kind: "replace-opaque",
            inlineContentId: content,
            mediaType: "application/example",
            bytes: Uint8Array.of(4),
            origin: actor,
          },
        ],
      });
      const afterLifecycle = carrier.captureHistoricalState();
      const reopened = factory.load(carrier.encode());
      expect(reopened.materializeHistoricalState(retained)).toEqual(
        carrier.materializeHistoricalState(retained),
      );
      expect(reopened.effects().get(effectKey("author", "retained"))).toEqual({
        effectId: "retained",
        actorId: "author",
      });
      expect(reopened.recordedPayloadEffects()).toEqual(
        carrier.recordedPayloadEffects(),
      );
      expect(
        resolveProbeText(reopened, fixtures[2]![0]!, afterLifecycle, [
          { from: retained, to: afterLifecycle, invalidated: [content] },
        ]),
      ).toBe("");
      expect(carrier.nativeLifecycle()).toEqual(
        factory.candidate === "yjs"
          ? { kind: "automatic-garbage-collection", availability: "supported" }
          : { kind: "none", availability: "unavailable" },
      );
    });
  });
}

function replacementBranches(
  factory: IntegratedDocumentCarrierFactory<LocalDensePosition>,
  replacementKind: "same-type" | "cross-type",
): {
  readonly left: IntegratedDocumentCarrier<LocalDensePosition>;
  readonly right: IntegratedDocumentCarrier<LocalDensePosition>;
  readonly leftUpdates: readonly Uint8Array[];
  readonly rightUpdates: readonly Uint8Array[];
} {
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
    context: { effectId: "left-replace", actorId: "alice" },
  });
  const leftReplacementUpdate = left.encode();
  left.applyChange({
    payloads: [
      {
        kind: "insert-text",
        inlineContentId: content,
        offset: 4,
        text: "!",
        origin: actor,
      },
    ],
    context: { effectId: "left-insert", actorId: "alice" },
  });
  left.applyChange({
    payloads: [
      {
        kind: "delete-text",
        inlineContentId: content,
        start: 4,
        end: 5,
      },
    ],
    context: { effectId: "left-delete", actorId: "alice" },
  });
  left.applyChange({
    payloads: [
      {
        kind: "delete-text",
        inlineContentId: content,
        start: 0,
        end: 1,
      },
      {
        kind: "insert-text",
        inlineContentId: content,
        offset: 0,
        text: "L",
        origin: actor,
      },
    ],
    context: { effectId: "left-text-replace", actorId: "alice" },
  });
  if (replacementKind === "same-type") {
    right.applyChange({
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: content,
          mediaType: "text/plain",
          text: "right",
          origin: actor,
        },
      ],
      context: { effectId: "right-replace", actorId: "bob" },
    });
    const rightReplacementUpdate = right.encode();
    right.applyChange({
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: content,
          offset: 5,
          text: "!",
          origin: actor,
        },
      ],
      context: { effectId: "right-insert", actorId: "bob" },
    });
    right.applyChange({
      payloads: [
        {
          kind: "delete-text",
          inlineContentId: content,
          start: 5,
          end: 6,
        },
      ],
      context: { effectId: "right-delete", actorId: "bob" },
    });
    return {
      left,
      right,
      leftUpdates: [leftReplacementUpdate, left.encode()],
      rightUpdates: [rightReplacementUpdate, right.encode()],
    };
  } else {
    right.applyChange({
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: content,
          mediaType: "text/plain",
          text: "right-before-opaque",
          origin: actor,
        },
      ],
      context: { effectId: "right-before-opaque", actorId: "bob" },
    });
    const rightReplacementUpdate = right.encode();
    right.applyChange({
      payloads: [
        {
          kind: "replace-opaque",
          inlineContentId: content,
          mediaType: "application/example",
          bytes: Uint8Array.of(7),
          origin: actor,
        },
      ],
      context: { effectId: "right-replace", actorId: "bob" },
    });
    return {
      left,
      right,
      leftUpdates: [leftReplacementUpdate, left.encode()],
      rightUpdates: [rightReplacementUpdate, right.encode()],
    };
  }
}

function convergeWithDuplicates(
  left: IntegratedDocumentCarrier<LocalDensePosition>,
  right: IntegratedDocumentCarrier<LocalDensePosition>,
  leftUpdates: readonly Uint8Array[],
  rightUpdates: readonly Uint8Array[],
): void {
  // Each side changes during a partition. The receiver gets a later complete
  // state before an earlier state from the same sender, then receives the
  // latest state again. A reconnect exchange follows.
  const [leftEarlier, leftLater] = leftUpdates;
  const [rightEarlier, rightLater] = rightUpdates;
  if (
    leftEarlier === undefined ||
    leftLater === undefined ||
    rightEarlier === undefined ||
    rightLater === undefined
  )
    throw new TypeError(
      "Delivery qualification requires two updates per side.",
    );
  right.mergeEncoded(leftLater);
  right.mergeEncoded(leftEarlier);
  right.mergeEncoded(leftLater);
  left.mergeEncoded(rightLater);
  left.mergeEncoded(rightEarlier);
  left.mergeEncoded(rightLater);
  const leftAfterDelivery = left.encode();
  const rightAfterDelivery = right.encode();
  left.mergeEncoded(rightAfterDelivery);
  right.mergeEncoded(leftAfterDelivery);
}

function position(order: number): StructuralPlacement<LocalDensePosition> {
  return {
    position: {
      digits: [order],
      run: "70000000-0000-4000-8000-000000000099",
      member: order,
    },
    depth: 1,
  };
}

function effectKey(actorId: string, effectId: string): string {
  return qualificationEffectIdentity({ actorId, effectId });
}
