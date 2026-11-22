import * as A from "@automerge/automerge";
import { describe, expect, it, vi } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createAutomergeImmutableRunCarrierFactory } from "./automergeCarrier.js";
import { AutomergeImmutableRunDocument } from "./nativeDocument.js";

vi.mock("@automerge/automerge", async (importOriginal) => {
  const actual = await importOriginal<typeof A>();
  return { ...actual, diff: vi.fn(actual.diff) };
});

const root = parseBlockId("e8000000-0000-4000-8000-000000000001");
const inline = parseInlineContentId("e8000000-0000-4000-8000-000000000002");
const origin = { kind: "human", id: "author" } as const;
const codec = {
  encode: (v: string): string => v,
  decode: (v: string): string => v,
};
const compare = (a: string, b: string): -1 | 0 | 1 =>
  a < b ? -1 : a > b ? 1 : 0;
const factory = createAutomergeImmutableRunCarrierFactory(
  codec,
  { compare, comparePrimary: compare },
  { purePositionDecoder: true },
);
interface Raw extends Record<string, unknown> {
  semanticRoot: Record<string, boolean>;
  descriptors: Record<string, Record<string, boolean>>;
}

function expectNativeRoot(encoded: Uint8Array): void {
  const raw = A.load<Raw>(encoded);
  const view = A.view(raw, A.getHeads(raw));
  const native = AutomergeImmutableRunDocument.load(encoded);
  expect(JSON.stringify(native.activate().root)).toBe(
    Object.keys(view.semanticRoot)[0],
  );
}

describe("immutable-run cold native metadata projection", () => {
  it("uses complete causal root overwrites without replaying unrelated record patches", () => {
    const carrier = factory.create(root);
    for (let index = 0; index < 8; index++)
      carrier.applyChange({
        context: { actorId: "author", effectId: String(index) },
      });
    const encoded = carrier.encode();
    vi.mocked(A.diff).mockClear();
    expectNativeRoot(encoded);
    // Bootstrap has no previously validated metadata; the eight single-parent
    // record/root-only changes prove their complete overwrite from native pred.
    expect(A.diff).toHaveBeenCalledTimes(1);
  });

  it("retains capture metadata through the native diff fallback and following overwrite", () => {
    const carrier = factory.create(root);
    carrier.applyChange({ context: { actorId: "author", effectId: "before" } });
    const token = carrier.captureHistoricalState();
    carrier.applyChange({ context: { actorId: "author", effectId: "after" } });
    vi.mocked(A.diff).mockClear();
    const reopened = factory.load(carrier.encode());
    expect(reopened.materializeHistoricalState(token).rootId).toBe(root);
    expect(A.diff).toHaveBeenCalledTimes(2);
  });

  it("uses the native winner when root predecessor coverage is incomplete", () => {
    const carrier = factory.create(root);
    const before = A.load<Raw>(carrier.encode());
    carrier.applyChange({ context: { actorId: "author", effectId: "one" } });
    const change = A.decodeChange(
      A.getChanges(before, A.load(carrier.encode()))[0]!,
    );
    const altered = A.encodeChange({
      ...change,
      ops: change.ops.map((op) =>
        op.obj === "_root" && op.key === "semanticRoot"
          ? { ...op, pred: [] }
          : op,
      ),
    });
    const [raw] = A.applyChanges(A.clone(before), [altered]);
    expect(Object.keys(A.getConflicts(raw, "semanticRoot")!)).toHaveLength(2);
    vi.mocked(A.diff).mockClear();
    expectNativeRoot(A.save(raw));
    expect(A.diff).toHaveBeenCalledTimes(2);
  });

  it("preserves public native descriptor winners at a concurrent join", () => {
    const base = factory.create(root);
    base.applyChange({
      context: { actorId: "author", effectId: "seed" },
      inlineContents: [{ inlineContentId: inline, blockId: root }],
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: inline,
          mediaType: "text/plain",
          text: "base",
          origin,
        },
      ],
    });
    const left = factory.load(base.encode()),
      right = factory.load(base.encode());
    for (const [carrier, text] of [
      [left, "left"],
      [right, "right"],
    ] as const)
      carrier.applyChange({
        context: { actorId: text, effectId: "replacement" },
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: inline,
            mediaType: "text/plain",
            text,
            origin,
          },
        ],
      });
    const leftRaw = A.load<Raw>(left.encode()),
      rightRaw = A.load<Raw>(right.encode());
    const merged = A.merge(A.clone(leftRaw), rightRaw);
    const winner = Object.keys(
      A.view(merged, A.getHeads(merged)).descriptors[inline]!,
    )[0];
    const expected =
      winner === Object.keys(leftRaw.descriptors[inline]!)[0]
        ? "left"
        : "right";
    left.mergeEncoded(right.encode());
    expect(
      factory.load(left.encode()).snapshot().payloads.get(inline),
    ).toMatchObject({ text: expected });
    expectNativeRoot(left.encode());
  });
});
