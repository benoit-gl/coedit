import { describe, expect, it, vi } from "vitest";
import * as A from "@automerge/automerge";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import type { QualificationOrigin } from "../payload/carrier.js";
import { QualificationIncrementalEditor } from "../editor/incrementalEditor.js";
import {
  applyAutomergeImmutableRunFixtureTransitionV1,
  createAutomergeImmutableRunCarrierFactory,
  inspectAutomergeImmutableRunTransitionsV1,
} from "./automergeCarrier.js";

const rootId = parseBlockId("a1000000-0000-4000-8000-000000000001");
const blockId = parseBlockId("a1000000-0000-4000-8000-000000000002");
const inlineId = parseInlineContentId("a1000000-0000-4000-8000-000000000003");
const origin = { kind: "human", id: "author" } as const;
const codec = Object.freeze({
  encode(value: string): string {
    return value;
  },
  decode(value: string): string {
    return value;
  },
});
const ordering = Object.freeze({
  comparePrimary(left: string, right: string): -1 | 0 | 1 {
    return compare(left, right);
  },
  compare(left: string, right: string): -1 | 0 | 1 {
    return compare(left, right);
  },
});

function compare(left: string, right: string): -1 | 0 | 1 {
  return left < right ? -1 : left > right ? 1 : 0;
}

function created() {
  const carrier = createAutomergeImmutableRunCarrierFactory(codec, ordering, {
    purePositionDecoder: true,
  }).create(rootId);
  carrier.applyChange({
    context: { actorId: "alice", effectId: "create" },
    placements: [{ blockId, placement: { position: "a", depth: 1 } }],
    inlineContents: [{ inlineContentId: inlineId, blockId }],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: inlineId,
        mediaType: "text/plain",
        text: "A😀B",
        origin,
      },
    ],
  });
  return carrier;
}

