import { describe, expect, it } from "vitest";
import * as Automerge from "@automerge/automerge";
import * as Y from "yjs";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "./automergeIntegratedDocumentCarrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "./yjsIntegratedDocumentCarrier.js";
import { qualificationEffectIdentity } from "./effectContext.js";
import {
  payloadEffectFrontier,
  replacementFrontier,
} from "./replacementEvidence.js";
import type { RecordedPayloadEffect } from "./replacementEvidence.js";

const root = parseBlockId("70000000-0000-4000-8000-000000000001");
const content = parseInlineContentId("70000000-0000-4000-8000-000000000002");
const other = parseInlineContentId("70000000-0000-4000-8000-000000000003");
const origin = { id: "author", kind: "human" as const };
const context = (effectId: string) => ({ actorId: "author", effectId });
const key = (id: string) => qualificationEffectIdentity(context(id));
const replacement = (text: string) => ({
  kind: "replace-text" as const,
  inlineContentId: content,
  mediaType: "text/plain",
  text,
  origin,
});
const factories = [
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
  describe(`${factory.candidate} compact payload causal history`, () => {
    it("retains one parent per sequential effect through reload without envelope payload copies", () => {
      let carrier = factory.create(root);
      carrier.applyChange({
        inlineContents: [{ inlineContentId: content, blockId: root }],
        payloads: [replacement("base")],
        context: context("base"),
      });
      for (let index = 0; index < 64; index++) {
        if (index === 32) carrier = factory.load(carrier.encode());
        carrier.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: content,
              offset: 0,
              text: "x",
              origin,
            },
          ],
          context: context(`edit-${index}`),
        });
      }
      const effects = carrier.recordedPayloadEffects();
      expect(
        effects.reduce((count, effect) => count + effect.parents.length, 0),
      ).toBe(64);
      expect(
        effects.find((effect) => effect.effectId === key("base"))?.parents,
      ).toEqual([]);
      expect(
        effects.find((effect) => effect.effectId === key("edit-32"))?.parents,
      ).toEqual([key("edit-31")]);
      expect(payloadEffectFrontier(effects)).toEqual([key("edit-63")]);
      expect(factory.load(carrier.encode()).recordedPayloadEffects()).toEqual(
        effects,
      );
      const encoded = carrier.encode();
      let envelopes: readonly string[];
      if (factory.candidate === "yjs") {
        const native = new Y.Doc();
        Y.applyUpdate(native, encoded.subarray(37));
        const values = native
          .getMap<unknown>("integrated")
          .get("effectEnvelopes");
        if (!(values instanceof Y.Map)) throw new Error("Missing envelopes");
        envelopes = [...(values as Y.Map<string>).values()];
        native.destroy();
      } else {
        const native = Automerge.load<{
          effectEnvelopes: Record<string, string>;
        }>(encoded);
        envelopes = Object.values(native.effectEnvelopes);
      }
      expect(envelopes).toHaveLength(effects.length);
      for (const envelope of envelopes) {
        const value = JSON.parse(envelope) as Record<string, unknown>;
        expect(value).not.toHaveProperty("payloadEffect");
        expect(
          effects.some((effect) => effect.effectId === value.payloadEffectId),
        ).toBe(true);
      }
    });

    it("joins concurrent heads through edits and unrelated payloads after duplicate reordered delivery", () => {
      const base = factory.create(root);
      base.applyChange({
        inlineContents: [
          { inlineContentId: content, blockId: root },
          { inlineContentId: other, blockId: root },
        ],
        payloads: [
          replacement("base"),
          { ...replacement("other"), inlineContentId: other },
        ],
        context: context("base"),
      });
      const seed = base.encode();
      const left = factory.load(seed);
      const right = factory.load(seed);
      const third = factory.load(seed);
      for (const [carrier, id] of [
        [left, "left"],
        [right, "right"],
        [third, "third"],
      ] as const) {
        carrier.applyChange({
          payloads: [replacement(id)],
          context: context(id),
        });
        carrier.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: content,
              offset: 0,
              text: "!",
              origin,
            },
          ],
          context: context(`${id}-edit`),
        });
      }
      const packets = [left.encode(), right.encode(), third.encode()];
      for (const packet of [...packets].reverse()) left.mergeEncoded(packet);
      for (const packet of [...packets, seed, ...packets])
        right.mergeEncoded(packet);
      expect(left.recordedPayloadEffects()).toEqual(
        right.recordedPayloadEffects(),
      );
      expect(
        replacementFrontier(left.recordedPayloadEffects(), content),
      ).toEqual([key("left"), key("right"), key("third")].sort());
      const retained = left.captureHistoricalState();
      left.applyChange({ context: context("context-only") });
      left.restoreHistoricalState(retained, context("restore"));
      const beforeFailure = left.recordedPayloadEffects();
      expect(() =>
        left.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: content,
              offset: -1,
              text: "!",
              origin,
            },
          ],
          context: context("failed"),
        }),
      ).toThrow();
      expect(left.recordedPayloadEffects()).toEqual(beforeFailure);
      left.applyChange({
        payloads: [
          { ...replacement("unrelated bridge"), inlineContentId: other },
        ],
        context: context("bridge"),
      });
      expect(
        left
          .recordedPayloadEffects()
          .find((effect) => effect.effectId === key("bridge"))?.parents,
      ).toEqual(
        [key("left-edit"), key("right-edit"), key("third-edit")].sort(),
      );
      const reopened = factory.load(left.encode());
      reopened.applyChange({
        payloads: [replacement("later")],
        context: context("later"),
      });
      expect(
        reopened
          .recordedPayloadEffects()
          .find((effect) => effect.effectId === key("later"))?.parents,
      ).toEqual([key("bridge")]);
      expect(
        replacementFrontier(reopened.recordedPayloadEffects(), content),
      ).toEqual([key("later")]);
      right.mergeEncoded(reopened.encode());
      right.mergeEncoded(seed);
      right.mergeEncoded(left.encode());
      right.applyChange({
        payloads: [replacement("last")],
        context: context("last"),
      });
      expect(
        right
          .recordedPayloadEffects()
          .find((effect) => effect.effectId === key("last"))?.parents,
      ).toEqual([key("later")]);
      expect(
        replacementFrontier(right.recordedPayloadEffects(), content),
      ).toEqual([key("last")]);
      expect(right.materializeHistoricalState(retained)).toEqual(
        left.materializeHistoricalState(retained),
      );
      expect(right.effects().has(key("context-only"))).toBe(true);
      expect(right.effects().has(key("restore"))).toBe(true);
      expect(right.effects().has(key("failed"))).toBe(false);
    });

    it("rejects missing DAG dependencies before publishing a merge or reopening", () => {
      const base = factory.create(root);
      base.applyChange({
        inlineContents: [{ inlineContentId: content, blockId: root }],
        payloads: [replacement("base")],
        context: context("base"),
      });
      const remote = factory.load(base.encode());
      remote.applyChange({
        payloads: [replacement("remote")],
        context: context("remote"),
      });
      const invalid = rewritePayloadEffect(
        factory.candidate,
        remote.encode(),
        key("remote"),
        (effect) => ({ ...effect, parents: ["missing"] }),
      );
      const before = base.snapshot();
      expect(() => factory.load(invalid)).toThrow(/dependency is missing/u);
      expect(() => base.mergeEncoded(invalid)).toThrow(
        /dependency is missing/u,
      );
      expect(base.snapshot()).toEqual(before);
      expect(base.effects().has(key("remote"))).toBe(false);
      base.applyChange({
        payloads: [replacement("after")],
        context: context("after"),
      });
      expect(
        base
          .recordedPayloadEffects()
          .find((effect) => effect.effectId === key("after"))?.parents,
      ).toEqual([key("base")]);
    });

    it("still compares payload evidence independently of the referenced envelope", () => {
      const carrier = factory.create(root);
      carrier.applyChange({
        inlineContents: [{ inlineContentId: content, blockId: root }],
        payloads: [replacement("base")],
        context: context("base"),
      });
      const invalid = rewritePayloadEffect(
        factory.candidate,
        carrier.encode(),
        key("base"),
        (effect) => ({ ...effect, operations: [] }),
      );
      const before = carrier.recordedPayloadEffects();
      expect(() => carrier.mergeEncoded(invalid)).toThrow(
        /discard payload effect evidence/u,
      );
      expect(carrier.recordedPayloadEffects()).toEqual(before);
    });

    it("keeps the cached frontier intact after rejecting conflicting authored effects", () => {
      const base = factory.create(root);
      base.applyChange({
        inlineContents: [{ inlineContentId: content, blockId: root }],
        payloads: [replacement("base")],
        context: context("base"),
      });
      const left = factory.load(base.encode());
      const right = factory.load(base.encode());
      left.applyChange({
        payloads: [replacement("left")],
        context: context("reused"),
      });
      right.applyChange({
        payloads: [replacement("right")],
        context: context("reused"),
      });
      expect(() => left.mergeEncoded(right.encode())).toThrow(
        /Conflicting qualification effect identity/u,
      );
      expect(() =>
        left.applyChange({
          payloads: [replacement("reuse")],
          context: context("reused"),
        }),
      ).toThrow();
      left.applyChange({
        payloads: [replacement("after")],
        context: context("after"),
      });
      expect(
        left
          .recordedPayloadEffects()
          .find((effect) => effect.effectId === key("after"))?.parents,
      ).toEqual([key("reused")]);
    });
  });
}

