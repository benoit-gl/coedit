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
import type { CollaborativeDocumentCarrierFactory } from "./collaborativeDocumentCarrier.js";
import type { LocalDensePosition } from "./position.js";
import { localDensePositionAllocator } from "./position.js";
import { projectStructuralSnapshot } from "./structuralCarrier.js";
import { createYjsCollaborativeDocumentCarrierFactory } from "./yjsCollaborativeDocumentCarrier.js";

const rootId = parseBlockId("50000000-0000-4000-8000-000000000001");
const blockA = parseBlockId("50000000-0000-4000-8000-000000000002");
const blockB = parseBlockId("50000000-0000-4000-8000-000000000003");
const inlineA = parseInlineContentId("51000000-0000-4000-8000-000000000001");
const inlineB = parseInlineContentId("51000000-0000-4000-8000-000000000002");
const inlineC = parseInlineContentId("51000000-0000-4000-8000-000000000003");
const contributionA = parseContributionId(
  "52000000-0000-4000-8000-000000000001",
);
const contributionB = parseContributionId(
  "52000000-0000-4000-8000-000000000002",
);
const contributor = parseContributorId("53000000-0000-4000-8000-000000000001");
const originA: OriginRecord = {
  id: parseOriginId("54000000-0000-4000-8000-000000000001"),
  agentId: contributor,
  kind: "human",
  createdBy: contributionA,
};
const originB: OriginRecord = {
  id: parseOriginId("54000000-0000-4000-8000-000000000002"),
  agentId: contributor,
  kind: "human",
  createdBy: contributionA,
};
const originC: OriginRecord = {
  id: parseOriginId("54000000-0000-4000-8000-000000000003"),
  agentId: contributor,
  kind: "human",
  createdBy: contributionB,
};
const contentA: InlineContentValue = {
  items: [
    { kind: "text", text: "alpha", originId: originA.id, marks: [] },
    { kind: "hardBreak", originId: originA.id, marks: [] },
    {
      kind: "text",
      text: "beta",
      originId: originA.id,
      marks: [{ kind: "bold", boundaryPolicy: "both" }],
    },
  ],
  origins: [originA],
};
const contentB: InlineContentValue = {
  items: [
    {
      kind: "text",
      text: "summary",
      originId: originB.id,
      marks: [{ kind: "italic", boundaryPolicy: "none" }],
    },
  ],
  origins: [originB],
};

const factories = [
  createYjsCollaborativeDocumentCarrierFactory(localDensePositionAllocator),
  createAutomergeCollaborativeDocumentCarrierFactory(
    localDensePositionAllocator,
  ),
];

