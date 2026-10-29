import * as Automerge from "@automerge/automerge";
import * as Y from "yjs";
import { describe, expect, it, vi } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import type {
  IntegratedDocumentCarrier,
  IntegratedDocumentChange,
} from "./carrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "./yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "./automergeIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";

const root = parseBlockId("73000000-0000-4000-8000-000000000001");
const block = parseBlockId("73000000-0000-4000-8000-000000000002");
const text = parseInlineContentId("73000000-0000-4000-8000-000000000003");
const other = parseInlineContentId("73000000-0000-4000-8000-000000000004");
const opaque = parseInlineContentId("73000000-0000-4000-8000-000000000005");
const missing = parseInlineContentId("73000000-0000-4000-8000-000000000006");
const human = { id: "author", kind: "human" as const };
const imported = { id: "source", kind: "imported" as const };
type Carrier = IntegratedDocumentCarrier<LocalDensePosition>;
type Change = IntegratedDocumentChange<LocalDensePosition>;

function insertion(effectId: string, offset = 0): Change {
  return {
    payloads: [
      {
        kind: "insert-text",
        inlineContentId: text,
        offset,
        text: "x",
        origin: human,
      },
    ],
    context: { actorId: "editor", effectId },
  };
}

function seed(carrier: Carrier): void {
  carrier.applyChange({
    placements: [
      {
        blockId: block,
        placement: {
          depth: 1,
          position: { digits: [1], run: root, member: 1 },
        },
      },
    ],
    inlineContents: [text, other, opaque].map((inlineContentId) => ({
      inlineContentId,
      blockId: block,
    })),
    payloads: [
      ...[text, other].map((inlineContentId) => ({
        kind: "replace-text" as const,
        inlineContentId,
        mediaType: "text/plain",
        text: "a😀bc",
        origin: imported,
      })),
      {
        kind: "replace-opaque",
        inlineContentId: opaque,
        mediaType: "application/octet-stream",
        bytes: Uint8Array.of(1, 2, 3),
        origin: imported,
      },
    ],
    context: { actorId: "seed", effectId: "seed" },
  });
}

function semanticState(carrier: Carrier) {
  return {
    snapshot: carrier.snapshot(),
    effects: carrier.effects(),
    evidence: carrier.recordedPayloadEffects(),
  };
}

function errorOf(
  run: () => void,
): { name: string; message: string } | undefined {
  try {
    run();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { name: error.name, message: error.message };
  }
  return undefined;
}

