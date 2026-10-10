import { describe, expect, it } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import type { IntegratedDocumentCarrierFactory } from "../integrated/carrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";
import { readEditorText } from "./semanticText.js";
import {
  createProseMirrorEditorState,
  nativeTextFromProseMirror,
  qualificationProseMirrorSchema,
  translateProseMirrorTransaction,
} from "./prosemirrorAdapter.js";

const rootId = parseBlockId("82000000-0000-4000-8000-000000000001");
const contentId = parseInlineContentId("82000000-0000-4000-8000-000000000002");
const original = { id: "human-original", kind: "human" as const };
const editing = { id: "human-edit", kind: "human" as const };
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
  describe(factory.candidate + " ProseMirror qualification", () => {
    it("translates one flat-schema replacement as one integrated effect", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [{ inlineContentId: contentId, blockId: rootId }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: contentId,
            mediaType: "text/plain",
            text: "alpha",
            origin: original,
          },
        ],
        context: { actorId: "actor-a", effectId: "seed" },
      });
      const before = readEditorText(carrier, contentId);
      const state = createProseMirrorEditorState(before);
      const transaction = state.tr.insertText("BC", 1, 4);
      const change = translateProseMirrorTransaction<LocalDensePosition>(
        contentId,
        before,
        transaction,
        editing,
        { actorId: "actor-a", effectId: "prosemirror-replace" },
      );
      expect(change).toBeDefined();
      carrier.applyChange(change!);
      expect(readEditorText(carrier, contentId)).toEqual({
        text: "aBCa",
        spans: [
          { text: "a", origin: original },
          { text: "BC", origin: editing },
          { text: "a", origin: original },
        ],
      });
      expect(
        carrier
          .effects()
          .get(JSON.stringify(["actor-a", "prosemirror-replace"])),
      ).toBeDefined();
    });

    it("keeps selection and mark transactions out of canonical text", () => {
      const state = createProseMirrorEditorState({
        text: "a\nb",
        spans: [{ text: "a\nb", origin: original }],
      });
      const selectionOnly = state.tr.setSelection(state.selection);
      expect(
        translateProseMirrorTransaction<LocalDensePosition>(
          contentId,
          { text: "a\nb", spans: [{ text: "a\nb", origin: original }] },
          selectionOnly,
          editing,
          { actorId: "actor-a", effectId: "selection" },
        ),
      ).toBeUndefined();
      const formattingOnly = state.tr.addMark(
        1,
        2,
        qualificationProseMirrorSchema.marks.em.create(),
      );
      expect(formattingOnly.docChanged).toBe(true);
      expect(
        translateProseMirrorTransaction<LocalDensePosition>(
          contentId,
          { text: "a\nb", spans: [{ text: "a\nb", origin: original }] },
          formattingOnly,
          editing,
          { actorId: "actor-a", effectId: "formatting" },
        ),
      ).toBeUndefined();
      expect(nativeTextFromProseMirror(state.doc)).toBe("a\nb");
    });

    it("retains the actual replacement coordinate for repeated and identical text", () => {
      const before = {
        text: "aaa",
        spans: [{ text: "aaa", origin: original }],
      };
      const state = createProseMirrorEditorState(before);
      const insertion = translateProseMirrorTransaction<LocalDensePosition>(
        contentId,
        before,
        state.tr.insertText("a", 0),
        editing,
        { actorId: "actor-a", effectId: "repeated-insert" },
      );
      expect(insertion?.payloads).toEqual([
        {
          kind: "insert-text",
          inlineContentId: contentId,
          offset: 0,
          text: "a",
          origin: editing,
        },
      ]);
      const identical = translateProseMirrorTransaction<LocalDensePosition>(
        contentId,
        before,
        state.tr.insertText("aaa", 0, 3),
        editing,
        { actorId: "actor-a", effectId: "identical-replace" },
      );
      expect(identical?.payloads).toEqual([
        { kind: "delete-text", inlineContentId: contentId, start: 0, end: 3 },
        {
          kind: "insert-text",
          inlineContentId: contentId,
          offset: 0,
          text: "aaa",
          origin: editing,
        },
      ]);
    });
  });
}
