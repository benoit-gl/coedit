import { describe, expect, it } from "vitest";

import type { InlineContentValue, OriginRecord } from "../domain/content.js";
import {
  parseBlockId,
  parseContributionId,
  parseContributorId,
  parseInlineContentId,
  parseOriginId,
} from "../domain/ids.js";
import { createAutomergeCollaborativeDocumentCarrierFactory } from "./automergeCollaborativeDocumentCarrier.js";
import type {
  CollaborativeDocumentCarrier,
  CollaborativeDocumentCarrierFactory,
} from "./collaborativeDocumentCarrier.js";
import {
  localDensePositionAllocator,
  type LocalDensePosition,
} from "./position.js";
import { createYjsCollaborativeDocumentCarrierFactory } from "./yjsCollaborativeDocumentCarrier.js";

const rootId = parseBlockId("63000000-0000-4000-8000-000000000001");
const firstContentId = parseInlineContentId(
  "63000000-0000-4000-8000-000000000002",
);
const secondContentId = parseInlineContentId(
  "63000000-0000-4000-8000-000000000003",
);
const firstOrigin = origin(1);
const secondOrigin = origin(2);

const factories: readonly CollaborativeDocumentCarrierFactory<LocalDensePosition>[] =
  [
    createYjsCollaborativeDocumentCarrierFactory(localDensePositionAllocator),
    createAutomergeCollaborativeDocumentCarrierFactory(
      localDensePositionAllocator,
    ),
  ];

for (const factory of factories) {
  describe(`${factory.candidate} Range feasibility`, () => {
    it("keeps a test-only multi-InlineContent reference resolvable through edits and reload", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [
          {
            inlineContentId: firstContentId,
            content: textValue("alpha", firstOrigin),
          },
          {
            inlineContentId: secondContentId,
            content: textValue("beta", secondOrigin),
          },
        ],
      });

      const reference = [
        cursorSpan(carrier, firstContentId, 1, 4),
        cursorSpan(carrier, secondContentId, 0, 2),
      ] as const;

      carrier.applyChange({
        inlineContentMutations: [
          {
            inlineContentId: firstContentId,
            operations: [
              {
                kind: "insertText",
                runtimeUtf16Offset: 0,
                text: "X",
                origin: firstOrigin,
              },
            ],
          },
          {
            inlineContentId: secondContentId,
            operations: [
              {
                kind: "insertText",
                runtimeUtf16Offset: 2,
                text: "Y",
                origin: secondOrigin,
              },
            ],
          },
        ],
      });

      expect(resolveReference(carrier, reference)).toEqual([
        [2, 5],
        [0, 2],
      ]);

      const reloaded = factory.load(carrier.encode());
      expect(resolveReference(reloaded, reference)).toEqual([
        [2, 5],
        [0, 2],
      ]);
    });

    it("fails a multi-target mutation atomically when one member cannot resolve", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [
          {
            inlineContentId: firstContentId,
            content: textValue("alpha", firstOrigin),
          },
        ],
      });
      const before = carrier.snapshot();

      expect(() =>
        carrier.applyChange({
          inlineContentMutations: [
            {
              inlineContentId: firstContentId,
              operations: [
                {
                  kind: "insertText",
                  runtimeUtf16Offset: 0,
                  text: "X",
                  origin: firstOrigin,
                },
              ],
            },
            {
              inlineContentId: secondContentId,
              operations: [
                {
                  kind: "insertText",
                  runtimeUtf16Offset: 0,
                  text: "Y",
                  origin: secondOrigin,
                },
              ],
            },
          ],
        }),
      ).toThrow();
      expect(carrier.snapshot()).toEqual(before);
    });
  });
}

interface FeasibilityCursorSpan {
  readonly inlineContentId: typeof firstContentId;
  readonly startCursor: string;
  readonly endCursor: string;
}

function cursorSpan(
  carrier: CollaborativeDocumentCarrier<LocalDensePosition>,
  inlineContentId: typeof firstContentId,
  start: number,
  end: number,
): FeasibilityCursorSpan {
  return {
    inlineContentId,
    startCursor: carrier.createInlineContentCursor(
      inlineContentId,
      start,
      "before",
    ),
    endCursor: carrier.createInlineContentCursor(inlineContentId, end, "after"),
  };
}

function resolveReference(
  carrier: CollaborativeDocumentCarrier<LocalDensePosition>,
  spans: readonly FeasibilityCursorSpan[],
): readonly (readonly [number | undefined, number | undefined])[] {
  return spans.map((span) => [
    carrier.resolveInlineContentCursor(span.inlineContentId, span.startCursor),
    carrier.resolveInlineContentCursor(span.inlineContentId, span.endCursor),
  ]);
}

function textValue(text: string, record: OriginRecord): InlineContentValue {
  return {
    items: [{ kind: "text", text, originId: record.id, marks: [] }],
    origins: [record],
  };
}

function origin(index: number): OriginRecord {
  const suffix = index.toString().padStart(12, "0");
  return {
    id: parseOriginId(`64000000-0000-4000-8000-${suffix}`),
    agentId: parseContributorId(`65000000-0000-4000-8000-${suffix}`),
    kind: "human",
    createdBy: parseContributionId(`66000000-0000-4000-8000-${suffix}`),
  };
}
