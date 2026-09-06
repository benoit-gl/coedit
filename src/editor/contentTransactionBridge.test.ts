import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import type { FormattingMark, OriginRecord } from "../domain/content.js";
import {
  parseContributionId,
  parseContributorId,
  parseOriginId,
} from "../domain/ids.js";
import { automergeContentCarrierFactory } from "../carrier/automergeContentCarrier.js";
import type {
  ContentCarrier,
  ContentCarrierFactory,
  ContentCarrierOperation,
} from "../carrier/contentCarrier.js";
import { yjsContentCarrierFactory } from "../carrier/yjsContentCarrier.js";
import {
  applyProseMirrorTransaction,
  type EditorOriginContext,
} from "./contentTransactionBridge.js";
import {
  inlineContentSchema,
  originProseMirrorMark,
  proseMirrorDocFromInlineContent,
  proseMirrorMarkFromFormatting,
} from "./inlineContentSchema.js";

const factories: readonly ContentCarrierFactory[] = [
  yjsContentCarrierFactory,
  automergeContentCarrierFactory,
];
const originA = origin(1);
const originB = origin(2);
const originC = origin(3);
const origins = new Map(
  [originA, originB, originC].map((record) => [record.id, record]),
);

for (const factory of factories) {
  describe(`${factory.candidate} ProseMirror transaction bridge`, () => {
    it("publishes replacement as one carrier batch", () => {
      const underlying = factory.create();
      underlying.insertText(0, "abc", originA);
      const carrier = countingCarrier(underlying);
      const state = editorState(underlying);
      const transaction = state.tr.insertText("XY", 1, 2);

      applyProseMirrorTransaction(carrier, transaction, originContext(originB));

      expect(carrier.applyOperationCalls()).toBe(1);
      expect(underlying.snapshot().items).toEqual([
        { kind: "text", text: "a", originId: originA.id, marks: [] },
        { kind: "text", text: "XY", originId: originB.id, marks: [] },
        { kind: "text", text: "c", originId: originA.id, marks: [] },
      ]);
    });

    it("translates hard breaks and intrinsic formatting", () => {
      const carrier = factory.create();
      carrier.insertText(0, "ac", originA);
      const state = editorState(carrier);
      const hardBreak = inlineContentSchema.nodes.hardBreak;
      if (hardBreak === undefined) {
        throw new Error("Test schema is missing hardBreak.");
      }
      const bold: FormattingMark = { kind: "bold", boundaryPolicy: "both" };
      const transaction = state.tr
        .replaceWith(1, 1, hardBreak.create())
        .addMark(1, 2, proseMirrorMarkFromFormatting(bold));

      applyProseMirrorTransaction(carrier, transaction, originContext(originB));

      expect(carrier.snapshot().items).toEqual([
        { kind: "text", text: "a", originId: originA.id, marks: [] },
        {
          kind: "hardBreak",
          originId: originB.id,
          marks: [bold],
        },
        { kind: "text", text: "c", originId: originA.id, marks: [] },
      ]);
    });

    it("preserves restored Origin from an inverse ProseMirror replacement", () => {
      const carrier = factory.create();
      carrier.insertText(0, "a", originA);
      carrier.insertText(1, "b", originB);
      const beforeDelete = editorState(carrier);
      const deletion = beforeDelete.tr.delete(1, 2);
      const deleteStep = deletion.steps[0];
      if (deleteStep === undefined) {
        throw new Error("Expected one deletion step.");
      }
      const inverse = deleteStep.invert(deletion.before);
      applyProseMirrorTransaction(carrier, deletion, originContext(originC));

      const afterDelete = editorState(carrier);
      const restoration = afterDelete.tr.step(inverse);
      applyProseMirrorTransaction(
        carrier,
        restoration,
        originContext(originC, "preserve"),
      );

      expect(carrier.snapshot().items).toEqual([
        { kind: "text", text: "a", originId: originA.id, marks: [] },
        { kind: "text", text: "b", originId: originB.id, marks: [] },
      ]);
    });

    it("rejects editor attempts to change protected Origin", () => {
      const carrier = factory.create();
      carrier.insertText(0, "a", originA);
      const state = editorState(carrier);
      const transaction = state.tr.addMark(
        0,
        1,
        originProseMirrorMark(originB.id),
      );
      const before = carrier.snapshot();

      expect(() =>
        applyProseMirrorTransaction(
          carrier,
          transaction,
          originContext(originB),
        ),
      ).toThrow("cannot modify protected Origin");
      expect(carrier.snapshot()).toEqual(before);
    });

    it("uses canonical mark boundary policy for editor insertion", () => {
      for (const [policy, atStart, atEnd] of [
        ["none", false, false],
        ["start", true, false],
        ["end", false, true],
        ["both", true, true],
      ] as const) {
        const bold: FormattingMark = { kind: "bold", boundaryPolicy: policy };

        const atStartCarrier = factory.create();
        atStartCarrier.insertText(0, "ab", originA);
        atStartCarrier.addMark(0, 2, bold);
        applyProseMirrorTransaction(
          atStartCarrier,
          editorState(atStartCarrier).tr.insertText("x", 0),
          originContext(originB),
        );
        expect(hasBoldAt(atStartCarrier, 0)).toBe(atStart);

        const atEndCarrier = factory.create();
        atEndCarrier.insertText(0, "ab", originA);
        atEndCarrier.addMark(0, 2, bold);
        applyProseMirrorTransaction(
          atEndCarrier,
          editorState(atEndCarrier).tr.insertText("x", 2),
          originContext(originB),
        );
        expect(hasBoldAt(atEndCarrier, 2)).toBe(atEnd);
      }
    });
  });
}