for (const factory of factories) {
  describe(`${factory.candidate} logical collaborative document`, () => {
    it("publishes structure, two actual InlineContents, Origins, and Contribution metadata together", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        structural: {
          placements: [placement(blockA, 1, 1, "a-create")],
          payloads: [
            {
              blockId: blockA,
              key: "inline:first",
              value: inlineA,
              liveToken: "a-inline-a",
            },
            {
              blockId: blockA,
              key: "inline:second",
              value: inlineB,
              liveToken: "a-inline-b",
            },
          ],
        },
        inlineContents: [
          { inlineContentId: inlineA, content: contentA },
          { inlineContentId: inlineB, content: contentB },
        ],
        contributions: [
          {
            contributionId: contributionA,
            metadata: JSON.stringify({ kind: "qualification-atomic-create" }),
          },
        ],
      });

      const snapshot = carrier.snapshot();
      expect(
        projectStructuralSnapshot(
          snapshot.structural,
          localDensePositionAllocator,
        ).map((entry) => entry.blockId),
      ).toEqual([rootId, blockA]);
      expect(
        snapshot.structural.entries.find((entry) => entry.blockId === blockA)
          ?.payload,
      ).toEqual({ "inline:first": inlineA, "inline:second": inlineB });
      expect(snapshot.inlineContents).toEqual([
        { inlineContentId: inlineA, content: contentA },
        { inlineContentId: inlineB, content: contentB },
      ]);
      expect(snapshot.contributions).toEqual([
        {
          contributionId: contributionA,
          metadata: JSON.stringify({ kind: "qualification-atomic-create" }),
        },
      ]);
    });

    it("rejects a bad multi-target change without publishing any partial state", () => {
      const carrier = createPopulatedCarrier(factory);
      const before = carrier.snapshot();

      expect(() =>
        carrier.applyChange({
          structural: {
            placements: [placement(blockB, 2, 1, "b-create")],
          },
          inlineContents: [
            { inlineContentId: inlineC, content: contentB },
            { inlineContentId: inlineA, content: contentA },
          ],
          contributions: [
            {
              contributionId: contributionB,
              metadata: JSON.stringify({ kind: "must-not-publish" }),
            },
          ],
        }),
      ).toThrow(/InlineContent identity already exists/u);

      expect(carrier.snapshot()).toEqual(before);
    });

    it("publishes structure, two existing InlineContent edits, Origins, and Contribution metadata together", () => {
      const carrier = createPopulatedCarrier(factory, true);

      carrier.applyChange({
        structural: {
          placements: [placement(blockB, 2, 1, "b-create")],
        },
        inlineContentMutations: [
          {
            inlineContentId: inlineA,
            operations: [
              {
                kind: "insertText",
                runtimeUtf16Offset: 5,
                text: "!",
                origin: originC,
              },
            ],
          },
          {
            inlineContentId: inlineB,
            operations: [
              {
                kind: "insertText",
                runtimeUtf16Offset: 0,
                text: "new ",
                origin: originC,
              },
            ],
          },
        ],
        contributions: [
          {
            contributionId: contributionB,
            metadata: JSON.stringify({ kind: "qualification-atomic-edit" }),
          },
        ],
      });

      const snapshot = carrier.snapshot();
      expect(
        projectStructuralSnapshot(
          snapshot.structural,
          localDensePositionAllocator,
        ).map((entry) => entry.blockId),
      ).toEqual([rootId, blockA, blockB]);
      expect(visibleText(snapshot.inlineContents[0]?.content)).toBe(
        "alpha!\nbeta",
      );
      expect(visibleText(snapshot.inlineContents[1]?.content)).toBe(
        "new summary",
      );
      expect(
        snapshot.inlineContents.flatMap((entry) => entry.content.origins),
      ).toContainEqual(originC);
      expect(snapshot.contributions.at(-1)).toEqual({
        contributionId: contributionB,
        metadata: JSON.stringify({ kind: "qualification-atomic-edit" }),
      });
    });

    it("rejects a bad existing-content multi-target edit without partial publication", () => {
      const carrier = createPopulatedCarrier(factory, true);
      const before = carrier.snapshot();

      expect(() =>
        carrier.applyChange({
          structural: {
            placements: [placement(blockB, 2, 1, "b-create")],
          },
          inlineContentMutations: [
            {
              inlineContentId: inlineA,
              operations: [
                {
                  kind: "insertText",
                  runtimeUtf16Offset: 0,
                  text: "x",
                  origin: originC,
                },
              ],
            },
            {
              inlineContentId: inlineB,
              operations: [
                {
                  kind: "deleteRange",
                  startRuntimeUtf16Offset: 0,
                  endRuntimeUtf16Offset: 999,
                },
              ],
            },
          ],
          contributions: [
            {
              contributionId: contributionB,
              metadata: JSON.stringify({ kind: "must-not-publish" }),
            },
          ],
        }),
      ).toThrow();

      expect(carrier.snapshot()).toEqual(before);
    });

    it("keeps InlineContent cursors scoped, stable through edits, and valid after reload", () => {
      const carrier = createPopulatedCarrier(factory, true);
      const cursor = carrier.createInlineContentCursor(inlineA, 5, "after");

      carrier.applyChange({
        inlineContentMutations: [
          {
            inlineContentId: inlineA,
            operations: [
              {
                kind: "insertText",
                runtimeUtf16Offset: 0,
                text: "x",
                origin: originC,
              },
            ],
          },
        ],
      });

      expect(carrier.resolveInlineContentCursor(inlineA, cursor)).toBe(6);
      expect(
        carrier.resolveInlineContentCursor(inlineB, cursor),
      ).toBeUndefined();
      const reloaded = factory.load(carrier.encode());
      expect(reloaded.resolveInlineContentCursor(inlineA, cursor)).toBe(6);
    });

    it("does not mutate unrelated InlineContent or structure for a single-content edit", () => {
      const carrier = createPopulatedCarrier(factory, true);
      const before = carrier.snapshot();

      carrier.applyChange({
        inlineContentMutations: [
          {
            inlineContentId: inlineA,
            operations: [
              {
                kind: "insertText",
                runtimeUtf16Offset: 0,
                text: "x",
                origin: originC,
              },
            ],
          },
        ],
      });

      const after = carrier.snapshot();
      expect(after.structural).toEqual(before.structural);
      expect(after.inlineContents[1]).toEqual(before.inlineContents[1]);
      expect(after.inlineContents[0]).not.toEqual(before.inlineContents[0]);
    });

    it("reloads the complete logical document as one encoded carrier state", () => {
      const carrier = createPopulatedCarrier(factory);
      const reloaded = factory.load(carrier.encode());

      expect(reloaded.snapshot()).toEqual(carrier.snapshot());
    });
  });
}

function createPopulatedCarrier(
  factory: CollaborativeDocumentCarrierFactory<LocalDensePosition>,
  includeSecondInlineContent = false,
) {
  const carrier = factory.create(rootId);
  carrier.applyChange({
    structural: {
      placements: [placement(blockA, 1, 1, "a-create")],
      payloads: [
        {
          blockId: blockA,
          key: "inline:first",
          value: inlineA,
          liveToken: "a-inline-a",
        },
      ],
    },
    inlineContents: [
      { inlineContentId: inlineA, content: contentA },
      ...(includeSecondInlineContent
        ? [{ inlineContentId: inlineB, content: contentB }]
        : []),
    ],
    contributions: [
      {
        contributionId: contributionA,
        metadata: JSON.stringify({ kind: "qualification-create" }),
      },
    ],
  });
  return carrier;
}

function visibleText(value: InlineContentValue | undefined): string {
  if (value === undefined) {
    throw new Error("Expected InlineContent in qualification snapshot.");
  }
  return value.items
    .map((item) => (item.kind === "text" ? item.text : "\n"))
    .join("");
}

function placement(
  blockId: ReturnType<typeof parseBlockId>,
  order: number,
  depth: number,
  liveToken: string,
) {
  return {
    blockId,
    placement: {
      position: {
        digits: [order],
        run: "60000000-0000-4000-8000-000000000099",
        member: 0,
      },
      depth,
    },
    liveToken,
  } as const;
}
