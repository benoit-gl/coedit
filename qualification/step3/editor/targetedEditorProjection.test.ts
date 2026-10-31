import { describe, expect, it, vi } from "vitest";
import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { QualificationTextEditor, readEditorText } from "./semanticText.js";

const root = parseBlockId("89000000-0000-4000-8000-000000000001");
const block = parseBlockId("89000000-0000-4000-8000-000000000002");
const target = parseInlineContentId("89000000-0000-4000-8000-000000000003");
const opaque = parseInlineContentId("89000000-0000-4000-8000-000000000004");
const missing = parseInlineContentId("89000000-0000-4000-8000-000000000005");
const origin = { id: "original", kind: "human" as const };
const changed = { id: "changed", kind: "human" as const };

for (const createFactory of [
  createYjsIntegratedDocumentCarrierFactory,
  createAutomergeIntegratedDocumentCarrierFactory,
]) {
  describe(`${createFactory.name} editor projection experiment`, () => {
    it("compares editor reads, anchors, undo and lifecycle on one native genesis", () => {
      const options = {
        ordinaryEditVariant: "targeted",
        purePositionDecoder: true,
      } as const;
      const reference = createFactory(
        localDensePositionAllocator,
        localDensePositionAllocator,
        { ...options, editorProjectionVariant: "snapshot" },
      );
      const targeted = createFactory(
        localDensePositionAllocator,
        localDensePositionAllocator,
        { ...options, editorProjectionVariant: "targeted" },
      );
      const seed = reference.create(root);
      seed.applyChange({
        placements: [
          {
            blockId: block,
            placement: {
              depth: 1,
              position: { digits: [1], run: root, member: 1 },
            },
          },
        ],
        inlineContents: [
          { inlineContentId: target, blockId: root },
          { inlineContentId: opaque, blockId: block },
        ],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: target,
            mediaType: "text/plain",
            text: "abc",
            origin,
          },
          {
            kind: "replace-opaque",
            inlineContentId: opaque,
            mediaType: "application/octet-stream",
            bytes: Uint8Array.of(1, 2),
            origin,
          },
        ],
      });
      const bytes = seed.encode();
      const carriers = [reference.load(bytes), targeted.load(bytes)];
      const snapshots = carriers.map((c) => vi.spyOn(c, "snapshot"));
      for (const [i, carrier] of carriers.entries()) {
        expect(readEditorText(carrier, target).text).toBe("abc");
        const position = carrier.createStableTextPosition(target, 1, "after");
        expect(carrier.resolveStableTextPosition(position)).toBe(1);
        expect(snapshots[i]).toHaveBeenCalledTimes(i === 0 ? 3 : 0);
        const editor = new QualificationTextEditor(carrier, target);
        editor.replaceSelection(1, 1, "X", changed, {
          actorId: "a",
          effectId: "edit",
        });
        expect(readEditorText(carrier, target).text).toBe("aXbc");
        editor.undo({ actorId: "a", effectId: "undo" });
        expect(readEditorText(carrier, target).text).toBe("abc");
        editor.redo({ actorId: "a", effectId: "redo" });
        expect(readEditorText(carrier, target).text).toBe("aXbc");
        expect(() =>
          carrier.createStableTextPosition(target, 99, "after"),
        ).toThrow();
        expect(() => readEditorText(carrier, missing)).toThrow();
        expect(() => readEditorText(carrier, opaque)).toThrow();
        expect(() =>
          carrier.createStableTextPosition(opaque, 0, "after"),
        ).toThrow();
      }
      expect(carriers[0]!.snapshot()).toEqual(carriers[1]!.snapshot());
      expect(carriers[0]!.effects()).toEqual(carriers[1]!.effects());
      const history = carriers.map((c) => c.captureHistoricalState());
      for (const [i, c] of carriers.entries()) {
        c.applyChange({
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: target,
              mediaType: "text/plain",
              text: "abc",
              origin: changed,
            },
          ],
        });
        expect(readEditorText(c, target).spans[0]?.origin).toEqual(changed);
        c.restoreHistoricalState(history[i]!);
        expect(readEditorText(c, target).text).toBe("aXbc");
      }
      expect(
        readEditorText(reference.load(carriers[0]!.encode()), target),
      ).toEqual(readEditorText(targeted.load(carriers[1]!.encode()), target));
    });

    it("revalidates or falls back after rejection, merge, deletion and restore", () => {
      const factory = createFactory(
        localDensePositionAllocator,
        localDensePositionAllocator,
        {
          ordinaryEditVariant: "targeted",
          editorProjectionVariant: "targeted",
          purePositionDecoder: true,
        },
      );
      const c = factory.create(root);
      c.applyChange({
        placements: [
          {
            blockId: block,
            placement: {
              depth: 1,
              position: { digits: [1], run: root, member: 1 },
            },
          },
        ],
        inlineContents: [{ inlineContentId: target, blockId: block }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: target,
            mediaType: "text/plain",
            text: "abc",
            origin,
          },
        ],
      });
      const saved = c.captureHistoricalState();
      const spy = vi.spyOn(c, "snapshot");
      expect(readEditorText(c, target).text).toBe("abc");
      expect(spy).not.toHaveBeenCalled();
      expect(() =>
        c.applyChange({
          payloads: [
            {
              kind: "delete-text",
              inlineContentId: target,
              start: 0,
              end: 999,
            },
          ],
        }),
      ).toThrow();
      spy.mockClear();
      expect(readEditorText(c, target).text).toBe("abc");
      expect(spy).toHaveBeenCalledOnce();
      const remote = factory.load(c.encode());
      remote.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: target,
            offset: 3,
            text: "z",
            origin: changed,
          },
        ],
      });
      c.mergeEncoded(remote.encode());
      spy.mockClear();
      expect(readEditorText(c, target).text).toBe("abcz");
      expect(spy).not.toHaveBeenCalled();
      c.applyChange({ deleteBlockIds: [block] });
      expect(() => readEditorText(c, target)).toThrow(/live fine-grained/u);
      expect(() => c.createStableTextPosition(target, 0, "after")).toThrow();
      c.restoreHistoricalState(saved);
      spy.mockClear();
      expect(readEditorText(c, target).text).toBe("abc");
      expect(spy).not.toHaveBeenCalled();
    });

    it("falls back to full projection for arbitrary decoders with placements", () => {
      let calls = 0;
      const codec = {
        ...localDensePositionAllocator,
        decode(s: string) {
          calls++;
          return localDensePositionAllocator.decode(s);
        },
      };
      const c = createFactory(codec, localDensePositionAllocator, {
        editorProjectionVariant: "targeted",
      }).create(root);
      c.applyChange({
        placements: [
          {
            blockId: block,
            placement: {
              depth: 1,
              position: { digits: [1], run: root, member: 1 },
            },
          },
        ],
        inlineContents: [{ inlineContentId: target, blockId: root }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: target,
            mediaType: "text/plain",
            text: "a",
            origin,
          },
        ],
      });
      calls = 0;
      const snapshot = vi.spyOn(c, "snapshot");
      expect(readEditorText(c, target).text).toBe("a");
      expect(snapshot).toHaveBeenCalledOnce();
      expect(calls).toBeGreaterThan(0);
    });
  });
}
