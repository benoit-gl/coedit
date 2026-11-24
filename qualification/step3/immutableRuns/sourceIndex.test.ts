import { describe, expect, it } from "vitest";
import type {
  ImmutableRunGenerationProjectionV1,
  ImmutableRunReachedRunV1,
} from "./protocol.js";
import type { RecordRef } from "./record.js";
import { ImmutableRunSourceIndex } from "./sourceIndex.js";

const uuid = (n: number): string =>
  `c3000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const ref = (n: number): RecordRef => [uuid(n), "1".repeat(64)];
const origin = { kind: "human", id: "source" } as const;

// A detached lower-level index fixture. Protocol admission is separately tested.
function initial(
  source = "ab",
  hiddenPrefix = 0,
): ImmutableRunGenerationProjectionV1 {
  const run: ImmutableRunReachedRunV1 = {
    run: ref(2),
    source,
    origin,
    anchor: null,
    counter: 1n,
    replicaUuid: uuid(9),
  };
  const sourceUnits = Array.from({ length: source.length }, (_, offset) => ({
    run: run.run,
    offset,
    text: source.charAt(offset),
    origin,
    visible: offset >= hiddenPrefix,
  }));
  return {
    generation: ref(1),
    text: source.slice(hiddenPrefix),
    sourceUnits,
    units: sourceUnits.filter((unit) => unit.visible),
    runs: [run],
    erasures: hiddenPrefix
      ? [
          {
            erase: ref(8),
            intervals: [{ run: run.run, start: 0, end: hiddenPrefix }],
            counter: 2n,
            replicaUuid: uuid(9),
          },
        ]
      : [],
    spans: source.slice(hiddenPrefix)
      ? [{ text: source.slice(hiddenPrefix), origin }]
      : [],
    maximumCounter: hiddenPrefix ? 2n : 1n,
  };
}
function next(
  index: ImmutableRunSourceIndex,
  id: number,
  offset: number,
  source = "X",
): ImmutableRunReachedRunV1 {
  return {
    run: ref(id),
    source,
    origin,
    anchor: index.anchorAt(offset),
    counter: index.maximumCounter + 1n,
    replicaUuid: uuid(9),
  };
}
const text = (index: ImmutableRunSourceIndex): string =>
  index
    .read(0, index.length)
    .map((span) => span.text)
    .join("");

describe("immutable source-unit weighted AVL index", () => {
  it("prepares, reverts and adopts exact source edits without changing neighbour positions", () => {
    const index = new ImmutableRunSourceIndex(initial());
    const before = index.createPosition(1, "before"),
      after = index.createPosition(1, "after");
    const run = next(index, 3, 1);
    const staged = index.stage((preview) => {
      preview.insert(1, run);
      return text(preview);
    });
    expect(staged.value).toBe("aXb");
    expect(text(index)).toBe("ab");
    expect(index.maximumCounter).toBe(1n);
    staged.assertCurrent();
    staged.commit();
    expect(text(index)).toBe("aXb");
    expect(index.resolvePosition(before)).toBe(1);
    expect(index.resolvePosition(after)).toBe(2);
    const erased = index.stage((preview) => preview.erase(1, 2, 3n));
    expect(erased.value).toEqual([{ run: run.run, start: 0, end: 1 }]);
    expect(text(index)).toBe("aXb");
    erased.commit();
    expect(text(index)).toBe("ab");
    expect(index.sourceLength).toBe(3);
    expect(index.maximumCounter).toBe(3n);
    expect(index.resolvePosition(before)).toBe(1);
    expect(index.resolvePosition(after)).toBe(1);
    expect(
      index.resolvePosition({ ...after, generation: ref(99) }),
    ).toBeUndefined();
  });

  it("retains the observed gap when an after-affinity source is deleted and recreated", () => {
    const index = new ImmutableRunSourceIndex(initial("a!b"));
    const before = index.createPosition(1, "before");
    const after = index.createPosition(1, "after");
    index.stage((preview) => preview.erase(1, 2, 2n)).commit();
    expect(index.resolvePosition(before)).toBe(1);
    expect(index.resolvePosition(after)).toBe(1);
    index
      .stage((preview) => preview.insert(1, next(preview, 3, 1, "!")))
      .commit();
    expect(text(index)).toBe("a!b");
    expect(index.resolvePosition(before)).toBe(1);
    expect(index.resolvePosition(after)).toBe(1);
    index
      .stage((preview) => {
        preview.erase(1, 2, 4n);
        preview.insert(1, next(preview, 4, 1, "Y"));
      })
      .commit();
    expect(text(index)).toBe("aYb");
    expect(index.resolvePosition(after)).toBe(1);
    expect(
      index.resolvePosition({ ...after, left: { run: ref(99), end: 1 } }),
    ).toBeUndefined();
    const leading = new ImmutableRunSourceIndex(initial());
    const start = leading.createPosition(0, "after");
    leading
      .stage((preview) => {
        preview.erase(0, 1, 2n);
        preview.insert(0, next(preview, 3, 0, "Z"));
      })
      .commit();
    expect(leading.resolvePosition(start)).toBe(0);
    expect(
      leading.resolvePosition({ ...start, generation: ref(99) }),
    ).toBeUndefined();
  });

  it("restores parent links, maps, weights and counters when preparation throws", () => {
    const index = new ImmutableRunSourceIndex(initial());
    const position = index.createPosition(2, "before");
    expect(() =>
      index.stage((preview) => {
        preview.insert(1, next(preview, 3, 1));
        preview.erase(0, 2, 3n);
        throw new Error("injected before publication");
      }),
    ).toThrow("injected");
    expect(text(index)).toBe("ab");
    expect(index.sourceLength).toBe(2);
    expect(index.maximumCounter).toBe(1n);
    expect(index.resolvePosition(position)).toBe(2);
    const retry = index.stage((preview) =>
      preview.insert(1, next(preview, 3, 1)),
    );
    retry.commit();
    expect(text(index)).toBe("aXb");
    expect(() => retry.commit()).toThrow(/stale|consumed/);
  });

  it("refuses stale preparation and noncausal or mismatched anchors", () => {
    const index = new ImmutableRunSourceIndex(initial());
    const a = index.stage((preview) =>
      preview.insert(1, next(preview, 3, 1, "A")),
    );
    const b = index.stage((preview) =>
      preview.insert(1, next(preview, 4, 1, "B")),
    );
    a.commit();
    expect(() => b.commit()).toThrow(/stale/);
    expect(text(index)).toBe("aAb");
    expect(() =>
      index.stage((preview) =>
        preview.insert(1, { ...next(preview, 5, 1), counter: 1n }),
      ),
    ).toThrow(/causally/);
    expect(() =>
      index.stage((preview) =>
        preview.insert(1, { ...next(preview, 5, 1), anchor: null }),
      ),
    ).toThrow(/anchor/);
    expect(text(index)).toBe("aAb");
  });

  it("keeps repeated same-gap insertions balanced and orders later children first", () => {
    const index = new ImmutableRunSourceIndex(initial());
    let expected = "ab";
    for (let i = 0; i < 256; i++) {
      const inserted = String.fromCharCode(65 + (i % 26));
      const prepared = index.stage((preview) =>
        preview.insert(1, next(preview, i + 100, 1, inserted)),
      );
      prepared.commit();
      expected = "a" + inserted + expected.slice(1);
    }
    expect(text(index)).toBe(expected);
    // Structural AVL bound, not an experimental performance acceptance target.
    expect(index.height).toBeLessThanOrEqual(
      2 * Math.ceil(Math.log2(index.sourceLength + 1)),
    );
  });

  it("skips a long hidden prefix through aggregate visible weights", () => {
    const work = {
      pathVisits: 0,
      rebuiltUnits: 0,
      readUnits: 0,
      allocatedUnits: 0,
    };
    const index = new ImmutableRunSourceIndex(
      initial("a".repeat(10000), 9999),
      work,
    );
    work.pathVisits = 0;
    expect(index.read(0, 1)).toEqual([{ text: "a", origin }]);
    expect(work.readUnits).toBe(1);
    expect(work.pathVisits).toBeLessThanOrEqual(index.height + 1);
    const prepared = index.stage((preview) =>
      preview.insert(0, next(preview, 3, 0)),
    );
    prepared.commit();
    expect(text(index)).toBe("Xa");
    expect(work.rebuiltUnits).toBe(10000);
    expect(index.sourceLength).toBe(10001);
  });
});
