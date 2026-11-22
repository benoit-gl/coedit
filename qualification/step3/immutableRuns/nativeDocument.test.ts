import * as A from "@automerge/automerge";
import { describe, expect, it } from "vitest";

import { parseBlockId } from "../../../src/domain/index.js";
import {
  prepareImmutableRunApplyCommandV1,
  type ImmutableRunUuidSourceV1,
  type PreparedImmutableRunCommandV1,
} from "./commands.js";
import { AutomergeImmutableRunDocument } from "./nativeDocument.js";
import { commitRecordV1 } from "./record.js";

const uuid = (value: number): string =>
  `e7000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;

class Uuids implements ImmutableRunUuidSourceV1 {
  public constructor(private next = 100) {}

  public nextUuid(): string {
    return uuid(this.next++);
  }
}

const codec = Object.freeze({
  encode(value: string): string {
    return value;
  },
  decode(value: string): string {
    return value;
  },
});

interface NativeFixture extends Record<string, unknown> {
  records: Record<string, unknown>;
}

function bucketAt(
  records: Record<string, unknown>,
  path: string,
): Record<string, unknown> {
  let node = records;
  for (const digit of path) {
    const next = node[digit];
    if (next === null || typeof next !== "object" || Array.isArray(next))
      throw new TypeError("Fixture record path is not a map.");
    node = next as Record<string, unknown>;
  }
  return node;
}

describe("immutable-run native document publication", () => {
  it("rejects a non-true marker retained behind a winning true marker", () => {
    const native = AutomergeImmutableRunDocument.create(parseBlockId(uuid(1)));
    const entry = native.activate().entries[0]!;
    const path = entry.record[2].replaceAll("-", "");
    const base = A.load<NativeFixture>(native.encode());
    let left = A.clone(base);
    left = A.change(left, (draft) => {
      bucketAt(draft.records, path)[entry.key] = false;
    });
    left = A.change(left, (draft) => {
      bucketAt(draft.records, path)[entry.key] = true;
    });
    const right = A.change(A.clone(base), (draft) => {
      bucketAt(draft.records, path)[entry.key] = false;
    });
    const merged = A.merge(left, right);
    const bucket = bucketAt(merged.records, path);
    expect(bucket[entry.key]).toBe(true);
    expect(Object.values(A.getConflicts(bucket, entry.key)!)).toContain(false);
    expect(() => AutomergeImmutableRunDocument.load(A.save(merged))).toThrow(
      /marker/i,
    );
  });

  it("rejects a malformed losing prefix even when the winning subtree is valid", () => {
    const native = AutomergeImmutableRunDocument.create(parseBlockId(uuid(1)));
    const entry = native.activate().entries[0]!;
    const digit = entry.record[2][0]!;
    const base = A.load<NativeFixture>(native.encode());
    const validSubtree = A.toJS(base).records[digit];
    let left = A.clone(base);
    left = A.change(left, (draft) => {
      draft.records[digit] = false;
    });
    left = A.change(left, (draft) => {
      draft.records[digit] = validSubtree;
    });
    const right = A.change(A.clone(base), (draft) => {
      draft.records[digit] = false;
    });
    const merged = A.merge(left, right);
    expect(typeof merged.records[digit]).toBe("object");
    expect(Object.values(A.getConflicts(merged.records, digit)!)).toContain(
      false,
    );
    expect(() => AutomergeImmutableRunDocument.load(A.save(merged))).toThrow(
      /map/i,
    );
  });
  it("rejects a conflicting retained UUID before any native write", () => {
    const native = AutomergeImmutableRunDocument.create(parseBlockId(uuid(1)));
    const firstActivation = native.activate();
    const first = prepareImmutableRunApplyCommandV1({
      state: {
        view: firstActivation.provider.view(firstActivation.root),
        replicaUuid: uuid(10),
        runSourceUnits: native.runSourceUnits,
        sourceIndexes: new Map(),
      },
      change: {},
      context: { actorId: "alice", effectId: "first" },
      positionCodec: codec,
      uuids: new Uuids(100),
    });
    native.publish(first);

    const secondActivation = native.activate();
    const second = prepareImmutableRunApplyCommandV1({
      state: {
        view: secondActivation.provider.view(secondActivation.root),
        replicaUuid: uuid(11),
        runSourceUnits: native.runSourceUnits,
        sourceIndexes: new Map(),
      },
      change: {},
      context: { actorId: "alice", effectId: "second" },
      positionCodec: codec,
      uuids: new Uuids(200),
    });
    const firstContext = first.entries.find(
      (entry) => entry.record[3] === "context",
    )!;
    const secondContext = second.entries.find(
      (entry) => entry.record[3] === "context",
    )!;
    const conflicting = commitRecordV1([
      ...secondContext.record.slice(0, 2),
      firstContext.record[2],
      ...secondContext.record.slice(3),
    ]);
    const forged: PreparedImmutableRunCommandV1 = {
      ...second,
      entries: second.entries.map((entry) =>
        entry === secondContext ? conflicting : entry,
      ),
    };
    const before = native.encode();
    expect(() => native.publish(forged)).toThrow(/UUID equivocation/);
    expect(native.encode()).toEqual(before);
  });
});
