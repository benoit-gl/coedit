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
import type { QualificationOrigin } from "../payload/carrier.js";

const rootId = parseBlockId("80000000-0000-4000-8000-000000000001");
const contentId = parseInlineContentId("80000000-0000-4000-8000-000000000002");
const documentId = parseDocumentId("80000000-0000-4000-8000-000000000003");
const otherDocumentId = parseDocumentId("80000000-0000-4000-8000-000000000004");
const original = { id: "human-original", kind: "human" as const };
const editing = { id: "human-edit", kind: "human" as const };
const imported = { id: "external-import", kind: "imported" as const };
const context = (effectId: string) => ({ actorId: "actor-a", effectId });
const isRetainedFixtureSource = (reference: string): boolean =>
  reference === "source-effect" || reference === "version-1";
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
    function seeded(text = "alpha") {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [{ inlineContentId: contentId, blockId: rootId }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: contentId,
            mediaType: "text/plain",
            text,
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

    it("ignores empty collapsed actions without a phantom undo", () => {
      const carrier = seeded();
      const editor = new QualificationTextEditor(carrier, contentId);
      editor.replaceSelection(5, 5, "!", editing, context("insert"));
      const before = carrier.snapshot();
      const effects = carrier.effects();
      editor.replaceSelection(2, 2, "", editing, context("empty-type"));
      editor.replaceAttributedSelection(2, 2, [], context("empty-paste"));
      expect(carrier.snapshot()).toEqual(before);
      expect(carrier.effects()).toEqual(effects);
      editor.undo(context("undo-after-empty"));
      expect(readEditorText(carrier, contentId).text).toBe("alpha");
      expect(() => editor.undo(context("extra-undo"))).toThrow(
        /Nothing to undo/u,
      );
      editor.replaceAttributedSelection(1, 4, [], context("delete-paste"));
      expect(readEditorText(carrier, contentId).text).toBe("aa");
      editor.undo(context("undo-delete"));
      expect(readEditorText(carrier, contentId).text).toBe("alpha");
    });

    it("preserves the intended position for a same-Origin insertion", () => {
      const carrier = seeded();
      const editor = new QualificationTextEditor(carrier, contentId);
      editor.replaceAttributedSelection(
        0,
        0,
        [{ text: "a", origin: original }],
        context("same-origin"),
      );
      expect(readEditorText(carrier, contentId).text).toBe("aalpha");
      editor.undo(context("same-origin-undo"));
      expect(readEditorText(carrier, contentId).text).toBe("alpha");
      editor.redo(context("same-origin-redo"));
      expect(readEditorText(carrier, contentId).text).toBe("aalpha");
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

    it("reconciles a pure IME insertion undo through a concurrent deletion", () => {
      const carrier = seeded();
      const editor = new QualificationTextEditor(carrier, contentId);
      editor.beginComposition();
      editor.updateComposition(5, 5, "!", editing);
      editor.commitComposition(context("ime-insert"));
      carrier.applyChange({
        payloads: [
          {
            kind: "delete-text",
            inlineContentId: contentId,
            start: 1,
            end: 2,
          },
        ],
        context: { actorId: "actor-b", effectId: "remote-ime-edit" },
      });
      editor.undo(context("ime-reconciled-undo"));
      expect(readEditorText(carrier, contentId).text).toBe("apha");
    });

    it("does not classify an attribution-changing IME replacement as insertion", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        inlineContents: [{ inlineContentId: contentId, blockId: rootId }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: contentId,
            mediaType: "text/plain",
            text: "aaa",
            origin: original,
          },
        ],
        context: context("seed-repeated"),
      });
      const editor = new QualificationTextEditor(carrier, contentId);
      editor.beginComposition();
      editor.updateComposition(0, 0, "a", editing);
      editor.updateComposition(0, 2, "aa", editing);
      editor.commitComposition(context("ime-replace"));
      editor.undo(context("ime-replace-undo"));
      const restored = readEditorText(carrier, contentId);
      expect(restored.text).toBe("aaa");
      expect(
        restored.spans.every(
          (span) =>
            span.origin.id === original.id &&
            span.origin.kind === original.kind,
        ),
      ).toBe(true);
    });

    it("refuses an IME commit whose canonical base changed remotely", () => {
      const carrier = seeded();
      const editor = new QualificationTextEditor(carrier, contentId);
      editor.beginComposition();
      editor.updateComposition(5, 5, "!", editing);
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
        context: context("remote-composition-edit"),
      });
      const beforeFailure = carrier.snapshot();
      expect(() => editor.commitComposition(context("ime-stale"))).toThrow(
        /stale/u,
      );
      expect(carrier.snapshot()).toEqual(beforeFailure);
      expect(() => editor.unmount()).toThrow(/composition/u);
      editor.cancelComposition();
      editor.unmount();
    });

    it("reconciles an insertion undo through a concurrent deletion", () => {
      const carrier = seeded();
      const editor = new QualificationTextEditor(carrier, contentId);
      editor.replaceSelection(5, 5, "!", editing, context("my-edit"));
      carrier.applyChange({
        payloads: [
          {
            kind: "delete-text",
            inlineContentId: contentId,
            start: 1,
            end: 2,
          },
        ],
        context: { actorId: "actor-b", effectId: "remote-edit" },
      });
      editor.undo(context("reconciled-undo"));
      expect(readEditorText(carrier, contentId).text).toBe("apha");
      expect(carrier.effects().size).toBe(4);
      editor.redo(context("reconciled-redo"));
      expect(readEditorText(carrier, contentId).text).toBe("apha!");
    });

    it("refreshes an insertion anchor after redo before reconciling undo", () => {
      const carrier = seeded();
      const editor = new QualificationTextEditor(carrier, contentId);
      editor.replaceSelection(5, 5, "!", editing, context("my-edit"));
      editor.undo(context("first-undo"));
      editor.redo(context("redo"));
      carrier.applyChange({
        payloads: [
          {
            kind: "delete-text",
            inlineContentId: contentId,
            start: 1,
            end: 2,
          },
        ],
        context: { actorId: "actor-b", effectId: "remote-edit-after-redo" },
      });
      editor.undo(context("second-undo"));
      expect(readEditorText(carrier, contentId).text).toBe("apha");
    });

    it("keeps inserted text isolated from later edits on either boundary", () => {
      for (const [offset, placement] of [
        [5, "before"],
        [6, "after"],
      ] as const) {
        const carrier = seeded();
        const editor = new QualificationTextEditor(carrier, contentId);
        editor.replaceSelection(
          5,
          5,
          "!",
          editing,
          context(`local-${placement}`),
        );
        carrier.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: contentId,
              offset,
              text: "?",
              origin: original,
            },
          ],
          context: { actorId: "actor-b", effectId: `remote-${placement}` },
        });
        editor.undo(context(`undo-${placement}`));
        expect(readEditorText(carrier, contentId).text).toBe("alpha?");
      }
    });

    it("deletes matching restored text regardless of its Origin", () => {
      const carrier = seeded();
      const editor = new QualificationTextEditor(carrier, contentId);
      editor.replaceSelection(5, 5, "!", editing, context("local-insert"));
      carrier.applyChange({
        payloads: [
          {
            kind: "delete-text",
            inlineContentId: contentId,
            start: 5,
            end: 6,
          },
          {
            kind: "insert-text",
            inlineContentId: contentId,
            offset: 5,
            text: "!",
            origin: original,
          },
        ],
        context: { actorId: "actor-b", effectId: "remote-restored-insert" },
      });
      editor.undo(context("undo-restored-insert"));
      expect(readEditorText(carrier, contentId).text).toBe("alpha");
    });

    it("lets both users undo contiguous same-gap insertions", () => {
      const local = seeded("Heo");
      const remote = factory.load(local.encode());
      const localEditor = new QualificationTextEditor(local, contentId);
      const remoteEditor = new QualificationTextEditor(remote, contentId);

      localEditor.replaceSelection(2, 2, "ll", editing, context("local-ll"));
      remoteEditor.replaceSelection(2, 2, "l", original, {
        actorId: "actor-b",
        effectId: "remote-l",
      });
      local.mergeEncoded(remote.encode());
      remote.mergeEncoded(local.encode());
      expect(readEditorText(local, contentId).text).toBe("Helllo");
      expect(remote.snapshot()).toEqual(local.snapshot());

      localEditor.undo(context("local-undo"));
      expect(readEditorText(local, contentId).text).toBe("Helo");
      remote.mergeEncoded(local.encode());
      remoteEditor.undo({ actorId: "actor-b", effectId: "remote-undo" });
      expect(readEditorText(remote, contentId).text).toBe("Heo");
      local.mergeEncoded(remote.encode());
      expect(local.snapshot()).toEqual(remote.snapshot());
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
        isRetainedFixtureSource,
      );
      expect(accepted.privateOriginPreserved).toBe(true);
      expect(accepted.source).toEqual({
        kind: "copy",
        reference: "source-effect",
      });
      // Clipboard attribution is a claim, not authenticated proof.
      const modifiedClaim = decodePrivateClipboard(
        source.privateText.replace("lph", "xyz"),
        "xyz",
        documentId,
        originCatalog,
        imported,
        limits,
        isRetainedFixtureSource,
      );
      expect(modifiedClaim).toEqual({
        text: "xyz",
        spans: [{ text: "xyz", origin: original }],
        privateOriginPreserved: true,
        source: { kind: "copy", reference: "source-effect" },
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
        source.privateText.replace("lph", "xyz"),
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
          isRetainedFixtureSource,
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

describe("clipboard portability", () => {
  it("preserves two fragments from one source across instances", () => {
    const buffer = {
      text: "ab",
      spans: [
        { text: "a", origin: original },
        { text: "b", origin: imported },
      ],
    };
    const first = encodePrivateClipboard(buffer, 0, 1, documentId, "version-1");
    const other = encodePrivateClipboard(buffer, 1, 2, documentId, "version-1");

    // Only serialized clipboard data moves between instances.
    const receivingCatalog = new Map<string, QualificationOrigin>([
      [original.id, { ...original }],
      [imported.id, { ...imported }],
    ]);
    for (const [encoded, origin] of [
      [first, original],
      [other, imported],
    ] as const) {
      expect(
        decodePrivateClipboard(
          encoded.privateText,
          encoded.plainText,
          documentId,
          receivingCatalog,
          imported,
          limits,
          isRetainedFixtureSource,
        ),
      ).toEqual({
        text: encoded.plainText,
        spans: [{ text: encoded.plainText, origin }],
        privateOriginPreserved: true,
        source: { kind: "copy", reference: "version-1" },
      });
    }
  });
});

describe("clipboard source validation", () => {
  it("keeps valid Origins but omits an unresolved or unreadable derivation", () => {
    const encoded = encodePrivateClipboard(
      { text: "abc", spans: [{ text: "abc", origin: original }] },
      0,
      3,
      documentId,
      "expired-source",
    );
    const expected = {
      text: "abc",
      spans: [{ text: "abc", origin: original }],
      privateOriginPreserved: true,
    };
    for (const isRetained of [
      () => false,
      () => {
        throw new TypeError("Historical source is unavailable.");
      },
    ]) {
      expect(
        decodePrivateClipboard(
          encoded.privateText,
          encoded.plainText,
          documentId,
          new Map([[original.id, original]]),
          imported,
          limits,
          isRetained,
        ),
      ).toEqual(expected);
    }
  });
});

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
        isRetainedFixtureSource,
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
          isRetainedFixtureSource,
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
        isRetainedFixtureSource,
      ).spans,
    ).toEqual([{ text: "abc", origin: imported }]);
  });
});
