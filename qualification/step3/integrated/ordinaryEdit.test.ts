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

function seed(carrier: Carrier, withPlacement = true): void {
  carrier.applyChange({
    placements: withPlacement
      ? [
          {
            blockId: block,
            placement: {
              depth: 1,
              position: { digits: [1], run: root, member: 1 },
            },
          },
        ]
      : [],
    inlineContents: [text, other, opaque].map((inlineContentId) => ({
      inlineContentId,
      blockId: withPlacement ? block : root,
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
  function pair(withPlacement = false) {
    const initial = reference.create(root);
    seed(initial, withPlacement);
    const bytes = initial.encode();
    return [reference.load(bytes), targeted.load(bytes)] as const;
  }

  describe(`${reference.candidate} targeted ordinary-edit equivalence`, () => {
    it("uses targeted preflight with placements when a pure decoder is explicitly opted in", () => {
      const initial = reference.create(root);
      seed(initial);
      const bytes = initial.encode();
      const pure = createFactory(
        localDensePositionAllocator,
        localDensePositionAllocator,
        {
          ordinaryEditVariant: "targeted",
          purePositionDecoder: true,
        },
      ).load(bytes);
      const baseline = reference.load(bytes);
      const snapshot = vi.spyOn(pure, "snapshot");
      baseline.applyChange(insertion("placed"));
      pure.applyChange(insertion("placed"));
      expect(snapshot).not.toHaveBeenCalled();
      expect(semanticState(pure)).toEqual(semanticState(baseline));
    });

    it("preserves stateful decoder calls when placements are retained", () => {
      const initial = reference.create(root);
      seed(initial);
      const bytes = initial.encode();
      const traces: [string[], string[]] = [[], []];
      const carriers = (["snapshot", "targeted"] as const).map((variant, i) => {
        const codec = {
          ...localDensePositionAllocator,
          decode(encoded: string) {
            traces[i]!.push(encoded);
            return localDensePositionAllocator.decode(encoded);
          },
        };
        return createFactory(codec, localDensePositionAllocator, {
          ordinaryEditVariant: variant,
        }).load(bytes);
      });
      expect(traces[1]).toEqual(traces[0]);
      for (const carrier of carriers) carrier.applyChange(insertion("first"));
      expect(traces[0].length).toBeGreaterThan(0);
      expect(traces[1]).toEqual(traces[0]);
      for (const carrier of carriers) carrier.mergeEncoded(bytes);
      expect(traces[1]).toEqual(traces[0]);
      for (const carrier of carriers) carrier.applyChange(insertion("second"));
      expect(traces[1]).toEqual(traces[0]);
    });

    it("preserves later decoder failures and atomicity after state transitions", () => {
      for (const transition of ["none", "restore", "failed-merge"] as const) {
        const initial = reference.create(root);
        seed(initial);
        const bytes = initial.encode();
        const calls: [number, number] = [0, 0];
        const reject: [boolean, boolean] = [false, false];
        const carriers = (["snapshot", "targeted"] as const).map(
          (variant, index) => {
            const codec = {
              ...localDensePositionAllocator,
              decode(encoded: string) {
                calls[index]!++;
                if (reject[index]) throw new TypeError("decoder rejected");
                return localDensePositionAllocator.decode(encoded);
              },
            };
            return createFactory(codec, localDensePositionAllocator, {
              ordinaryEditVariant: variant,
            }).load(bytes);
          },
        );
        for (const carrier of carriers)
          carrier.applyChange(insertion("before"));
        if (transition === "restore") {
          const history = carriers.map((carrier) =>
            carrier.captureHistoricalState(),
          );
          carriers.forEach((carrier, index) =>
            carrier.restoreHistoricalState(history[index]!),
          );
        } else if (transition === "failed-merge") {
          for (const carrier of carriers)
            expect(() => carrier.mergeEncoded(Uint8Array.of(1))).toThrow();
        }
        expect(calls[0]).toBeGreaterThan(0);
        expect(calls[1]).toBe(calls[0]);
        const before = carriers.map((carrier) => carrier.encode());
        const effectsBefore = carriers.map((carrier) => carrier.effects());
        reject.fill(true);
        const errors = carriers.map((carrier) =>
          errorOf(() => carrier.applyChange(insertion("rejected"))),
        );
        expect(errors).toEqual([
          { name: "TypeError", message: "decoder rejected" },
          { name: "TypeError", message: "decoder rejected" },
        ]);
        expect(calls[1]).toBe(calls[0]);
        reject.fill(false);
        carriers.forEach((carrier, index) => {
          expect(carrier.encode()).toEqual(before[index]);
          expect(carrier.effects()).toEqual(effectsBefore[index]);
        });
      }
    });

    it("validates at load and fallback transitions, then projects only touched payloads; defaults to targeted", () => {
      for (const factory of [targeted, defaults]) {
        const initial = reference.create(root);
        seed(initial, false);
        const carrier = factory.load(initial.encode());
        const snapshot = vi.spyOn(carrier, "snapshot");
        carrier.applyChange(insertion("first"));
        expect(snapshot).toHaveBeenCalledTimes(0);
        carrier.applyChange(insertion("second"));
        expect(snapshot).toHaveBeenCalledTimes(0);
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
        expect(snapshot).toHaveBeenCalledTimes(2);
        carrier.applyChange(insertion("fourth"));
        expect(snapshot).toHaveBeenCalledTimes(2);
      }
      const [carrier] = pair();
      const snapshot = vi.spyOn(carrier, "snapshot");
      carrier.applyChange(insertion("first"));
      carrier.applyChange(insertion("second"));
      expect(snapshot).toHaveBeenCalledTimes(2);
    });

    it("warms valid merge, restore and fallback transitions before the next ordinary edit", () => {
      for (const transition of ["merge", "restore", "fallback"] as const) {
        const initial = reference.create(root);
        seed(initial, false);
        const bytes = initial.encode();
        const carrier = targeted.load(bytes);
        const history = carrier.captureHistoricalState();
        carrier.applyChange(insertion("before-transition"));
        const snapshot = vi.spyOn(carrier, "snapshot");
        if (transition === "merge") carrier.mergeEncoded(bytes);
        else if (transition === "restore")
          carrier.restoreHistoricalState(history);
        else carrier.applyChange({});
        expect(snapshot).toHaveBeenCalledTimes(
          transition === "fallback" ? 2 : 1,
        );
        snapshot.mockClear();
        carrier.applyChange(insertion("after-transition"));
        expect(snapshot).not.toHaveBeenCalled();
      }
    });

    it("keeps full preflight after rejected edits and failed transitions", () => {
      for (const transition of ["merge", "restore", "edit"] as const) {
        const [, carrier] = pair();
        if (transition === "merge")
          expect(() => carrier.mergeEncoded(Uint8Array.of(1))).toThrow();
        else if (transition === "restore")
          expect(() => carrier.restoreHistoricalState("unknown")).toThrow();
        else
          expect(() => carrier.applyChange(insertion("invalid", -1))).toThrow();
        const snapshot = vi.spyOn(carrier, "snapshot");
        carrier.applyChange(insertion("after-failure"));
        expect(snapshot).toHaveBeenCalledTimes(1);
      }
    });

    it("preserves hidden malformed-owner error ordering, including after a successful edit elsewhere", () => {
      const initial = reference.create(root);
      seed(initial, false);
      const bytes = corruptOwnership(
        reference.candidate,
        initial.encode(),
        other,
        "malformed-owner",
      );
      const carriers = [reference.load(bytes), targeted.load(bytes)];
      const warmErrors = carriers.map((carrier) =>
        errorOf(() => carrier.applyChange(insertion("warm"))),
      );
      expect(warmErrors[1]).toEqual(warmErrors[0]);
      const hiddenEdit: Change = {
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: other,
            offset: 0,
            text: "x",
            origin: human,
          },
        ],
      };
      const before = carriers.map((carrier) => carrier.encode());
      const errors = carriers.map((carrier) =>
        errorOf(() => carrier.applyChange(hiddenEdit)),
      );
      expect(errors[0]).toBeDefined();
      expect(errors[1]).toEqual(errors[0]);
      if (reference.candidate === "automerge") {
        expect(warmErrors[0]).toBeUndefined();
        expect(errors[0]?.message).toMatch(/existing text payload/u);
      }
      carriers.forEach((carrier, index) =>
        expect(carrier.encode()).toEqual(before[index]),
      );
    });

    it("defers malformed retained-ID errors after load, merge and restore in original preflight order", () => {
      const initial = reference.create(root);
      seed(initial, false);
      const history = initial.captureHistoricalState();
      const bytes = initial.encode();
      const corrupt = corruptOwnership(
        reference.candidate,
        bytes,
        "malformed-inline-id",
        block,
      );
      for (const transition of ["load", "merge", "restore"] as const) {
        const carriers = [reference, targeted].map((factory) => {
          const carrier = factory.load(
            transition === "merge" ? bytes : corrupt,
          );
          if (transition === "merge") carrier.mergeEncoded(corrupt);
          if (transition === "restore") carrier.restoreHistoricalState(history);
          return carrier;
        });
        const changes: Change[] = [
          insertion("bad-offset", -1),
          insertion("valid-offset"),
          {
            ...insertion("bad-context"),
            context: { actorId: "", effectId: "invalid" },
          },
        ];
        for (const change of changes) {
          const before = carriers.map((carrier) => carrier.encode());
          const errors = carriers.map((carrier) =>
            errorOf(() => carrier.applyChange(change)),
          );
          expect(errors[0]).toBeDefined();
          expect(errors[1]).toEqual(errors[0]);
          carriers.forEach((carrier, index) =>
            expect(carrier.encode()).toEqual(before[index]),
          );
        }
      }
    });

    it("does not turn successful fallback publication into a late validation failure", () => {
      const carriers = pair();
      const invalidId = "malformed-created-id" as typeof text;
      const creation: Change = {
        inlineContents: [{ inlineContentId: invalidId, blockId: root }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: invalidId,
            mediaType: "text/plain",
            text: "created",
            origin: human,
          },
        ],
      };
      for (const carrier of carriers)
        expect(() => carrier.applyChange(creation)).not.toThrow();
      const before = carriers.map((carrier) => carrier.encode());
      const errors = carriers.map((carrier) =>
        errorOf(() => carrier.applyChange(insertion("rejected"))),
      );
      expect(errors[0]).toBeDefined();
      expect(errors[1]).toEqual(errors[0]);
      carriers.forEach((carrier, index) =>
        expect(carrier.encode()).toEqual(before[index]),
      );
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
      const carriers = pair(true);
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
      seed(initial, false);
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

function corruptOwnership(
  candidate: string,
  bytes: Uint8Array,
  id: string,
  owner: string,
): Uint8Array {
  if (candidate === "automerge") {
    const document = Automerge.load<{
      inlineContentOwners: Record<string, string>;
    }>(bytes);
    return Automerge.save(
      Automerge.change(document, (draft) => {
        draft.inlineContentOwners[id] = owner;
      }),
    );
  }
  const document = new Y.Doc();
  Y.applyUpdate(document, bytes.subarray(37));
  const owners = document
    .getMap("integrated")
    .get("inlineContentOwners") as Y.Map<string>;
  owners.set(id, owner);
  const update = Y.encodeStateAsUpdate(document);
  const result = new Uint8Array(37 + update.length);
  result.set(bytes.subarray(0, 37));
  result.set(update, 37);
  return result;
}