function editorState(carrier: ContentCarrier): EditorState {
  return EditorState.create({
    schema: inlineContentSchema,
    doc: proseMirrorDocFromInlineContent(carrier.snapshot()),
  });
}

function originContext(
  defaultOrigin: OriginRecord,
  insertedOriginMode: EditorOriginContext["insertedOriginMode"] = "new",
): EditorOriginContext {
  return {
    defaultOrigin,
    insertedOriginMode,
    resolveOrigin(originId) {
      return origins.get(originId);
    },
  };
}

function hasBoldAt(
  carrier: ContentCarrier,
  runtimeUtf16Offset: number,
): boolean {
  let current = 0;
  for (const item of carrier.snapshot().items) {
    const length = item.kind === "text" ? item.text.length : 1;
    if (
      runtimeUtf16Offset >= current &&
      runtimeUtf16Offset < current + length
    ) {
      return item.marks.some((mark) => mark.kind === "bold");
    }
    current += length;
  }
  return false;
}

interface CountingCarrier extends ContentCarrier {
  /** Returns the number of batch calls observed by the wrapper. */
  applyOperationCalls(): number;
}

function countingCarrier(underlying: ContentCarrier): CountingCarrier {
  let calls = 0;
  return {
    candidate: underlying.candidate,
    applyOperations(operations: readonly ContentCarrierOperation[]) {
      calls += 1;
      underlying.applyOperations(operations);
    },
    insertText: underlying.insertText.bind(underlying),
    insertHardBreak: underlying.insertHardBreak.bind(underlying),
    deleteRange: underlying.deleteRange.bind(underlying),
    addMark: underlying.addMark.bind(underlying),
    removeMark: underlying.removeMark.bind(underlying),
    snapshot: underlying.snapshot.bind(underlying),
    encode: underlying.encode.bind(underlying),
    mergeEncoded: underlying.mergeEncoded.bind(underlying),
    createCursor: underlying.createCursor.bind(underlying),
    resolveCursor: underlying.resolveCursor.bind(underlying),
    applyOperationCalls() {
      return calls;
    },
  };
}

function origin(index: number): OriginRecord {
  const suffix = index.toString().padStart(12, "0");
  return {
    id: parseOriginId(`10000000-0000-4000-8000-${suffix}`),
    agentId: parseContributorId(`20000000-0000-4000-8000-${suffix}`),
    kind: "human",
    createdBy: parseContributionId(`30000000-0000-4000-8000-${suffix}`),
  };
}
