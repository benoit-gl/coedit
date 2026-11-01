import * as Automerge from "@automerge/automerge";
import * as Y from "yjs";
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
const block2 = parseBlockId("89000000-0000-4000-8000-000000000006");
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

    it("matches position outcomes through concurrent merge and target lifecycle", () => {
      const factories = (["snapshot", "targeted"] as const).map((variant) =>
        createFactory(
          localDensePositionAllocator,
          localDensePositionAllocator,
          {
            ordinaryEditVariant: "targeted",
            editorProjectionVariant: variant,
            purePositionDecoder: true,
          },
        ),
      );
      const seed = factories[0]!.create(root);
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
        inlineContents: [{ inlineContentId: target, blockId: block }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: target,
            mediaType: "text/plain",
            text: "ac",
            origin,
          },
        ],
      });
      const genesis = seed.encode();
      const anchor = seed.createStableTextPosition(target, 1, "after");
      const local = factories[0]!.load(genesis);
      const remote = factories[0]!.load(genesis);
      remote.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: target,
            offset: 1,
            text: "R",
            origin,
          },
        ],
      });
      local.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: target,
            offset: 1,
            text: "L",
            origin: changed,
          },
        ],
      });
      const carriers = factories.map((factory) => factory.load(local.encode()));
      for (const carrier of carriers) carrier.mergeEncoded(remote.encode());
      expect(carriers[0]!.snapshot()).toEqual(carriers[1]!.snapshot());
      const merged = carriers.map((carrier) =>
        carrier.resolveStableTextPosition(anchor),
      );
      expect(merged[0]).toBeDefined();
      expect(merged[1]).toEqual(merged[0]);
      expect(
        factories.map((factory, i) =>
          factory.load(carriers[i]!.encode()).resolveStableTextPosition(anchor),
        ),
      ).toEqual(merged);
      const saved = carriers.map((carrier) => carrier.captureHistoricalState());
      for (const carrier of carriers)
        carrier.applyChange({
          payloads: [
            {
              kind: "replace-opaque",
              inlineContentId: target,
              mediaType: "application/octet-stream",
              bytes: Uint8Array.of(3),
              origin,
            },
          ],
        });
      expect(
        carriers.map((carrier) => carrier.resolveStableTextPosition(anchor)),
      ).toEqual([undefined, undefined]);
      for (const [i, carrier] of carriers.entries())
        carrier.restoreHistoricalState(saved[i]!);
      const afterReplacementRestore = carriers.map((carrier) =>
        outcomeOf(() => carrier.resolveStableTextPosition(anchor)),
      );
      expect(afterReplacementRestore[1]).toEqual(afterReplacementRestore[0]);
      for (const carrier of carriers)
        carrier.applyChange({ deleteBlockIds: [block] });
      expect(
        carriers.map((carrier) => carrier.resolveStableTextPosition(anchor)),
      ).toEqual([undefined, undefined]);
      for (const [i, carrier] of carriers.entries())
        carrier.restoreHistoricalState(saved[i]!);
      const afterDeleteRestore = carriers.map((carrier) =>
        outcomeOf(() => carrier.resolveStableTextPosition(anchor)),
      );
      expect(afterDeleteRestore[1]).toEqual(afterDeleteRestore[0]);
    });

    it("matches stateful decoder traces and failures for editor reads and positions", () => {
      const seedFactory = createFactory(
        localDensePositionAllocator,
        localDensePositionAllocator,
      );
      const seed = seedFactory.create(root);
      seed.applyChange({
        placements: [
          {
            blockId: block,
            placement: {
              depth: 1,
              position: { digits: [1], run: root, member: 1 },
            },
          },
          {
            blockId: block2,
            placement: {
              depth: 1,
              position: { digits: [2], run: root, member: 2 },
            },
          },
        ],
        inlineContents: [{ inlineContentId: target, blockId: root }],
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
      const position = seed.createStableTextPosition(target, 1, "after");
      const trace: [string[], string[]] = [[], []];
      const rejectAt = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
      const carriers = (["snapshot", "targeted"] as const).map((variant, i) => {
        const codec = {
          ...localDensePositionAllocator,
          decode(encoded: string) {
            trace[i]!.push(encoded);
            if (trace[i]!.length === rejectAt[i])
              throw new TypeError("decoder rejected");
            return localDensePositionAllocator.decode(encoded);
          },
        };
        return createFactory(codec, localDensePositionAllocator, {
          editorProjectionVariant: variant,
        }).load(seed.encode());
      });
      expect(trace[1]).toEqual(trace[0]);
      for (const carrier of carriers) {
        readEditorText(carrier, target);
        carrier.createStableTextPosition(target, 1, "after");
        carrier.resolveStableTextPosition(position);
      }
      expect(trace[0].length).toBeGreaterThan(0);
      expect(trace[1]).toEqual(trace[0]);
      const before = carriers.map((carrier) => carrier.encode());
      for (const op of [
        (i: number) => readEditorText(carriers[i]!, target),
        (i: number) =>
          carriers[i]!.createStableTextPosition(target, 1, "after"),
        (i: number) => carriers[i]!.resolveStableTextPosition(position),
      ]) {
        rejectAt[0] = trace[0].length + 2;
        rejectAt[1] = trace[1].length + 2;
        const errors = carriers.map((_, i) => errorOf(() => op(i)));
        expect(errors).toEqual([
          { name: "TypeError", message: "decoder rejected" },
          { name: "TypeError", message: "decoder rejected" },
        ]);
        expect(trace[1]).toEqual(trace[0]);
      }
      expect(carriers.map((carrier) => carrier.encode())).toEqual(before);
    });

    it("matches failures from malformed unrelated Origin on load and merge", () => {
      const factories = (["snapshot", "targeted"] as const).map((variant) =>
        createFactory(
          localDensePositionAllocator,
          localDensePositionAllocator,
          { editorProjectionVariant: variant, purePositionDecoder: true },
        ),
      );
      const seed = factories[0]!.create(root);
      seed.applyChange({
        inlineContents: [
          { inlineContentId: target, blockId: root },
          { inlineContentId: opaque, blockId: root },
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
            bytes: Uint8Array.of(1),
            origin,
          },
        ],
      });
      const bytes = seed.encode();
      const position = seed.createStableTextPosition(target, 1, "after");
      const corrupt = corruptOpaqueOrigin(seed.candidate, bytes);
      for (const merged of [false, true]) {
        const carriers = factories.map((factory) =>
          factory.load(merged ? bytes : corrupt),
        );
        if (merged)
          for (const carrier of carriers) carrier.mergeEncoded(corrupt);
        const before = carriers.map((carrier) => carrier.encode());
        for (const op of [
          (i: number) => readEditorText(carriers[i]!, target),
          (i: number) =>
            carriers[i]!.createStableTextPosition(target, 1, "after"),
          (i: number) => carriers[i]!.resolveStableTextPosition(position),
        ]) {
          const errors = carriers.map((_, i) => errorOf(() => op(i)));
          expect(errors[0]?.message).toMatch(/Origin/u);
          expect(errors[1]).toEqual(errors[0]);
        }
        expect(carriers.map((carrier) => carrier.encode())).toEqual(before);
      }
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

function errorOf(
  run: () => unknown,
): { name: string; message: string } | undefined {
  try {
    run();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { name: error.name, message: error.message };
  }
  return undefined;
}

function corruptOpaqueOrigin(candidate: string, bytes: Uint8Array): Uint8Array {
  if (candidate === "automerge") {
    const document = Automerge.load<{
      payloads: Record<string, { origin: string }>;
    }>(bytes);
    return Automerge.save(
      Automerge.change(document, (draft) => {
        draft.payloads[opaque]!.origin = "false";
      }),
    );
  }
  const document = new Y.Doc();
  Y.applyUpdate(document, bytes.subarray(37));
  const payloads = document.getMap("integrated").get("payloads") as Y.Map<
    Y.Map<unknown>
  >;
  payloads.get(opaque)!.set("origin", "false");
  const update = Y.encodeStateAsUpdate(document);
  const result = new Uint8Array(37 + update.length);
  result.set(bytes.subarray(0, 37));
  result.set(update, 37);
  return result;
}

function outcomeOf(run: () => unknown): unknown {
  try {
    return { value: run() };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { error: { name: error.name, message: error.message } };
  }
}
