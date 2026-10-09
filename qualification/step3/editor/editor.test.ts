import { describe, expect, it } from "vitest";

import {
  parseBlockId,
  parseDocumentId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import type { IntegratedDocumentCarrierFactory } from "../integrated/carrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";
import {
  QualificationTextEditor,
  readEditorText,
  translateEditorText,
} from "./semanticText.js";
import { decodePrivateClipboard, encodePrivateClipboard } from "./clipboard.js";

const rootId = parseBlockId("80000000-0000-4000-8000-000000000001");
const contentId = parseInlineContentId("80000000-0000-4000-8000-000000000002");
const documentId = parseDocumentId("80000000-0000-4000-8000-000000000003");
const otherDocumentId = parseDocumentId("80000000-0000-4000-8000-000000000004");
const original = { id: "human-original", kind: "human" as const };
const editing = { id: "human-edit", kind: "human" as const };
const imported = { id: "external-import", kind: "imported" as const };
const context = (effectId: string) => ({ actorId: "actor-a", effectId });
const limits = { maxEncodedLength: 4096, maxSpans: 8, maxTextLength: 64 };

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
  describe(factory.candidate + " editor qualification", () => {
    function seeded() {
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
        context: context("seed"),
      });
      return carrier;
    }

    it("translates one editor gesture into one attributed integrated effect", () => {
      const carrier = seeded();
      const editor = new QualificationTextEditor(carrier, contentId);
      editor.replaceSelection(1, 4, "BC", editing, context("type"));
      expect(readEditorText(carrier, contentId).text).toBe("aBCa");
      expect(readEditorText(carrier, contentId).spans).toEqual([
        { text: "a", origin: original },
        { text: "BC", origin: editing },
        { text: "a", origin: original },
      ]);
      expect([...carrier.effects().values()].map((e) => e.effectId)).toContain(
        "type",
      );
      expect(
        translateEditorText(
          contentId,
          readEditorText(carrier, contentId),
          readEditorText(carrier, contentId),
          context("formatting"),
        ),
      ).toBeUndefined();
      editor.undo(context("undo"));
      expect(readEditorText(carrier, contentId)).toEqual({
        text: "alpha",
        spans: [{ text: "alpha", origin: original }],
      });
      editor.redo(context("redo"));
      expect(readEditorText(carrier, contentId).text).toBe("aBCa");
      expect([...carrier.effects().values()].map((e) => e.effectId)).toEqual(
        expect.arrayContaining(["type", "undo", "redo"]),
      );
      const reloaded = factory.load(carrier.encode());
      expect(readEditorText(reloaded, contentId)).toEqual(
        readEditorText(carrier, contentId),
      );
    });

    it("preserves attribution-only edits and their semantic inverse", () => {
      const carrier = seeded();
      const editor = new QualificationTextEditor(carrier, contentId);
      editor.replaceSelection(0, 5, "alpha", editing, context("reattribute"));
      expect(readEditorText(carrier, contentId).spans).toEqual([
        { text: "alpha", origin: editing },
      ]);
      editor.undo(context("undo-attribution"));
      expect(readEditorText(carrier, contentId)).toEqual({
        text: "alpha",
        spans: [{ text: "alpha", origin: original }],
      });
    });

    it("preserves Origins on mixed same-string attribution and text changes", () => {
      const carrier = seeded();
      const editor = new QualificationTextEditor(carrier, contentId);
      editor.replaceAttributedSelection(
        1,
        4,
        [{ text: "lph", origin: editing }],
        context("middle-origin"),
      );
      expect(readEditorText(carrier, contentId).spans).toEqual([
        { text: "a", origin: original },
        { text: "lph", origin: editing },
        { text: "a", origin: original },
      ]);
      editor.replaceSelection(4, 5, "!", editing, context("mixed-edit"));
      expect(readEditorText(carrier, contentId).spans).toEqual([
        { text: "a", origin: original },
        { text: "lph!", origin: editing },
      ]);
      editor.undo(context("undo-mixed-edit"));
      expect(readEditorText(carrier, contentId).spans).toEqual([
        { text: "a", origin: original },
        { text: "lph", origin: editing },
        { text: "a", origin: original },
      ]);
    });

    it("buffers IME composition until one atomic commit and rejects silent unmount", () => {
      const carrier = seeded();
      const editor = new QualificationTextEditor(carrier, contentId);
      editor.beginComposition();
      editor.updateComposition(5, 5, "あ", editing);
      editor.updateComposition(5, 6, "ありがとう", editing);
      expect(carrier.snapshot().payloads.get(contentId)).toMatchObject({
        text: "alpha",
      });
      expect(() => editor.unmount()).toThrow(/composition/u);
      editor.commitComposition(context("ime"));
      expect(readEditorText(carrier, contentId).text).toBe("alphaありがとう");
      expect(carrier.effects().size).toBe(2);
      editor.unmount();
      expect(() =>
        editor.replaceSelection(0, 0, "x", editing, context("after-unmount")),
      ).toThrow(/unmounted/u);
    });

    it("does not rewind over a concurrent canonical edit", () => {
      const carrier = seeded();
      const editor = new QualificationTextEditor(carrier, contentId);
      editor.replaceSelection(5, 5, "!", editing, context("my-edit"));
      carrier.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: contentId,
            offset: 0,
            text: "remote ",
            origin: original,
          },
        ],
        context: { actorId: "actor-b", effectId: "remote-edit" },
      });
      const before = carrier.snapshot();
      expect(() => editor.undo(context("stale-undo"))).toThrow(/stale/u);
      expect(carrier.snapshot()).toEqual(before);
      expect(carrier.effects().size).toBe(3);
    });

    it("qualifies same-document private copy, paste, cut, and hostile fallback", () => {
      const carrier = seeded();
      const editor = new QualificationTextEditor(carrier, contentId);
      const source = encodePrivateClipboard(
        editor.buffer(),
        1,
        4,
        documentId,
        "source-effect",
      );
      expect(source.plainText).toBe("lph");
      const originCatalog = new Map([[original.id, original]]);
      const accepted = decodePrivateClipboard(
        source.privateText,
        source.plainText,
        documentId,
        originCatalog,
        imported,
        limits,
      );
      expect(accepted.privateOriginPreserved).toBe(true);
      expect(accepted.source).toEqual({
        kind: "copy",
        reference: "source-effect",
      });
      editor.replaceSelection(1, 4, "", editing, context("cut"));
      expect(readEditorText(carrier, contentId).text).toBe("aa");
      editor.replaceAttributedSelection(1, 1, accepted.spans, {
        actorId: "actor-a",
        effectId: "paste",
        ...(accepted.source === undefined ? {} : { source: accepted.source }),
      });
      expect(readEditorText(carrier, contentId)).toEqual({
        text: "alpha",
        spans: [{ text: "alpha", origin: original }],
      });
      expect(
        carrier.effects().get(JSON.stringify(["actor-a", "paste"])),
      ).toMatchObject({
        source: { kind: "copy", reference: "source-effect" },
      });

      for (const privateText of [
        "{bad json",
        JSON.stringify({ formatVersion: 9 }),
        source.privateText + " ".repeat(limits.maxEncodedLength),
        source.privateText.replace(documentId, otherDocumentId),
        source.privateText.replace(original.id, "unknown-origin"),
        source.privateText.replace('"human"', '"ai"'),
      ]) {
        const fallback = decodePrivateClipboard(
          privateText,
          source.plainText,
          documentId,
          originCatalog,
          imported,
          limits,
        );
        expect(fallback).toEqual({
          text: "lph",
          spans: [{ text: "lph", origin: imported }],
          privateOriginPreserved: false,
        });
      }
    });
  });
}

