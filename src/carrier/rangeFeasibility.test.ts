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
const thirdContentId = parseInlineContentId(
  "63000000-0000-4000-8000-000000000004",
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
        [0, 3],
      ]);

      const reloaded = factory.load(carrier.encode());
      expect(resolveReference(reloaded, reference)).toEqual([
        [2, 5],
        [0, 3],
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

    it("creates arbitrary multi-span references atomically without normalization", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [
          {
            inlineContentId: firstContentId,
            content: textValue("abcdef", firstOrigin),
          },
          {
            inlineContentId: secondContentId,
            content: textValue("uvwxyz", secondOrigin),
          },
        ],
      });

      const reference = createReference(carrier, [
        [secondContentId, 2, 4],
        [firstContentId, 1, 3],
        [firstContentId, 1, 3],
        [firstContentId, 3, 3],
        [firstContentId, 3, 5],
      ]);

      expect(resolveReference(carrier, reference)).toEqual([
        [2, 4],
        [1, 3],
        [1, 3],
        [3, 3],
        [3, 5],
      ]);
      expect(resolveReferenceText(carrier, reference)).toBe("wxbcbcde");
      expect(() => createReference(carrier, [[thirdContentId, 0, 0]])).toThrow(
        /unavailable|resolve/u,
      );
    });

    it("records Span and positional insertion-affinity feasibility", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [
          {
            inlineContentId: firstContentId,
            content: textValue("abcd", firstOrigin),
          },
        ],
      });
      const span = createReference(carrier, [[firstContentId, 1, 3]]);
      const position = carrier.createInlineContentCursor(
        firstContentId,
        2,
        "before",
      );

      carrier.applyChange({
        inlineContentMutations: [
          {
            inlineContentId: firstContentId,
            operations: [
              {
                kind: "insertText",
                runtimeUtf16Offset: 1,
                text: "S",
                origin: secondOrigin,
              },
              {
                kind: "insertText",
                runtimeUtf16Offset: 4,
                text: "E",
                origin: secondOrigin,
              },
            ],
          },
        ],
      });

      expect(resolveReferenceText(carrier, span)).toBe(
        factory.candidate === "yjs" ? "SbcE" : "bcE",
      );
      expect(carrier.resolveInlineContentCursor(firstContentId, position)).toBe(
        3,
      );

      const exactPosition = carrier.createInlineContentCursor(
        firstContentId,
        3,
        "before",
      );
      carrier.applyChange({
        inlineContentMutations: [
          {
            inlineContentId: firstContentId,
            operations: [
              {
                kind: "insertText",
                runtimeUtf16Offset: 3,
                text: "P",
                origin: secondOrigin,
              },
            ],
          },
        ],
      });
      expect(
        carrier.resolveInlineContentCursor(firstContentId, exactPosition),
      ).toBe(factory.candidate === "yjs" ? 3 : 4);
    });

    it("omits unresolved members and never follows a copied namespace", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [
          {
            inlineContentId: firstContentId,
            content: textValue("alpha", firstOrigin),
          },
          {
            inlineContentId: secondContentId,
            content: textValue("alpha", firstOrigin),
          },
        ],
      });
      const reference = createReference(carrier, [[firstContentId, 1, 4]]);
      const unrelated = factory.create(rootId);
      unrelated.applyChange({
        inlineContents: [
          {
            inlineContentId: secondContentId,
            content: textValue("alpha", firstOrigin),
          },
        ],
      });

      expect(resolveSurvivingReference(unrelated, reference)).toEqual([]);
      expect(resolveReferenceText(carrier, reference)).toBe("lph");
    });

    it("supports test-only split and merge lineage descendants without one-span assumptions", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [
          {
            inlineContentId: firstContentId,
            content: textValue("abcdef", firstOrigin),
          },
          {
            inlineContentId: secondContentId,
            content: textValue("abc", firstOrigin),
          },
          {
            inlineContentId: thirdContentId,
            content: textValue("def", firstOrigin),
          },
        ],
      });

      const splitDescendants = createReference(carrier, [
        [secondContentId, 1, 3],
        [thirdContentId, 0, 2],
      ]);
      expect(resolveReferenceText(carrier, splitDescendants)).toBe("bcde");

      carrier.applyChange({
        inlineContentMutations: [
          {
            inlineContentId: secondContentId,
            operations: [
              {
                kind: "insertText",
                runtimeUtf16Offset: 2,
                text: "X",
                origin: secondOrigin,
              },
            ],
          },
        ],
      });
      const severalSpansInOneContent = createReference(carrier, [
        [secondContentId, 1, 2],
        [secondContentId, 3, 4],
      ]);
      expect(resolveReference(carrier, severalSpansInOneContent)).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    it("does not inspect retained test-only references during ordinary edits", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [
          {
            inlineContentId: firstContentId,
            content: textValue("abc", firstOrigin),
          },
        ],
      });
      const references = Array.from({ length: 2_000 }, () =>
        createReference(carrier, [[firstContentId, 1, 2]]),
      );

      carrier.applyChange({
        inlineContentMutations: [
          {
            inlineContentId: firstContentId,
            operations: [
              {
                kind: "insertText",
                runtimeUtf16Offset: 0,
                text: "X",
                origin: secondOrigin,
              },
            ],
          },
        ],
      });

      expect(resolveReference(carrier, references[0]!)).toEqual([[2, 3]]);
      expect(resolveReference(carrier, references.at(-1)!)).toEqual([[2, 3]]);
    });
  });
}

interface FeasibilityCursorSpan {
  readonly inlineContentId: typeof firstContentId;
  readonly startCursor: string;
  readonly endCursor: string;
}

type SourceSpan = readonly [
  inlineContentId: typeof firstContentId,
  start: number,
  end: number,
];

function createReference(
  carrier: CollaborativeDocumentCarrier<LocalDensePosition>,
  spans: readonly SourceSpan[],
): readonly FeasibilityCursorSpan[] {
  const reference = spans.map(([inlineContentId, start, end]) =>
    cursorSpan(carrier, inlineContentId, start, end),
  );
  if (
    resolveReference(carrier, reference).some(
      ([start, end]) => start === undefined || end === undefined,
    )
  ) {
    throw new Error("Every source member must resolve during Range creation.");
  }
  return reference;
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

function resolveSurvivingReference(
  carrier: CollaborativeDocumentCarrier<LocalDensePosition>,
  spans: readonly FeasibilityCursorSpan[],
): readonly (readonly [number, number])[] {
  return resolveReference(carrier, spans).filter(
    (span): span is readonly [number, number] =>
      span[0] !== undefined && span[1] !== undefined,
  );
}

function resolveReferenceText(
  carrier: CollaborativeDocumentCarrier<LocalDensePosition>,
  spans: readonly FeasibilityCursorSpan[],
): string {
  return spans
    .map((span) => {
      const start = carrier.resolveInlineContentCursor(
        span.inlineContentId,
        span.startCursor,
      );
      const end = carrier.resolveInlineContentCursor(
        span.inlineContentId,
        span.endCursor,
      );
      const content = carrier.snapshotInlineContent(span.inlineContentId);
      if (start === undefined || end === undefined || content === undefined) {
        return "";
      }
      return visibleText(content).slice(start, end);
    })
    .join("");
}

function textValue(text: string, record: OriginRecord): InlineContentValue {
  return {
    items: [{ kind: "text", text, originId: record.id, marks: [] }],
    origins: [record],
  };
}

function visibleText(value: InlineContentValue): string {
  return value.items
    .map((item) => (item.kind === "text" ? item.text : "\n"))
    .join("");
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