for (const createFactory of [
  createYjsIntegratedDocumentCarrierFactory,
  createAutomergeIntegratedDocumentCarrierFactory,
]) {
  const reference = createFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
    { ordinaryEditVariant: "snapshot" },
  );
  const targeted = createFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
    { ordinaryEditVariant: "targeted" },
  );
  const defaults = createFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
  );
  function pair() {
    const initial = reference.create(root);
    seed(initial);
    const bytes = initial.encode();
    return [reference.load(bytes), targeted.load(bytes)] as const;
  }

  describe(`${reference.candidate} targeted ordinary-edit equivalence`, () => {
    it("uses one full validation after load, then projects only touched payloads; defaults to targeted", () => {
      for (const factory of [targeted, defaults]) {
        const initial = reference.create(root);
        seed(initial);
        const carrier = factory.load(initial.encode());
        const snapshot = vi.spyOn(carrier, "snapshot");
        carrier.applyChange(insertion("first"));
        expect(snapshot).toHaveBeenCalledTimes(1);
        carrier.applyChange(insertion("second"));
        expect(snapshot).toHaveBeenCalledTimes(1);
        carrier.applyChange({
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: other,
              mediaType: "text/plain",
              text: "replacement",
              origin: human,
            },
          ],
        });
        expect(snapshot).toHaveBeenCalledTimes(2);
        carrier.applyChange(insertion("third"));
        expect(snapshot).toHaveBeenCalledTimes(3);
        carrier.applyChange(insertion("fourth"));
        expect(snapshot).toHaveBeenCalledTimes(3);
      }
      const [carrier] = pair();
      const snapshot = vi.spyOn(carrier, "snapshot");
      carrier.applyChange(insertion("first"));
      carrier.applyChange(insertion("second"));
      expect(snapshot).toHaveBeenCalledTimes(2);
    });

    it("preserves sequential multi-payload batches, Origins, no-op deletions, effects and causal bases across reload", () => {
      let carriers = pair();
      for (const carrier of carriers) carrier.applyChange(insertion("warm"));
      const changes: Change[] = [
        {
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: text,
              offset: 1,
              text: "中",
              origin: human,
            },
            { kind: "delete-text", inlineContentId: text, start: 0, end: 1 },
            {
              kind: "insert-text",
              inlineContentId: other,
              offset: 4,
              text: "q",
              origin: human,
            },
            { kind: "delete-text", inlineContentId: other, start: 1, end: 3 },
            { kind: "delete-text", inlineContentId: other, start: 0, end: 0 },
          ],
          context: { actorId: "editor", effectId: "batch" },
        },
        {
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: text,
              mediaType: "text/plain",
              text: "new",
              origin: imported,
            },
            {
              kind: "insert-text",
              inlineContentId: text,
              offset: 3,
              text: "!",
              origin: human,
            },
          ],
          context: { actorId: "editor", effectId: "mixed-replacement" },
        },
        insertion("after-replacement"),
        insertion("targeted-again"),
      ];
      for (const change of changes) {
        for (const carrier of carriers) carrier.applyChange(change);
        expect(semanticState(carriers[1])).toEqual(semanticState(carriers[0]));
      }
      carriers = [
        reference.load(carriers[0].encode()),
        targeted.load(carriers[1].encode()),
      ];
      for (const carrier of carriers) {
        carrier.applyChange(insertion("reloaded"));
        carrier.applyChange(insertion("reloaded-targeted"));
      }
      expect(semanticState(carriers[1])).toEqual(semanticState(carriers[0]));
    });

    it("matches exact error messages and atomic rejection for invalid batches, Unicode, Origins, ownership and effect reuse", () => {
      const cases: Change[] = [
        insertion("offset", -1),
        insertion("fractional", 0.5),
        insertion("too-far", 100),
        {
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: text,
              offset: 0,
              text: "",
              origin: human,
            },
          ],
        },
        {
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: text,
              offset: 0,
              text: "\ud800",
              origin: human,
            },
          ],
        },
        {
          payloads: [
            { kind: "delete-text", inlineContentId: text, start: 2, end: 3 },
          ],
        },
        {
          payloads: [
            { kind: "delete-text", inlineContentId: text, start: 5, end: 2 },
          ],
        },
        {
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: text,
              offset: 0,
              text: "x",
              origin: { id: "bad", kind: "invalid" } as unknown as typeof human,
            },
          ],
        },
        {
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: missing,
              offset: 0,
              text: "x",
              origin: human,
            },
          ],
        },
        {
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: opaque,
              offset: 0,
              text: "x",
              origin: human,
            },
          ],
        },
        {
          payloads: [
            ...insertion("valid").payloads!,
            { kind: "delete-text", inlineContentId: other, start: 0, end: 100 },
          ],
        },
        {
          ...insertion("invalid-context"),
          context: { actorId: "", effectId: "bad" },
        },
        insertion("warm"),
      ];
      for (const change of cases) {
        const carriers = pair();
        for (const carrier of carriers) carrier.applyChange(insertion("warm"));
        const before = carriers.map(semanticState);
        const errors = carriers.map((carrier) =>
          errorOf(() => carrier.applyChange(change)),
        );
        expect(errors[0]).toBeDefined();
        expect(errors[1]).toEqual(errors[0]);
        expect(carriers.map(semanticState)).toEqual(before);
      }
    });

    it("falls back for mixed structure, preserves update-over-delete, restores history and revalidates", () => {
      const carriers = pair();
      for (const carrier of carriers) carrier.applyChange(insertion("warm"));
      const history = carriers.map((carrier) =>
        carrier.captureHistoricalState(),
      );
      const mixed: Change = { ...insertion("mixed"), deleteBlockIds: [block] };
      for (const carrier of carriers) carrier.applyChange(mixed);
      expect(semanticState(carriers[1])).toEqual(semanticState(carriers[0]));
      expect(carriers[1].snapshot().blockLiveness.get(block)).toBe(true);
      carriers.forEach((carrier, index) =>
        carrier.restoreHistoricalState(history[index]!),
      );
      for (const carrier of carriers) {
        carrier.applyChange(insertion("after-restore"));
        carrier.applyChange(insertion("targeted-after-restore"));
      }
      expect(semanticState(carriers[1])).toEqual(semanticState(carriers[0]));
    });

    it("preserves concurrent delete versus edit and no-op delete liveness after merge and reload", () => {
      for (const noOp of [false, true]) {
        const results = [];
        for (const factory of [reference, targeted]) {
          const initial = reference.create(root);
          seed(initial);
          const left = factory.load(initial.encode());
          left.applyChange(insertion("warm"));
          const right = factory.load(left.encode());
          right.applyChange({
            deleteBlockIds: [block],
            context: { actorId: "deleter", effectId: "delete" },
          });
          left.applyChange(
            noOp
              ? {
                  payloads: [
                    {
                      kind: "delete-text",
                      inlineContentId: text,
                      start: 0,
                      end: 0,
                    },
                  ],
                  context: { actorId: "editor", effectId: "no-op" },
                }
              : insertion("concurrent"),
          );
          left.mergeEncoded(right.encode());
          right.mergeEncoded(left.encode());
          expect(semanticState(left)).toEqual(semanticState(right));
          const reloaded = factory.load(left.encode());
          expect(reloaded.snapshot().blockLiveness.get(block)).toBe(!noOp);
          if (!noOp) {
            reloaded.applyChange(insertion("after-merge"));
            reloaded.applyChange(insertion("after-merge-targeted"));
          }
          results.push(semanticState(reloaded));
        }
        expect(results[1]).toEqual(results[0]);
      }
    });

    it("revalidates unrelated malformed Origins after load and after merge, without publishing an edit", () => {
      const initial = reference.create(root);
      seed(initial);
      const corrupt = corruptOpaqueOrigin(
        reference.candidate,
        initial.encode(),
      );
      for (const factory of [reference, targeted]) {
        for (const merged of [false, true]) {
          const carrier = factory.load(merged ? initial.encode() : corrupt);
          if (merged) {
            carrier.applyChange(insertion("warm"));
            carrier.applyChange(insertion("targeted"));
            carrier.mergeEncoded(corrupt);
          }
          const before = carrier.encode();
          expect(() => carrier.applyChange(insertion("rejected"))).toThrow(
            /Origin/u,
          );
          expect(carrier.encode()).toEqual(before);
        }
      }
    });
  });
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
