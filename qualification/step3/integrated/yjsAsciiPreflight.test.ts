import { describe, expect, it } from "vitest";
import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { createYjsIntegratedDocumentCarrierFactory } from "./yjsIntegratedDocumentCarrier.js";
import type {
  IntegratedDocumentChange,
  QualificationWorkCounters,
} from "./carrier.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";

const root = parseBlockId("e1000000-0000-4000-8000-000000000001");
const target = parseInlineContentId("e1000000-0000-4000-8000-000000000002");
const first = { id: "first", kind: "human" } as const;
const second = { id: "second", kind: "imported" } as const;
type Change = IntegratedDocumentChange<LocalDensePosition>;
function counters(): QualificationWorkCounters {
  return {
    snapshots: 0,
    placementDecodes: 0,
    payloads: {},
    textUnits: {},
    textSpans: {},
    opaqueBytes: {},
    livenessTokens: {},
    temporaryTextUnits: {},
  };
}
function factory(
  variant: "native" | "ascii",
  workCounters?: QualificationWorkCounters,
) {
  return createYjsIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
    {
      yjsTextPreflightVariant: variant,
      ...(workCounters ? { workCounters } : {}),
    },
  );
}
function outcome(run: () => void) {
  try {
    run();
    return null;
  } catch (e) {
    if (!(e instanceof Error)) throw e;
    return { name: e.name, message: e.message };
  }
}
function state(c: ReturnType<ReturnType<typeof factory>["create"]>) {
  return {
    snapshot: c.snapshot(),
    effects: c.effects(),
    evidence: c.recordedPayloadEffects(),
  };
}
function pair(text: string) {
  const genesis = factory("native").create(root);
  genesis.applyChange({
    inlineContents: [{ inlineContentId: target, blockId: root }],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: target,
        mediaType: "text/plain",
        text,
        origin: first,
      },
    ],
  });
  const bytes = genesis.encode();
  const counts = counters();
  return [
    factory("native").load(bytes),
    factory("ascii", counts).load(bytes),
    counts,
  ] as const;
}
function applyPair(
  a: ReturnType<ReturnType<typeof factory>["create"]>,
  b: typeof a,
  change: Change,
) {
  const beforeA = a.encode();
  const beforeB = b.encode();
  const ea = outcome(() => a.applyChange(change));
  const eb = outcome(() => b.applyChange(change));
  expect(eb).toEqual(ea);
  if (ea) {
    expect(a.encode()).toEqual(beforeA);
    expect(b.encode()).toEqual(beforeB);
  }
  expect(state(b)).toEqual(state(a));
}

describe("Yjs ASCII text preflight experiment", () => {
  it("compares sequential ASCII batches, Origin spans, empty deletion, reload and restore", () => {
    const [a, b, work] = pair("abcdef");
    applyPair(a, b, {
      context: { actorId: "x", effectId: "batch" },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: target,
          offset: 2,
          text: "!",
          origin: second,
        },
        { kind: "delete-text", inlineContentId: target, start: 4, end: 5 },
        { kind: "delete-text", inlineContentId: target, start: 0, end: 0 },
      ],
    });
    expect(work.temporaryTextUnits[target] ?? 0).toBe(0);
    const tokens = [a.captureHistoricalState(), b.captureHistoricalState()];
    applyPair(a, b, {
      context: { actorId: "x", effectId: "next" },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: target,
          offset: 0,
          text: "Q",
          origin: first,
        },
      ],
    });
    a.restoreHistoricalState(tokens[0]!, { actorId: "x", effectId: "restore" });
    b.restoreHistoricalState(tokens[1]!, { actorId: "x", effectId: "restore" });
    expect(state(b)).toEqual(state(a));
    const reloaded = factory("ascii").load(b.encode());
    expect(state(reloaded)).toEqual(state(a));
  });
  it.each([
    [
      "empty",
      {
        kind: "insert-text",
        inlineContentId: target,
        offset: 1,
        text: "",
        origin: first,
      },
    ],
    [
      "out of range",
      {
        kind: "insert-text",
        inlineContentId: target,
        offset: 99,
        text: "x",
        origin: first,
      },
    ],
    [
      "invalid range",
      { kind: "delete-text", inlineContentId: target, start: 3, end: 1 },
    ],
    [
      "unpaired insert",
      {
        kind: "insert-text",
        inlineContentId: target,
        offset: 1,
        text: "\ud800",
        origin: first,
      },
    ],
    [
      "bad origin",
      {
        kind: "insert-text",
        inlineContentId: target,
        offset: 1,
        text: "x",
        origin: { id: 42, kind: "human" },
      },
    ],
  ] as const)("matches rejection and atomicity for %s", (_name, op) => {
    const [a, b] = pair("abc");
    applyPair(a, b, {
      context: { actorId: "x", effectId: "failed" },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: target,
          offset: 0,
          text: "ok",
          origin: second,
        },
        op as Change["payloads"] extends readonly (infer T)[] | undefined
          ? T
          : never,
      ],
    });
  });
  it("falls back for all non-ASCII target and insertion paths, including surrogate boundaries", () => {
    const [a, b, work] = pair("a😀z");
    for (const [i, change] of [
      {
        kind: "insert-text",
        inlineContentId: target,
        offset: 2,
        text: "x",
        origin: first,
      },
      { kind: "delete-text", inlineContentId: target, start: 1, end: 2 },
      {
        kind: "insert-text",
        inlineContentId: target,
        offset: 1,
        text: "é",
        origin: second,
      },
    ].entries())
      applyPair(a, b, {
        context: { actorId: "x", effectId: `unicode-${i}` },
        payloads: [change as NonNullable<Change["payloads"]>[number]],
      });
    expect(work.temporaryTextUnits[target]).toBeGreaterThan(0);
  });
  it("preserves the complete ASCII code-unit set and Origin attribution", () => {
    const [a, b] = pair("abc");
    const allAscii = Array.from({ length: 128 }, (_, i) =>
      String.fromCharCode(i),
    ).join("");
    applyPair(a, b, {
      context: { actorId: "x", effectId: "all-ascii" },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: target,
          offset: 1,
          text: allAscii,
          origin: second,
        },
        { kind: "delete-text", inlineContentId: target, start: 20, end: 41 },
      ],
    });
  });
  it("matches insertion/deletion at every ASCII boundary after mixed-Origin history", () => {
    for (let offset = 0; offset <= 5; offset++) {
      const [a, b] = pair("abcde");
      applyPair(a, b, {
        context: { actorId: "x", effectId: "fragment" },
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: target,
            offset: 2,
            text: "Z",
            origin: second,
          },
        ],
      });
      applyPair(a, b, {
        context: { actorId: "x", effectId: "edit" },
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: target,
            offset,
            text: "\u0000\r\n",
            origin: first,
          },
          {
            kind: "delete-text",
            inlineContentId: target,
            start: offset,
            end: offset + 3,
          },
        ],
      });
    }
  });
});
