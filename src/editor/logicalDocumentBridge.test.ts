import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import type {
  FormattingMark,
  InlineContentValue,
  OriginRecord,
} from "../domain/content.js";
import {
  parseBlockId,
  parseContributionId,
  parseContributorId,
  parseInlineContentId,
  parseOriginId,
} from "../domain/ids.js";
import { createAutomergeCollaborativeDocumentCarrierFactory } from "../carrier/automergeCollaborativeDocumentCarrier.js";
import type { CollaborativeDocumentCarrierFactory } from "../carrier/collaborativeDocumentCarrier.js";
import type { LocalDensePosition } from "../carrier/position.js";
import { localDensePositionAllocator } from "../carrier/position.js";
import { createYjsCollaborativeDocumentCarrierFactory } from "../carrier/yjsCollaborativeDocumentCarrier.js";
import {
  inlineContentMutationFromProseMirrorTransaction,
  type EditorOriginContext,
} from "./contentTransactionBridge.js";
import {
  inlineContentSchema,
  proseMirrorDocFromInlineContent,
} from "./inlineContentSchema.js";

const rootId = parseBlockId("71000000-0000-4000-8000-000000000001");
const inlineContentId = parseInlineContentId(
  "72000000-0000-4000-8000-000000000001",
);
const firstContribution = parseContributionId(
  "73000000-0000-4000-8000-000000000001",
);
const secondContribution = parseContributionId(
  "73000000-0000-4000-8000-000000000002",
);
const contributor = parseContributorId("74000000-0000-4000-8000-000000000001");
const originA = origin(1, firstContribution);
const originB = origin(2, secondContribution);
const bold: FormattingMark = { kind: "bold", boundaryPolicy: "none" };

const factories: readonly CollaborativeDocumentCarrierFactory<LocalDensePosition>[] =
  [
    createYjsCollaborativeDocumentCarrierFactory(localDensePositionAllocator),
    createAutomergeCollaborativeDocumentCarrierFactory(
      localDensePositionAllocator,
    ),
  ];

for (const factory of factories) {
  describe(`${factory.candidate} logical-document editor bridge`, () => {
    it("publishes one editor transaction inside the shared logical document", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [
          {
            inlineContentId,
            content: {
              items: [
                {
                  kind: "text",
                  text: "ab",
                  originId: originA.id,
                  marks: [bold],
                },
              ],
              origins: [originA],
            },
          },
        ],
        contributions: [
          { contributionId: firstContribution, metadata: "initial" },
        ],
      });

      const before = requiredContent(
        carrier.snapshotInlineContent(inlineContentId),
      );
      const state = EditorState.create({
        schema: inlineContentSchema,
        doc: proseMirrorDocFromInlineContent(before),
      });
      const transaction = state.tr.insertText("X", 1);

      carrier.applyChange({
        inlineContentMutations: [
          inlineContentMutationFromProseMirrorTransaction(
            inlineContentId,
            transaction,
            originContext(originB),
          ),
        ],
        contributions: [
          { contributionId: secondContribution, metadata: "editor-command" },
        ],
      });

      const after = requiredContent(
        carrier.snapshotInlineContent(inlineContentId),
      );
      expect(visibleText(after)).toBe("aXb");
      expect(after.items).toEqual([
        { kind: "text", text: "a", originId: originA.id, marks: [bold] },
        { kind: "text", text: "X", originId: originB.id, marks: [bold] },
        { kind: "text", text: "b", originId: originA.id, marks: [bold] },
      ]);
      expect(proseMirrorDocFromInlineContent(after).textContent).toBe("aXb");
      expect(carrier.snapshot().contributions).toEqual([
        { contributionId: firstContribution, metadata: "initial" },
        { contributionId: secondContribution, metadata: "editor-command" },
      ]);
    });

    it("clears formatting through the editor bridge without changing Origin", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [
          {
            inlineContentId,
            content: {
              items: [
                {
                  kind: "text",
                  text: "ab",
                  originId: originA.id,
                  marks: [bold],
                },
              ],
              origins: [originA],
            },
          },
        ],
      });
      const state = EditorState.create({
        schema: inlineContentSchema,
        doc: proseMirrorDocFromInlineContent(
          requiredContent(carrier.snapshotInlineContent(inlineContentId)),
        ),
      });
      const mark = state.schema.marks.bold;
      if (mark === undefined) {
        throw new Error("Qualification schema is missing bold.");
      }
      const transaction = state.tr.removeMark(0, 2, mark);

      carrier.applyChange({
        inlineContentMutations: [
          inlineContentMutationFromProseMirrorTransaction(
            inlineContentId,
            transaction,
            originContext(originB),
          ),
        ],
      });

      const after = requiredContent(
        carrier.snapshotInlineContent(inlineContentId),
      );
      expect(after.items).toEqual([
        { kind: "text", text: "ab", originId: originA.id, marks: [] },
      ]);
    });
  });
}

function origin(
  index: number,
  createdBy: ReturnType<typeof parseContributionId>,
): OriginRecord {
  const suffix = index.toString().padStart(12, "0");
  return {
    id: parseOriginId(`75000000-0000-4000-8000-${suffix}`),
    agentId: contributor,
    kind: "human",
    createdBy,
  };
}

function originContext(defaultOrigin: OriginRecord): EditorOriginContext {
  return {
    defaultOrigin,
    insertedOriginMode: "new",
    resolveOrigin(originId) {
      return originId === originA.id
        ? originA
        : originId === originB.id
          ? originB
          : undefined;
    },
  };
}

function requiredContent<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Expected InlineContent in logical carrier.");
  }
  return value;
}

function visibleText(value: InlineContentValue): string {
  return value.items
    .map((item) => (item.kind === "text" ? item.text : "\n"))
    .join("");
}