describe("immutable-run Automerge carrier", () => {
  it("preserves general stateful decoder preflight and pure-decoder ordinary opt in", () => {
    let blocked = false;
    const decode = vi.fn((value: string): string => {
      if (blocked)
        throw new TypeError("Stateful decoder rejected retained placement.");
      return value;
    });
    const stateful = { encode: codec.encode, decode };
    const factory = createAutomergeImmutableRunCarrierFactory(
      stateful,
      ordering,
    );
    const carrier = factory.create(rootId);
    carrier.applyChange({
      placements: [{ blockId, placement: { position: "a", depth: 1 } }],
      inlineContents: [{ inlineContentId: inlineId, blockId }],
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: inlineId,
          mediaType: "text/plain",
          text: "ab",
          origin,
        },
      ],
    });
    const before = carrier.encode();
    blocked = true;
    expect(() =>
      carrier.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: inlineId,
            offset: 1,
            text: "X",
            origin,
          },
        ],
      }),
    ).toThrow(/Stateful decoder/);
    expect(carrier.encode()).toEqual(before);
    expect(carrier.prepareOrdinaryText()).toBe(false);
    expect(carrier.readOrdinaryTextRange(inlineId, 0, 0)).toBeUndefined();
    blocked = false;
    const pure = createAutomergeImmutableRunCarrierFactory(stateful, ordering, {
      purePositionDecoder: true,
    }).load(before);
    decode.mockClear();
    const revision = pure.readOrdinaryTextRange(inlineId, 0, 0)!.revision;
    pure.applyOrdinaryChange(
      {
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: inlineId,
            offset: 1,
            text: "X",
            origin,
          },
        ],
      },
      revision,
    );
    expect(decode).not.toHaveBeenCalled();
    expect(
      pure
        .readOrdinaryTextRange(inlineId, 0, 3)!
        .spans.map((span) => span.text)
        .join(""),
    ).toBe("aXb");
  });
  it("publishes same-command ownership and exact attributed text", () => {
    const carrier = created();
    expect(carrier.snapshot().payloads.get(inlineId)).toEqual({
      kind: "text",
      mediaType: "text/plain",
      text: "A😀B",
      spans: [{ text: "A😀B", origin }],
    });
    expect(carrier.effects().size).toBe(1);
    expect(carrier.recordedPayloadEffects()).toHaveLength(1);
  });

  it("keeps ordinary receipts, positions, capture, and reopen functional", () => {
    const carrier = created();
    const before = carrier.readOrdinaryTextRange(inlineId, 0, 4)!;
    const position = carrier.createStableTextPosition(inlineId, 1, "before");
    const revision = carrier.applyOrdinaryChange(
      {
        context: { actorId: "alice", effectId: "insert" },
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: inlineId,
            offset: 1,
            text: "x",
            origin,
          },
        ],
      },
      before.revision,
    );
    expect(carrier.resolveStableTextPosition(position)).toBe(1);
    expect(() =>
      carrier.applyOrdinaryChange(
        {
          context: { actorId: "alice", effectId: "stale" },
          payloads: [
            {
              kind: "delete-text",
              inlineContentId: inlineId,
              start: 0,
              end: 1,
            },
          ],
        },
        before.revision,
      ),
    ).toThrow(/stale/);
    expect(revision).not.toBe(before.revision);
    const token = carrier.captureHistoricalState();
    expect(
      carrier.materializeHistoricalState(token).payloads.get(inlineId),
    ).toMatchObject({
      text: "Ax😀B",
    });
    const reopened = createAutomergeImmutableRunCarrierFactory(
      codec,
      ordering,
      {
        purePositionDecoder: true,
      },
    ).load(carrier.encode());
    expect(reopened.snapshot().payloads.get(inlineId)).toMatchObject({
      text: "Ax😀B",
    });
    expect(
      reopened.materializeHistoricalState(token).payloads.get(inlineId),
    ).toMatchObject({
      text: "Ax😀B",
    });
  });

  it.each(["Block", "InlineContent"] as const)(
    "hides text retained under a retired %s across reopen and merge, then restores fresh positions",
    (retiredEntity) => {
      const factory = createAutomergeImmutableRunCarrierFactory(
        codec,
        ordering,
        {
          purePositionDecoder: true,
        },
      );
      const carrier = created();
      const beforeAddition = carrier.captureHistoricalState();
      const targetId =
        retiredEntity === "Block"
          ? inlineId
          : parseInlineContentId("a1000000-0000-4000-8000-000000000008");
      if (retiredEntity === "InlineContent")
        carrier.applyChange({
          context: { actorId: "alice", effectId: "add-inline" },
          inlineContents: [{ inlineContentId: targetId, blockId }],
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: targetId,
              mediaType: "text/plain",
              text: "A😀B",
              origin,
            },
          ],
        });
      const liveToken = carrier.captureHistoricalState();
      const liveBytes = carrier.encode();
      const receipt = carrier.readOrdinaryTextRange(targetId, 0, 4)!;
      const position = carrier.createStableTextPosition(targetId, 1, "before");
      if (retiredEntity === "Block")
        carrier.applyChange({
          context: { actorId: "alice", effectId: "retire-block" },
          deleteBlockIds: [blockId],
        });
      else
        carrier.restoreHistoricalState(beforeAddition, {
          actorId: "alice",
          effectId: "retire-inline",
        });
      const reopened = factory.load(carrier.encode());
      const merged = factory.load(liveBytes);
      merged.mergeEncoded(carrier.encode());
      for (const observed of [carrier, reopened, merged]) {
        const bytes = observed.encode();
        expect(observed.snapshot().payloads.has(targetId)).toBe(false);
        expect(observed.projectEditorPayload(targetId)).toBeUndefined();
        expect(observed.readOrdinaryTextRange(targetId, 0, 4)).toBeUndefined();
        expect(() =>
          observed.createStableTextPosition(targetId, 1, "before"),
        ).toThrow(/live text payload/u);
        expect(observed.resolveStableTextPosition(position)).toBeUndefined();
        expect(() =>
          observed.applyOrdinaryChange(
            {
              context: { actorId: "alice", effectId: "stale-edit" },
              payloads: [
                {
                  kind: "insert-text",
                  inlineContentId: targetId,
                  offset: 0,
                  text: "!",
                  origin,
                },
              ],
            },
            receipt.revision,
          ),
        ).toThrow(/stale/u);
        expect(
          () => new QualificationIncrementalEditor(observed, targetId),
        ).toThrow(/live text target/u);
        expect(observed.encode()).toEqual(bytes);
        expect(
          textOf(
            observed
              .materializeHistoricalState(liveToken)
              .payloads.get(targetId),
          ),
        ).toBe("A😀B");
      }

      const beforeDirectEdit = merged.encode();
      expect(() =>
        merged.applyChange({
          context: { actorId: "alice", effectId: "direct-dead-edit" },
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: targetId,
              offset: 0,
              text: "!",
              origin,
            },
          ],
        }),
      ).toThrow(/live InlineContent and owner Block/u);
      expect(merged.encode()).toEqual(beforeDirectEdit);

      carrier.restoreHistoricalState(liveToken, {
        actorId: "alice",
        effectId: "reactivate",
      });
      expect(carrier.resolveStableTextPosition(position)).toBeUndefined();
      const restoredPosition = carrier.createStableTextPosition(
        targetId,
        1,
        "before",
      );
      expect(restoredPosition).not.toEqual(position);
      expect(carrier.resolveStableTextPosition(restoredPosition)).toBe(1);
      const restoredRead = carrier.readOrdinaryTextRange(targetId, 0, 4)!;
      expect(restoredRead.spans).toEqual([{ text: "A😀B", origin }]);
      carrier.applyOrdinaryChange(
        {
          context: { actorId: "alice", effectId: "restored-edit" },
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: targetId,
              offset: 0,
              text: "!",
              origin,
            },
          ],
        },
        restoredRead.revision,
      );
      expect(textOf(carrier.projectEditorPayload(targetId))).toBe("!A😀B");
    },
  );

  it("merges concurrent inserts and continues editing from one readiness root", () => {
    const base = created().encode();
    const factory = createAutomergeImmutableRunCarrierFactory(codec, ordering, {
      purePositionDecoder: true,
    });
    const left = factory.load(base);
    const right = factory.load(base);
    left.applyChange({
      context: { actorId: "left", effectId: "one" },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: inlineId,
          offset: 1,
          text: "L",
          origin,
        },
      ],
    });
    right.applyChange({
      context: { actorId: "right", effectId: "one" },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: inlineId,
          offset: 1,
          text: "R",
          origin,
        },
      ],
    });
    left.mergeEncoded(right.encode());
    expect(textOf(left.snapshot().payloads.get(inlineId))).toMatch(
      /^A(?:LR|RL)😀B$/,
    );
    const read = left.readOrdinaryTextRange(inlineId, 0, 6)!;
    left.applyOrdinaryChange(
      {
        context: { actorId: "left", effectId: "after-merge" },
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: inlineId,
            offset: 0,
            text: "!",
            origin,
          },
        ],
      },
      read.revision,
    );
    expect(textOf(left.snapshot().payloads.get(inlineId))).toMatch(
      /^!A(?:LR|RL)😀B$/,
    );
  });

  it("refuses surrogate-splitting ordinary edits atomically", () => {
    const carrier = created();
    const revision = carrier.readOrdinaryTextRange(inlineId, 0, 4)!.revision;
    expect(() =>
      carrier.applyOrdinaryChange(
        {
          context: { actorId: "alice", effectId: "split" },
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: inlineId,
              offset: 2,
              text: "x",
              origin,
            },
          ],
        },
        revision,
      ),
    ).toThrow();
    expect(carrier.snapshot().payloads.get(inlineId)).toMatchObject({
      text: "A😀B",
    });
  });

  it("refuses an uncommitted native registry write on reopen", () => {
    const bytes = created().encode();
    let forged = A.load<{
      placements: Record<string, Record<string, boolean>>;
    }>(bytes);
    forged = A.change(forged, (draft) => {
      draft.placements["a1000000-0000-4000-8000-000000000099"] = {
        forged: true,
      };
    });
    const factory = createAutomergeImmutableRunCarrierFactory(codec, ordering, {
      purePositionDecoder: true,
    });
    expect(() => factory.load(A.save(forged))).toThrow(/Rootless|rootless/);
  });

  it("initializes opaque material with ownership in the same command", () => {
    const opaqueId = parseInlineContentId(
      "a1000000-0000-4000-8000-000000000004",
    );
    const carrier = createAutomergeImmutableRunCarrierFactory(
      codec,
      ordering,
    ).create(rootId);
    carrier.applyChange({
      context: { actorId: "alice", effectId: "opaque" },
      placements: [{ blockId, placement: { position: "a", depth: 1 } }],
      inlineContents: [{ inlineContentId: opaqueId, blockId }],
      payloads: [
        {
          kind: "replace-opaque",
          inlineContentId: opaqueId,
          mediaType: "application/octet-stream",
          bytes: new Uint8Array([0, 255, 7]),
          origin,
        },
      ],
    });
    expect(carrier.snapshot().payloads.get(opaqueId)).toEqual({
      kind: "opaque",
      mediaType: "application/octet-stream",
      bytes: new Uint8Array([0, 255, 7]),
      origin,
    });
  });

  it("keeps concurrent liveness and source beyond an observed retirement", () => {
    const factory = createAutomergeImmutableRunCarrierFactory(codec, ordering, {
      purePositionDecoder: true,
    });
    const encoded = created().encode();
    const deleting = factory.load(encoded);
    const editing = factory.load(encoded);
    deleting.applyChange({
      context: { actorId: "deleter", effectId: "delete" },
      deleteBlockIds: [blockId],
    });
    editing.applyChange({
      context: { actorId: "editor", effectId: "edit" },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: inlineId,
          offset: 4,
          text: "!",
          origin,
        },
      ],
    });
    deleting.mergeEncoded(editing.encode());
    const snapshot = deleting.snapshot();
    expect(snapshot.blockLiveness.get(blockId)).toBe(true);
    expect(textOf(snapshot.payloads.get(inlineId))).toBe("A😀B!");
    expect(deleting.effects().size).toBe(3);
  });

  it("restores exact mixed material with fresh private source and reopens", () => {
    const opaqueId = parseInlineContentId(
      "a1000000-0000-4000-8000-000000000004",
    );
    const carrier = created();
    carrier.applyChange({
      context: { actorId: "alice", effectId: "captured-mix" },
      inlineContents: [{ inlineContentId: opaqueId, blockId }],
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: inlineId,
          offset: 1,
          text: "x",
          origin: { kind: "ai", id: "assistant" },
        },
        {
          kind: "replace-opaque",
          inlineContentId: opaqueId,
          mediaType: "application/octet-stream",
          bytes: new Uint8Array([0, 7, 255]),
          origin,
        },
      ],
    });
    const token = carrier.captureHistoricalState();
    const captured = carrier.snapshot();
    const oldPosition = carrier.createStableTextPosition(inlineId, 2, "after");
    carrier.applyChange({
      context: { actorId: "alice", effectId: "later" },
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: inlineId,
          mediaType: "text/plain",
          text: "later",
          origin,
        },
        {
          kind: "replace-opaque",
          inlineContentId: opaqueId,
          mediaType: "application/octet-stream",
          bytes: new Uint8Array([9]),
          origin,
        },
      ],
    });
    carrier.restoreHistoricalState(token, {
      actorId: "alice",
      effectId: "restore",
    });
    expect(carrier.snapshot()).toEqual(captured);
    expect(carrier.resolveStableTextPosition(oldPosition)).toBeUndefined();
    expect(carrier.recordedPayloadEffects()).toHaveLength(3);
    const factory = createAutomergeImmutableRunCarrierFactory(codec, ordering, {
      purePositionDecoder: true,
    });
    const reopened = factory.load(carrier.encode());
    expect(reopened.snapshot()).toEqual(captured);
    const transitions = inspectAutomergeImmutableRunTransitionsV1(reopened);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.[1]).toBe("restore");
    expect(transitions[0]?.[5].length).toBeGreaterThan(1);
    expect(transitions[0]?.[3][0]?.[2]).not.toEqual(
      transitions[0]?.[4][0]?.[2],
    );
    const read = reopened.readOrdinaryTextRange(inlineId, 0, 5)!;
    reopened.applyOrdinaryChange(
      {
        context: { actorId: "alice", effectId: "after-restore" },
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: inlineId,
            offset: 0,
            text: "!",
            origin,
          },
        ],
      },
      read.revision,
    );
    expect(textOf(reopened.snapshot().payloads.get(inlineId))).toBe("!Ax😀B");
  });

  it("keeps a same-command delete-and-edit Block live in the warm view", () => {
    const carrier = created();
    carrier.applyChange({
      context: { actorId: "alice", effectId: "delete-and-edit" },
      deleteBlockIds: [blockId],
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: inlineId,
          offset: 4,
          text: "!",
          origin,
        },
      ],
    });
    expect(carrier.snapshot().blockLiveness.get(blockId)).toBe(true);
    expect(textOf(carrier.snapshot().payloads.get(inlineId))).toBe("A😀B!");
    const reopened = createAutomergeImmutableRunCarrierFactory(
      codec,
      ordering,
    ).load(carrier.encode());
    expect(reopened.snapshot().blockLiveness.get(blockId)).toBe(true);
    expect(textOf(reopened.snapshot().payloads.get(inlineId))).toBe("A😀B!");
  });

  it("refuses mismatched restore attribution before native publication", () => {
    const carrier = created();
    const token = carrier.captureHistoricalState();
    carrier.applyChange({
      context: { actorId: "alice", effectId: "later-atomic" },
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: inlineId,
          mediaType: "text/plain",
          text: "later",
          origin,
        },
      ],
    });
    const before = carrier.encode();
    expect(() =>
      carrier.restoreHistoricalState(token, {
        actorId: "alice",
        effectId: "wrong-source",
        source: { kind: "copy", reference: token },
      }),
    ).toThrow(/exact retained token/);
    expect(carrier.encode()).toEqual(before);
    expect(() =>
      carrier.restoreHistoricalState("missing", {
        actorId: "alice",
        effectId: "missing",
      }),
    ).toThrow(/Unknown retained/);
    expect(carrier.encode()).toEqual(before);
  });

  it("persists explicit split and recombination lineage across reopen", () => {
    const rightId = parseInlineContentId(
      "a1000000-0000-4000-8000-000000000005",
    );
    const emptyId = parseInlineContentId(
      "a1000000-0000-4000-8000-000000000007",
    );
    const carrier = created();
    applyAutomergeImmutableRunFixtureTransitionV1(carrier, {
      kind: "split",
      sources: [{ blockId, inlineContentId: inlineId }],
      destinations: [
        {
          blockId,
          inlineContentId: inlineId,
          mediaType: "text/plain",
          spans: [{ text: "A😀", origin }],
        },
        {
          blockId,
          inlineContentId: rightId,
          mediaType: "text/plain",
          spans: [{ text: "B", origin }],
        },
        {
          blockId,
          inlineContentId: emptyId,
          mediaType: "text/plain",
          spans: [],
        },
      ],
      context: { actorId: "alice", effectId: "split" },
    });
    expect(textOf(carrier.snapshot().payloads.get(inlineId))).toBe("A😀");
    expect(textOf(carrier.snapshot().payloads.get(rightId))).toBe("B");
    let reopened = createAutomergeImmutableRunCarrierFactory(codec, ordering, {
      purePositionDecoder: true,
    }).load(carrier.encode());
    const split = inspectAutomergeImmutableRunTransitionsV1(reopened)[0]!;
    expect(split[1]).toBe("split");
    expect(split[3]).toHaveLength(1);
    expect(split[4]).toHaveLength(3);
    expect(
      split[6].some(
        (mapping) => mapping[2][1] === emptyId && mapping[3][0] === "empty",
      ),
    ).toBe(true);

    applyAutomergeImmutableRunFixtureTransitionV1(reopened, {
      kind: "merge",
      sources: [
        { blockId, inlineContentId: inlineId },
        { blockId, inlineContentId: rightId },
        { blockId, inlineContentId: emptyId },
      ],
      destinations: [
        {
          blockId,
          inlineContentId: inlineId,
          mediaType: "text/plain",
          spans: [{ text: "A😀B", origin }],
        },
      ],
      context: { actorId: "alice", effectId: "merge" },
    });
    expect(reopened.snapshot().payloads.has(rightId)).toBe(false);
    expect(reopened.snapshot().payloads.has(emptyId)).toBe(false);
    expect(textOf(reopened.snapshot().payloads.get(inlineId))).toBe("A😀B");
    reopened = createAutomergeImmutableRunCarrierFactory(codec, ordering, {
      purePositionDecoder: true,
    }).load(reopened.encode());
    expect(inspectAutomergeImmutableRunTransitionsV1(reopened)).toHaveLength(2);
    expect(reopened.snapshot().payloads.has(rightId)).toBe(false);
  });

  it("records copy derivation with fresh destination source and no lineage tag", () => {
    const copiedId = parseInlineContentId(
      "a1000000-0000-4000-8000-000000000006",
    );
    const carrier = created();
    const token = carrier.captureHistoricalState();
    applyAutomergeImmutableRunFixtureTransitionV1(carrier, {
      kind: "copy",
      sourceReference: token,
      sources: [{ blockId, inlineContentId: inlineId }],
      destinations: [
        {
          blockId,
          inlineContentId: copiedId,
          mediaType: "text/plain",
          spans: [{ text: "A😀B", origin }],
        },
      ],
      context: { actorId: "alice", effectId: "copy" },
    });
    const reopened = createAutomergeImmutableRunCarrierFactory(
      codec,
      ordering,
      { purePositionDecoder: true },
    ).load(carrier.encode());
    expect(textOf(reopened.snapshot().payloads.get(copiedId))).toBe("A😀B");
    const transition = inspectAutomergeImmutableRunTransitionsV1(reopened)[0]!;
    expect(transition[1]).toBe("copy");
    expect(transition[5].every((mapping) => mapping[8] === "copy")).toBe(true);
    expect(transition[3][0]![2]).not.toEqual(transition[4][0]![2]);
  });

  it("authors an unambiguous common clipboard copy transition", () => {
    const carrier = created();
    const token = carrier.captureHistoricalState();
    carrier.applyChange({
      context: {
        actorId: "alice",
        effectId: "clipboard-copy",
        source: { kind: "copy", reference: token },
      },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: inlineId,
          offset: 4,
          text: "😀",
          origin,
        },
      ],
    });
    expect(textOf(carrier.snapshot().payloads.get(inlineId))).toBe("A😀B😀");
    const reopened = createAutomergeImmutableRunCarrierFactory(
      codec,
      ordering,
      { purePositionDecoder: true },
    ).load(carrier.encode());
    const transition = inspectAutomergeImmutableRunTransitionsV1(reopened)[0]!;
    expect(transition[1]).toBe("copy");
    expect(transition[3][0]![2]).toEqual(transition[4][0]![2]);
    expect(transition[5].every((mapping) => mapping[8] === "copy")).toBe(true);
    expect(transition[5][0]?.[1]).not.toEqual(transition[5][0]?.[5]);
  });

  it("refuses unresolved, wrong-Origin, ambiguous, and mixed clipboard copies atomically", () => {
    const carrier = created();
    const initialToken = carrier.captureHistoricalState();
    const initial = carrier.encode();
    const copy = (
      reference: string,
      effectId: string,
      copyOrigin: QualificationOrigin = origin,
    ): void =>
      carrier.applyChange({
        context: {
          actorId: "alice",
          effectId,
          source: { kind: "copy", reference },
        },
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: inlineId,
            offset: 4,
            text: "A",
            origin: copyOrigin,
          },
        ],
      });
    expect(() => copy("missing", "missing-copy")).toThrow(/unresolved/u);
    expect(carrier.encode()).toEqual(initial);
    expect(() =>
      copy(initialToken, "wrong-origin-copy", {
        kind: "automation",
        id: origin.id,
      }),
    ).toThrow(/missing or ambiguous/u);
    expect(carrier.encode()).toEqual(initial);
    expect(() =>
      carrier.applyChange({
        context: {
          actorId: "alice",
          effectId: "mixed-copy",
          source: { kind: "copy", reference: initialToken },
        },
        deleteBlockIds: [blockId],
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: inlineId,
            offset: 4,
            text: "A",
            origin,
          },
        ],
      }),
    ).toThrow(/pure destination insertion/u);
    expect(carrier.encode()).toEqual(initial);

    carrier.applyChange({
      context: { actorId: "alice", effectId: "repeat-source" },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: inlineId,
          offset: 4,
          text: "A",
          origin,
        },
      ],
    });
    const ambiguousToken = carrier.captureHistoricalState();
    const ambiguous = carrier.encode();
    expect(() => copy(ambiguousToken, "ambiguous-copy")).toThrow(
      /missing or ambiguous/u,
    );
    expect(carrier.encode()).toEqual(ambiguous);
  });

  it("refuses a root-pointer rewrite that has no authored semantic root", () => {
    let forged = A.load<{
      semanticRoot: Record<string, boolean>;
    }>(created().encode());
    forged = A.change(forged, (draft) => {
      draft.semanticRoot = { forged: true };
    });
    const factory = createAutomergeImmutableRunCarrierFactory(codec, ordering);
    expect(() => factory.load(A.save(forged))).toThrow();
  });
});

function textOf(payload: unknown): string {
  if (
    payload === null ||
    typeof payload !== "object" ||
    !("kind" in payload) ||
    payload.kind !== "text" ||
    !("text" in payload) ||
    typeof payload.text !== "string"
  )
    throw new TypeError("Expected a text payload.");
  return payload.text;
}
