import { describe, expect, it } from "vitest";
import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import {
  QualificationIncrementalEditor,
  createIncrementalEditorWork,
} from "./incrementalEditor.js";
import {
  ordinaryWork,
  resetOrdinaryWork,
  ordinarySource,
} from "../comparison/ordinaryEditComparison.js";

const root = parseBlockId("8b000000-0000-4000-8000-000000000001");
const target = parseInlineContentId("8b000000-0000-4000-8000-000000000002");
const origin = { id: "incremental-original", kind: "human" as const };
const edited = { id: "incremental-edit", kind: "human" as const };

for (const create of [
  createYjsIntegratedDocumentCarrierFactory,
  createAutomergeIntegratedDocumentCarrierFactory,
]) {
  describe(`${create.name} delta editor`, () => {
    function fixture(text = "a😀bc") {
      const work = ordinaryWork();
      const carrier = create(
        localDensePositionAllocator,
        localDensePositionAllocator,
        {
          ordinaryEditVariant: "incremental",
          purePositionDecoder: true,
          workCounters: work,
        },
      ).create(root);
      carrier.applyChange({
        inlineContents: [{ inlineContentId: target, blockId: root }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: target,
            mediaType: "text/markdown",
            text,
            origin,
          },
        ],
      });
      const editorWork = createIncrementalEditorWork();
      const editor = new QualificationIncrementalEditor(
        carrier,
        target,
        editorWork,
      );
      let effect = 0;
      return {
        carrier,
        editor,
        work,
        editorWork,
        context: () => ({
          actorId: "incremental-editor",
          effectId: String(effect++),
        }),
      };
    }

    it("rejects an equally advanced receipt from a different carrier instance", () => {
      const a = fixture("abc");
      const b = fixture("xyz");
      const foreign = a.carrier.readOrdinaryTextRange(target, 0, 0)!.revision;
      const before = b.carrier.encode();
      expect(() =>
        b.carrier.applyOrdinaryChange(
          {
            payloads: [
              {
                kind: "insert-text",
                inlineContentId: target,
                offset: 0,
                text: "!",
                origin,
              },
            ],
          },
          foreign,
        ),
      ).toThrow(/Stale/u);
      expect(b.carrier.encode()).toEqual(before);
    });

    it("undoes a scalar crossing an internal chunk boundary and preserves Origin after reload", () => {
      const initial = "a".repeat(255) + "😀b";
      const { carrier, editor, context } = fixture(initial);
      editor.apply([{ start: 255, end: 257, insertion: [] }], context());
      editor.undo(context());
      expect(
        editor
          .read(0, editor.length)
          .map((span) => span.text)
          .join(""),
      ).toBe(initial);
      expect(
        editor.read(255, 257).every((span) => span.origin.id === origin.id),
      ).toBe(true);
      const loaded = create(
        localDensePositionAllocator,
        localDensePositionAllocator,
        { ordinaryEditVariant: "incremental", purePositionDecoder: true },
      ).load(carrier.encode());
      expect(
        new QualificationIncrementalEditor(loaded, target)
          .read(255, 257)
          .map((span) => span.text)
          .join(""),
      ).toBe("😀");
      editor.redo(context());
      expect(
        editor
          .read(0, editor.length)
          .map((span) => span.text)
          .join(""),
      ).toBe("a".repeat(255) + "b");
    });

    it("retains attribution across ordered multi-step replacement and semantic undo/redo", () => {
      const { carrier, editor, context } = fixture();
      editor.apply(
        [
          { start: 1, end: 3, insertion: [{ text: "漢", origin: edited }] },
          { start: 0, end: 0, insertion: [{ text: "# ", origin: edited }] },
        ],
        context(),
      );
      expect(
        editor
          .read(0, editor.length)
          .map((span) => span.text)
          .join(""),
      ).toBe("# a漢bc");
      editor.undo(context());
      expect(
        editor
          .read(0, editor.length)
          .map((span) => span.text)
          .join(""),
      ).toBe("a😀bc");
      editor.redo(context());
      const expected = editor.read(0, editor.length);
      const actual = carrier.snapshot().payloads.get(target);
      expect(actual?.kind).toBe("text");
      if (actual?.kind === "text") {
        expect(expected.map((span) => span.text).join("")).toBe(actual.text);
        expect(
          expected
            .filter((span) => span.origin.id === edited.id)
            .map((span) => span.text)
            .join(""),
        ).toBe("# 漢");
      }
      expect(carrier.effects().size).toBe(3);
    });

    it("rejects stale Origin-only changes and resumes explicitly after restore/reload", () => {
      const { carrier, editor, context } = fixture("abc");
      const saved = carrier.captureHistoricalState();
      carrier.applyChange({
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: target,
            mediaType: "text/markdown",
            text: "abc",
            origin: edited,
          },
        ],
      });
      const before = carrier.encode();
      expect(() =>
        editor.apply(
          [{ start: 0, end: 0, insertion: [{ text: "x", origin }] }],
          context(),
        ),
      ).toThrow(/stale/u);
      expect(carrier.encode()).toEqual(before);
      editor.refresh();
      expect(
        editor.read(0, 3).every((span) => span.origin.id === edited.id),
      ).toBe(true);
      carrier.restoreHistoricalState(saved);
      expect(() => editor.read(0, 1)).toThrow(/stale/u);
      editor.refresh();
      editor.apply(
        [{ start: 3, end: 3, insertion: [{ text: "!", origin }] }],
        context(),
      );
      const loaded = create(
        localDensePositionAllocator,
        localDensePositionAllocator,
        { ordinaryEditVariant: "incremental", purePositionDecoder: true },
      ).load(carrier.encode());
      expect(
        new QualificationIncrementalEditor(loaded, target)
          .read(0, 4)
          .map((span) => span.text)
          .join(""),
      ).toBe("abc!");
    });

    it("rejects a later invalid operation atomically and recovers without publishing a fake effect", () => {
      const { carrier, editor, context } = fixture();
      const before = carrier.encode();
      expect(() =>
        editor.apply(
          [
            { start: 0, end: 0, insertion: [{ text: "x", origin }] },
            { start: 2, end: 3, insertion: [] },
          ],
          context(),
        ),
      ).toThrow(/exactly/u);
      expect(carrier.encode()).toEqual(before);
      editor.refresh();
      editor.apply(
        [{ start: 0, end: 0, insertion: [{ text: "x", origin }] }],
        context(),
      );
      expect(carrier.effects().size).toBe(1);
    });

    it.each([1024, 10000, 100000])(
      "uses localized carrier and editor reads at %i UTF-16 units",
      (units) => {
        const { carrier, editor, context, work, editorWork } = fixture(
          ordinarySource(units),
        );
        const positions = Array.from({ length: 32 }, (_, i) =>
          carrier.createStableTextPosition(target, i, "before"),
        );
        resetOrdinaryWork(work);
        editorWork.activationUnits = 0;
        for (const key of Object.keys(
          editorWork.indexed,
        ) as (keyof typeof editorWork.indexed)[])
          editorWork.indexed[key] = 0;
        editor.apply(
          [{ start: 0, end: 0, insertion: [{ text: "x", origin }] }],
          context(),
        );
        expect(work.snapshots).toBe(0);
        expect(work.payloads).toEqual({});
        expect(work.livenessTokens).toEqual({});
        expect(work.indexed?.rebuildUnits).toBe(0);
        expect(work.indexed!.readUnits).toBeLessThan(10);
        expect(editorWork.activationUnits).toBe(0);
        expect(editorWork.indexed.readUnits).toBe(0);
        expect(carrier.resolveStableTextPosition(positions[0]!)).toBeTypeOf(
          "number",
        );
      },
    );
  });
}
