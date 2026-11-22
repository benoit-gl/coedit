import * as A from "@automerge/automerge";
import { describe, expect, it } from "vitest";

import { encodeStructuralPlacement } from "../../../src/carrier/index.js";
import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { encodeEffectContext } from "../integrated/effectContext.js";
import { createAutomergeImmutableRunCarrierFactory } from "./automergeCarrier.js";
import { AutomergeImmutableRunDocument } from "./nativeDocument.js";
import { commitRecordV1, decodeRecordKeyV1 } from "./record.js";

type Cell = Record<string, boolean>;
interface Raw extends Record<string, unknown> {
  records: Record<string, unknown>;
  semanticRoot: Cell;
  placements: Record<string, Cell>;
  descriptors: Record<string, Cell>;
  captures: Record<string, Cell>;
}
const uuid = (n: number): string =>
  `e9000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const root = parseBlockId(uuid(1));
const inline = parseInlineContentId(uuid(2));
const origin = { kind: "human", id: "author" } as const;
const codec = {
  encode: (value: string): string => value,
  decode: (value: string): string => value,
};
const compare = (a: string, b: string): -1 | 0 | 1 =>
  a < b ? -1 : a > b ? 1 : 0;
const factory = createAutomergeImmutableRunCarrierFactory(
  codec,
  { compare, comparePrimary: compare },
  { purePositionDecoder: true },
);

function seed() {
  const carrier = factory.create(root);
  carrier.applyChange({
    context: { actorId: "author", effectId: "seed" },
    inlineContents: [{ inlineContentId: inline, blockId: root }],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: inline,
        mediaType: "text/plain",
        text: "ab",
        origin,
      },
    ],
  });
  return carrier;
}
function nativeCommand() {
  const carrier = seed();
  const before = carrier.encode();
  carrier.applyChange({
    context: { actorId: "author", effectId: "insert" },
    payloads: [
      {
        kind: "insert-text",
        inlineContentId: inline,
        offset: 1,
        text: "X",
        origin,
      },
    ],
  });
  const previous = A.load<Raw>(before);
  const good = A.load<Raw>(carrier.encode());
  const changes = A.getChanges(previous, good);
  expect(changes).toHaveLength(1);
  return { before, previous, good, change: A.decodeChange(changes[0]!) };
}

describe("immutable-run native provenance", { timeout: 120_000 }, () => {
  for (const positions of [
    ["a", "b"],
    ["a", "a"],
    ["a", "b", "c"],
  ]) {
    it(`preserves ordered repeated placement replacements ${positions.join("/")} through reopen and merge`, () => {
      const carrier = seed();
      const baseline = carrier.encode();
      const blockId = parseBlockId(uuid(3));
      carrier.applyChange({
        context: { actorId: "author", effectId: "repeated-placement" },
        placements: positions.map((position) => ({
          blockId,
          placement: { position, depth: 1 },
        })),
      });
      const expected = { position: positions.at(-1)!, depth: 1 };
      expect(carrier.snapshot().placements.get(blockId)).toEqual(expected);
      const reopened = factory.load(carrier.encode());
      expect(reopened.snapshot().placements.get(blockId)).toEqual(expected);
      const receiver = factory.load(baseline);
      receiver.mergeEncoded(carrier.encode());
      expect(receiver.snapshot().placements.get(blockId)).toEqual(expected);
      expect(
        factory.load(receiver.encode()).snapshot().placements.get(blockId),
      ).toEqual(expected);
    });
  }

  it("rejects changed, missing and extra repeated placement writes atomically", () => {
    const carrier = seed();
    const baseline = carrier.encode();
    const blockId = parseBlockId(uuid(3));
    carrier.applyChange({
      context: { actorId: "author", effectId: "repeated-placement" },
      placements: ["a", "b"].map((position) => ({
        blockId,
        placement: { position, depth: 1 },
      })),
    });
    const before = A.load<Raw>(baseline);
    const after = A.load<Raw>(carrier.encode());
    const change = A.decodeChange(A.getChanges(before, after)[0]!);
    const registryId = A.getObjectId(after.placements)!;
    const writes = change.ops
      .map((operation, index) => ({ operation, index }))
      .filter(
        ({ operation }) =>
          operation.action === "makeMap" &&
          operation.obj === registryId &&
          operation.key === blockId,
      );
    expect(writes).toHaveLength(2);
    const firstId = `${change.startOp + writes[0]!.index}@${change.actor}`;
    const secondId = `${change.startOp + writes[1]!.index}@${change.actor}`;
    const badValue = change.ops.map((operation) =>
      operation.obj === firstId && operation.action === "set"
        ? {
            ...operation,
            key: encodeStructuralPlacement(
              { position: "forged", depth: 1 },
              codec,
            ),
          }
        : operation,
    );
    const noPredecessor = change.ops.map((operation, index) =>
      index === writes[1]!.index ? { ...operation, pred: [] } : operation,
    );
    const missingValue = change.ops.map((operation) =>
      operation.obj === secondId && operation.action === "set"
        ? { ...operation, value: false }
        : operation,
    );
    const extraIndex = change.startOp + change.ops.length;
    const extra = [
      ...change.ops,
      {
        action: "makeMap" as const,
        obj: registryId,
        key: blockId,
        insert: false,
        pred: [secondId],
      },
      {
        action: "set" as const,
        obj: `${extraIndex}@${change.actor}`,
        key: encodeStructuralPlacement({ position: "extra", depth: 1 }, codec),
        value: true,
        insert: false,
        pred: [],
      },
    ];
    for (const ops of [badValue, noPredecessor, missingValue, extra]) {
      const [altered] = A.applyChanges(A.clone(before), [
        A.encodeChange({ ...change, ops }),
      ]);
      const encoded = A.save(altered);
      expect(() => factory.load(encoded)).toThrow();
      const receiver = factory.load(baseline);
      const untouched = receiver.encode();
      expect(() => receiver.mergeEncoded(encoded)).toThrow();
      expect(receiver.encode()).toEqual(untouched);
    }
  });

  it("rejects surplus registry writes inside an otherwise valid command before adoption", () => {
    const fixture = nativeCommand();
    const nextObject = `${fixture.change.startOp + fixture.change.ops.length}@${fixture.change.actor}`;
    const altered = A.encodeChange({
      ...fixture.change,
      ops: [
        ...fixture.change.ops,
        {
          action: "makeMap",
          obj: A.getObjectId(fixture.good.placements)!,
          key: uuid(99),
          pred: [],
        },
        {
          action: "set",
          obj: nextObject,
          key: encodeStructuralPlacement({ position: "z", depth: 1 }, codec),
          value: true,
          pred: [],
        },
      ],
    });
    const [bad] = A.applyChanges(A.clone(fixture.previous), [altered]);
    const encoded = A.save(bad);
    expect(() => factory.load(encoded)).toThrow(/extra or missing/);
    const receiver = factory.load(fixture.before);
    const before = receiver.encode();
    expect(() => receiver.mergeEncoded(encoded)).toThrow();
    expect(receiver.encode()).toEqual(before);
    expect(receiver.snapshot().payloads.get(inline)).toMatchObject({
      text: "ab",
    });
  });

  it("rejects a semantic command split across two native changes", () => {
    const fixture = nativeCommand();
    const split = Math.floor(fixture.change.ops.length / 2);
    const first = A.encodeChange({
      ...fixture.change,
      ops: fixture.change.ops.slice(0, split),
    });
    const second = A.encodeChange({
      ...fixture.change,
      seq: fixture.change.seq + 1,
      startOp: fixture.change.startOp + split,
      deps: [A.decodeChange(first).hash],
      ops: fixture.change.ops.slice(split),
    });
    const [bad] = A.applyChanges(A.clone(fixture.previous), [first, second]);
    expect(() => factory.load(A.save(bad))).toThrow(
      /Rootless|one native change/,
    );
  });

  it("rejects a command whose actual native dependencies exceed its claimed accepted base", () => {
    const fixture = nativeCommand();
    const fork = factory.load(fixture.before);
    fork.applyChange({
      context: { actorId: "fork", effectId: "old-base" },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: inline,
          offset: 1,
          text: "Y",
          origin,
        },
      ],
    });
    const forkChanges = A.getChanges(
      A.load(fixture.before),
      A.load(fork.encode()),
    );
    const entries = A.decodeChange(forkChanges[0]!)
      .ops.filter(
        (op) =>
          op.action === "set" &&
          op.value === true &&
          /^[0-9a-f]{64}:\[/.test(op.key),
      )
      .map((op) => decodeRecordKeyV1(op.key, true));
    const manifest = entries.find((entry) => entry.record[3] === "manifest")!;
    // Public change supplies genuine newer native dependencies and overwrites
    // the observed pointer, while these committed records claim the older root.
    const bad = A.change(A.clone(fixture.good), (draft) => {
      for (const entry of entries) {
        let node = draft.records;
        for (const digit of entry.record[2].replaceAll("-", "")) {
          if (node[digit] === undefined) node[digit] = {};
          node = node[digit] as Record<string, unknown>;
        }
        node[entry.key] = true;
      }
      draft.semanticRoot = { [JSON.stringify(manifest.ref)]: true };
    });
    const receiver = factory.load(A.save(fixture.good));
    const before = receiver.encode();
    expect(() => receiver.mergeEncoded(A.save(bad))).toThrow(/rewinds/);
    expect(receiver.encode()).toEqual(before);
  });

  it("rejects unused forged capture material on load and merge atomically", () => {
    const carrier = seed();
    const token = carrier.captureHistoricalState();
    const raw = A.load<Raw>(carrier.encode());
    const observation = JSON.parse(Object.keys(raw.captures[token]!)[0]!) as [
      unknown,
      string,
      string[],
    ];
    for (const alter of ["text", "owner"] as const) {
      const material = JSON.parse(observation[1]) as {
        payloads: { value: { text: string; spans: { text: string }[] } }[];
        inlineContentOwners: [string, string][];
      };
      if (alter === "text") {
        material.payloads[0]!.value.text = "forged";
        material.payloads[0]!.value.spans[0]!.text = "forged";
      } else material.inlineContentOwners[0]![1] = uuid(99);
      const encoded = JSON.stringify([
        observation[0],
        JSON.stringify(material),
        A.getHeads(raw).sort(),
      ]);
      const bad = A.change(A.clone(raw), (draft) => {
        draft.captures[`unused-forged-${alter}`] = { [encoded]: true };
      });
      expect(() => factory.load(A.save(bad))).toThrow(
        /Capture material differs/,
      );
      const before = carrier.encode();
      expect(() => carrier.mergeEncoded(A.save(bad))).toThrow(
        /Capture material differs/,
      );
      expect(carrier.encode()).toEqual(before);
      expect(
        carrier.materializeHistoricalState(token).payloads.get(inline),
      ).toMatchObject({ text: "ab" });
    }
  });

  it("captures stateful Origin primitives once and ignores caller JSON hooks", () => {
    const carrier = seed();
    let reads = 0;
    const supplied = {
      id: "captured",
      get kind(): "automation" {
        reads++;
        return reads === 1 ? "automation" : ("invalid" as never);
      },
      toJSON() {
        throw new Error("Caller hook must not run.");
      },
    };
    carrier.applyChange({
      context: { actorId: "author", effectId: "origin" },
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: inline,
          mediaType: "text/plain",
          text: "replacement",
          origin: supplied,
        },
      ],
    });
    expect(reads).toBe(1);
    expect(
      factory.load(carrier.encode()).snapshot().payloads.get(inline),
    ).toMatchObject({
      text: "replacement",
      spans: [
        { text: "replacement", origin: { id: "captured", kind: "automation" } },
      ],
    });
  });

  it("reuses activation only until actual native publication changes the revision", () => {
    const carrier = seed();
    const native = Reflect.get(
      carrier,
      "native",
    ) as AutomergeImmutableRunDocument;
    const initial = native.activate();
    expect(native.activate()).toBe(initial);
    carrier.captureHistoricalState();
    const captured = native.activate();
    expect(captured).not.toBe(initial);
    expect(captured.root).toEqual(initial.root);
    expect(native.activate()).toBe(captured);
    carrier.applyChange({
      context: { actorId: "author", effectId: "after-capture" },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: inline,
          offset: 0,
          text: "!",
          origin,
        },
      ],
    });
    expect(native.activate().root).not.toEqual(captured.root);
  });

  it("authors following commands with the validated persisted source-unit setting", () => {
    const native = AutomergeImmutableRunDocument.create(root);
    const old = native.activate().entries[0]!;
    const replacement = commitRecordV1([
      ...old.record.slice(0, 10),
      [
        "genesis",
        root,
        ["settings", 1, 256],
        encodeEffectContext({ actorId: "bootstrap", effectId: "bootstrap" }),
      ],
    ]);
    const raw = A.load<Raw>(native.encode());
    const changes = A.getAllChanges(raw);
    expect(changes).toHaveLength(1);
    const bootstrap = A.decodeChange(changes[0]!);
    const bytes = A.encodeChange({
      ...bootstrap,
      ops: bootstrap.ops.map((op) =>
        op.key === old.key
          ? { ...op, key: replacement.key }
          : op.key === JSON.stringify(old.ref)
            ? { ...op, key: JSON.stringify(replacement.ref) }
            : op,
      ),
    });
    const [changed] = A.applyChanges(A.init<Raw>(), [bytes]);
    const admitted = AutomergeImmutableRunDocument.load(A.save(changed));
    expect(admitted.runSourceUnits).toBe(256);
    const carrier = factory.load(admitted.encode());
    carrier.applyChange({
      context: { actorId: "author", effectId: "configured-source" },
      inlineContents: [{ inlineContentId: inline, blockId: root }],
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: inline,
          mediaType: "text/plain",
          text: "x".repeat(400),
          origin,
        },
      ],
    });
    const reopened = factory.load(carrier.encode());
    expect(reopened.snapshot().payloads.get(inline)).toMatchObject({
      text: "x".repeat(400),
    });
  });

  it("preserves both rootless capture branches through native-head recovery and authored copy", () => {
    const bytes = seed().encode();
    const left = factory.load(bytes),
      right = factory.load(bytes);
    const tokens = [
      left.captureHistoricalState(),
      right.captureHistoricalState(),
    ];
    left.mergeEncoded(right.encode());
    expect(A.getHeads(A.load(left.encode()))).toHaveLength(1);
    for (const [index, token] of tokens.entries()) {
      left.applyChange({
        context: {
          actorId: "copy",
          effectId: String(index),
          source: { kind: "copy", reference: token },
        },
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: inline,
            offset: 0,
            text: "a",
            origin,
          },
        ],
      });
    }
    const reopened = factory.load(left.encode());
    expect(reopened.snapshot().payloads.get(inline)).toMatchObject({
      text: "aaab",
    });
    for (const token of tokens)
      expect(
        reopened.materializeHistoricalState(token).payloads.get(inline),
      ).toMatchObject({ text: "ab" });
  });
});