function rewritePayloadEffect(
  candidate: "yjs" | "automerge",
  encoded: Uint8Array,
  id: string,
  rewrite: (effect: RecordedPayloadEffect) => RecordedPayloadEffect,
): Uint8Array {
  const rewriteEncoded = (value: string | undefined): string => {
    if (value === undefined) throw new Error("Missing effect fixture");
    return JSON.stringify(rewrite(JSON.parse(value) as RecordedPayloadEffect));
  };
  if (candidate === "automerge") {
    const native = Automerge.load<{ payloadEffects: Record<string, string> }>(
      encoded,
    );
    return Automerge.save(
      Automerge.change(native, (draft) => {
        draft.payloadEffects[id] = rewriteEncoded(draft.payloadEffects[id]);
      }),
    );
  }
  const native = new Y.Doc();
  Y.applyUpdate(native, encoded.subarray(37));
  const values = native.getMap<unknown>("integrated").get("payloadEffects");
  if (!(values instanceof Y.Map)) throw new Error("Missing effects");
  const effects = values as Y.Map<string>;
  effects.set(id, rewriteEncoded(effects.get(id)));
  const update = Y.encodeStateAsUpdate(native);
  const result = new Uint8Array(37 + update.length);
  result.set(encoded.subarray(0, 37));
  result.set(update, 37);
  native.destroy();
  return result;
}

function effect(
  effectId: string,
  parents: readonly string[],
): RecordedPayloadEffect {
  return { effectId, parents, operations: [] };
}

describe("payload DAG validation", () => {
  it("walks a long shuffled chain iteratively", () => {
    const effects = Array.from({ length: 10000 }, (_, index) =>
      effect(String(index), index === 0 ? [] : [String(index - 1)]),
    );
    expect(payloadEffectFrontier(effects.reverse())).toEqual(["9999"]);
  });
  it.each([
    [effect("a", ["missing"])],
    [effect("a", ["a"])],
    [effect("a", ["b"]), effect("b", ["a"])],
    [effect("a", []), effect("a", [])],
    [effect("a", []), effect("b", ["a", "a"])],
  ])("rejects incomplete or cyclic evidence %#", (...effects) => {
    expect(() => payloadEffectFrontier(effects)).toThrow();
  });
});