describe("clipboard admission", () => {
  it("refuses invalid limits and over-capacity or malformed private data without dropping plain text", () => {
    const catalog = new Map([[original.id, original]]);
    const encoded = encodePrivateClipboard(
      { text: "abc", spans: [{ text: "abc", origin: original }] },
      0,
      3,
      documentId,
      "source",
    );
    expect(() =>
      decodePrivateClipboard(
        encoded.privateText,
        "abc",
        documentId,
        catalog,
        imported,
        {
          maxEncodedLength: -1,
          maxSpans: 2,
          maxTextLength: 3,
        },
      ),
    ).toThrow(/limits/u);
    for (const candidate of [
      { maxEncodedLength: 5, maxSpans: 2, maxTextLength: 3 },
      { maxEncodedLength: 4096, maxSpans: 0, maxTextLength: 3 },
      { maxEncodedLength: 4096, maxSpans: 2, maxTextLength: 2 },
    ]) {
      expect(
        decodePrivateClipboard(
          encoded.privateText,
          "abc",
          documentId,
          catalog,
          imported,
          candidate,
        ).privateOriginPreserved,
      ).toBe(false);
    }
    expect(
      decodePrivateClipboard(
        undefined,
        "abc",
        documentId,
        catalog,
        imported,
        limits,
      ).spans,
    ).toEqual([{ text: "abc", origin: imported }]);
  });
});
