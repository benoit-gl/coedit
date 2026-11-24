import { describe, expect, it } from "vitest";
import * as A from "@automerge/automerge";
import { AutomergeRecordPrimitive } from "./nativeRecordStore.js";
import { commitRecordV1 } from "./record.js";

const uuid = (n: number): string =>
  `c1000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const entry = (n: number, actor = "actor") =>
  commitRecordV1([
    "coedit-step3-record",
    1,
    uuid(n),
    "live",
    ["block", uuid(1)],
    null,
    null,
    [actor, "effect"],
    uuid(2),
    ["payload", 0, n],
    [],
  ]);

function forkPair() {
  const genesis = AutomergeRecordPrimitive.create().encode();
  return [
    AutomergeRecordPrimitive.load(genesis),
    AutomergeRecordPrimitive.load(genesis),
  ] as const;
}

describe("Automerge immutable-record native entry primitive", () => {
  it("retains records under losing root and nested native prefixes through merge/reopen", () => {
    const [left, right] = forkPair();
    left.append([entry(100)]);
    right.append([entry(101)]);
    const rightPartition = right.encode();
    right.mergeEncoded(left.encode());
    left.mergeEncoded(rightPartition);
    expect(
      left
        .entries()
        .map((x) => x.key)
        .sort(),
    ).toEqual(
      right
        .entries()
        .map((x) => x.key)
        .sort(),
    );
    const nestedLeft = AutomergeRecordPrimitive.load(left.encode());
    const nestedRight = AutomergeRecordPrimitive.load(left.encode());
    nestedLeft.append([entry(128)]);
    nestedRight.append([entry(129)]);
    nestedLeft.mergeEncoded(nestedRight.encode());
    const reopened = AutomergeRecordPrimitive.load(nestedLeft.encode());
    expect(
      reopened
        .entries()
        .map((x) => x.key)
        .sort(),
    ).toEqual([100, 101, 128, 129].map((n) => entry(n).key).sort());
    expect(A.getHeads(A.load(reopened.encode()))).toHaveLength(1);
    reopened.append([entry(130)]);
    expect(AutomergeRecordPrimitive.load(reopened.encode()).size).toBe(5);
  });

  it("deduplicates identical bodies without publication and refuses equivocation atomically", () => {
    const store = AutomergeRecordPrimitive.create();
    store.append([entry(100), entry(100)]);
    const accepted = store.encode();
    store.append([entry(100)]);
    expect(store.encode()).toEqual(accepted);
    expect(() =>
      store.append([entry(101), entry(100, "different actor")]),
    ).toThrow(/Conflicting/);
    expect(store.encode()).toEqual(accepted);
    expect(store.size).toBe(1);
  });

  it("rejects conflicting concurrent UUIDs without changing the accepted side", () => {
    const [left, right] = forkPair();
    left.append([entry(100)]);
    right.append([entry(100, "conflicting")]);
    const before = left.encode();
    expect(() => left.mergeEncoded(right.encode())).toThrow(
      /conflicting bodies/,
    );
    expect(left.encode()).toEqual(before);
  });

  it("rejects a foreign lineage, malformed marker and deletion of accepted data", () => {
    const store = AutomergeRecordPrimitive.create();
    store.append([entry(100)]);
    const before = store.encode();
    expect(() =>
      store.mergeEncoded(AutomergeRecordPrimitive.create().encode()),
    ).toThrow(/lineage/);
    expect(store.encode()).toEqual(before);
    type State = { records: Record<string, unknown> };
    const changed = (remove: boolean): Uint8Array => {
      let raw = A.load<State>(before);
      raw = A.change(raw, (draft) => {
        let node: Record<string, unknown> = draft.records;
        for (const digit of uuid(100).replaceAll("-", "")) {
          const value = node[digit];
          if (
            value === null ||
            typeof value !== "object" ||
            Array.isArray(value)
          )
            throw Error("fixture missing native prefix");
          node = value as Record<string, unknown>;
        }
        if (remove) delete node[entry(100).key];
        else node[entry(100).key] = false;
      });
      return A.save(raw);
    };
    expect(() => store.mergeEncoded(changed(false))).toThrow();
    expect(() => store.mergeEncoded(changed(true))).toThrow(
      /removed or changed/,
    );
    expect(store.encode()).toEqual(before);
  });
});
