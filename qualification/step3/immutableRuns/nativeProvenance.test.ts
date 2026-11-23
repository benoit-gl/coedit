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
import {
  validateImmutableRunCommandsV1,
  validateImmutableRunCommandsReferenceV1,
} from "./commands.js";
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
  it("keeps accepted native outputs immutable across repeated validation", () => {
    const carrier = seed();
    const block = parseBlockId(uuid(3));
    const opaque = parseInlineContentId(uuid(4));
    carrier.applyChange({
      context: { actorId: "author", effectId: "outputs" },
      placements: ["a", "b"].map((position) => ({
        blockId: block,
        placement: { depth: 1, position },
      })),
      inlineContents: [{ inlineContentId: opaque, blockId: block }],
      payloads: [
        {
          kind: "replace-opaque",
          inlineContentId: opaque,
          mediaType: "application/octet-stream",
          bytes: new Uint8Array([1, 2, 3]),
          origin,
        },
      ],
    });
    const { provider, protocol } = AutomergeImmutableRunDocument.load(
      carrier.encode(),
    ).activate();
    const manifests = protocol.canonicalEntries.filter(
      (entry) => entry.record[3] === "manifest",
    );
    // A shared cached value must not let any caller alter later validation.
    const checkFrozen = (value: unknown): void => {
      if (!Array.isArray(value)) return;
      expect(Object.isFrozen(value)).toBe(true);
      expect(Reflect.set(value, "0", "forged")).toBe(false);
      for (const item of value) checkFrozen(item);
    };
    const before = manifests.map((entry) => {
      const outputs = provider.authoredOutputs(entry.ref);
      expect(Object.isFrozen(outputs)).toBe(true);
      expect(Reflect.set(outputs, "structural", [])).toBe(false);
      checkFrozen(outputs.structural);
      checkFrozen(outputs.descriptors);
      return outputs;
    });
    const command = manifests.find(
      (entry) => entry.record[7]?.[1] === "outputs",
    )!;
    const commandOutputs = provider.authoredOutputs(command.ref);
    expect(commandOutputs.structural).toEqual([
      [
        "placement",
        block,
        encodeStructuralPlacement({ depth: 1, position: "a" }, codec),
      ],
      [
        "placement",
        block,
        encodeStructuralPlacement({ depth: 1, position: "b" }, codec),
      ],
      ["inline-create", opaque, block],
    ]);
    expect(commandOutputs.descriptors[0]?.[0]).toBe("opaque");
    const reference = validateImmutableRunCommandsReferenceV1(
      protocol,
      provider,
    );
    expect(
      validateImmutableRunCommandsV1(protocol, provider).commandRoots,
    ).toEqual(reference.commandRoots);
    expect(
      manifests.map((entry) => provider.authoredOutputs(entry.ref)),
    ).toEqual(before);
    expect(() => provider.authoredOutputs([uuid(99), "missing"])).toThrow();
    expect(() => provider.authoredBase(protocol.genesisRoot)).toThrow();
    expect(() =>
      provider.resolveReferent("missing", protocol.genesisRoot),
    ).toThrow();
  });

  it("retains exact capture frontiers and old provider views after new native work", () => {
    const carrier = seed();
    const native = Reflect.get(
      carrier,
      "native",
    ) as AutomergeImmutableRunDocument;
    const initial = native.activate();
    const observed = carrier.captureHistoricalState();
    const captureSibling = factory.load(carrier.encode());
    carrier.applyChange({
      context: {
        actorId: "copy",
        effectId: "observed-capture",
        source: { kind: "copy", reference: observed },
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
    const future = carrier.captureHistoricalState();
    // This later token has the same semantic root as the command's base but
    // was never present at the command's actual native dependency frontier.
    const sameRootFuture = captureSibling.captureHistoricalState();
    carrier.mergeEncoded(captureSibling.encode());
    const accepted = native.activate();
    const manifest = accepted.protocol.canonicalEntries.find(
      (entry) =>
        entry.record[3] === "manifest" &&
        entry.record[7]?.[1] === "observed-capture",
    )!;
    const expected = {
      kind: "capture",
      root: initial.root,
      material: expect.any(String),
    };
    expect(accepted.provider.authoredBase(manifest.ref).semanticRoot).toEqual(
      initial.root,
    );
    expect(accepted.provider.resolveReferent(observed, manifest.ref)).toEqual(
      expected,
    );
    expect(
      accepted.provider.resolveReferent(future, manifest.ref),
    ).toBeUndefined();
    expect(
      accepted.provider.resolveReferent(sameRootFuture, manifest.ref),
    ).toBeUndefined();
    expect(accepted.provider.captureRoot(future)).toEqual(accepted.root);
    expect(initial.provider.captureRoot(observed)).toBeUndefined();
    const descriptor = initial.provider.view(initial.root).descriptorOf(inline);

    carrier.restoreHistoricalState(observed, {
      actorId: "history",
      effectId: "restore",
    });
    const sibling = factory.load(carrier.encode());
    sibling.applyChange({
      context: { actorId: "fork", effectId: "after-restore" },
    });
    carrier.mergeEncoded(sibling.encode());
    expect(native.activate()).not.toBe(accepted);
    expect(initial.provider.view(initial.root).descriptorOf(inline)).toEqual(
      descriptor,
    );
    expect(accepted.provider.resolveReferent(observed, manifest.ref)).toEqual(
      expected,
    );
    expect(
      accepted.provider.resolveReferent(future, manifest.ref),
    ).toBeUndefined();
    expect(
      accepted.provider.resolveReferent(sameRootFuture, manifest.ref),
    ).toBeUndefined();
    for (const { protocol, provider } of [initial, accepted]) {
      const reference = validateImmutableRunCommandsReferenceV1(
        protocol,
        provider,
      );
      expect(
        validateImmutableRunCommandsV1(protocol, provider).commandRoots,
      ).toEqual(reference.commandRoots);
    }
  });

  it("matches independent command replay across fork, join, restore and generation replacement", () => {
    const carrier = seed();
    const captured = carrier.captureHistoricalState();
    let effect = 0;
    const edit = (target: typeof carrier, actorId: string): void => {
      target.applyChange({
        context: { actorId, effectId: `cursor-${effect++}` },
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
    };
    const check = (): void => {
      const { protocol, provider } = AutomergeImmutableRunDocument.load(
        carrier.encode(),
      ).activate();
      const reference = validateImmutableRunCommandsReferenceV1(
        protocol,
        provider,
      );
      expect(
        validateImmutableRunCommandsV1(
          [...protocol.canonicalEntries].reverse(),
          provider,
        ).commandRoots,
      ).toEqual(reference.commandRoots);
      expect(factory.load(carrier.encode()).snapshot()).toEqual(
        carrier.snapshot(),
      );
    };
    edit(carrier, "left");
    const sibling = factory.load(carrier.encode());
    edit(carrier, "left");
    edit(sibling, "right");
    carrier.mergeEncoded(sibling.encode());
    edit(carrier, "joined");
    check();
    carrier.restoreHistoricalState(captured, {
      actorId: "history",
      effectId: "cursor-restore",
    });
    edit(carrier, "restored");
    check();
    carrier.applyChange({
      context: { actorId: "replacement", effectId: "cursor-replace" },
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: inline,
          mediaType: "text/plain",
          text: "new😀",
          origin,
        },
      ],
    });
    edit(carrier, "replacement");
    edit(carrier, "replacement");
    check();
  });

  it("matches reference liveness at historical roots, concurrent joins and restore", () => {
    const block = parseBlockId(uuid(3));
    const carrier = factory.create(root);
    const empty = carrier.captureHistoricalState();
    carrier.applyChange({
      context: { actorId: "author", effectId: "create" },
      placements: [{ blockId: block, placement: { depth: 1, position: "a" } }],
      inlineContents: [{ inlineContentId: inline, blockId: block }],
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
    const editing = factory.load(carrier.encode());
    carrier.applyChange({
      context: { actorId: "deleter", effectId: "retire" },
      deleteBlockIds: [block],
    });
    const retired = AutomergeImmutableRunDocument.load(
      carrier.encode(),
    ).activate();
    expect(retired.provider.view(retired.root).isBlockLive(block)).toBe(false);
    editing.applyChange({
      context: { actorId: "editor", effectId: "concurrent-live" },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: inline,
          offset: 1,
          text: "!",
          origin,
        },
      ],
    });
    carrier.mergeEncoded(editing.encode());
    const joined = AutomergeImmutableRunDocument.load(
      carrier.encode(),
    ).activate();
    expect(joined.provider.view(joined.root).isBlockLive(block)).toBe(true);
    carrier.restoreHistoricalState(empty, {
      actorId: "author",
      effectId: "restore-empty",
    });
    const restored = AutomergeImmutableRunDocument.load(
      carrier.encode(),
    ).activate();
    expect(restored.provider.view(restored.root).isInlineLive(inline)).toBe(
      false,
    );
    expect(restored.provider.view(restored.root).isBlockLive(block)).toBe(
      false,
    );

    const { protocol, provider } = restored;
    const blocks = [root, block, parseBlockId(inline), parseBlockId(uuid(99))];
    const inlines = [
      inline,
      parseInlineContentId(block),
      parseInlineContentId(root),
      parseInlineContentId(uuid(99)),
    ];
    for (const entry of protocol.canonicalEntries) {
      if (entry.record[3] !== "manifest" && entry.record[3] !== "join")
        continue;
      const view = provider.view(entry.ref);
      for (const id of blocks)
        expect(view.isBlockLive(id)).toBe(
          id === root || protocol.isEntityLive(entry.ref, "block", id),
        );
      for (const id of inlines)
        expect(view.isInlineLive(id)).toBe(
          protocol.isEntityLive(entry.ref, "inline", id),
        );
    }
    const bootstrap = provider.view(protocol.genesisRoot);
    expect(protocol.isEntityLive(protocol.genesisRoot, "block", root)).toBe(
      false,
    );
    expect(bootstrap.isBlockLive(root)).toBe(true);
  });

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
