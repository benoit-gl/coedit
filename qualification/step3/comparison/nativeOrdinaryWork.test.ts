import { describe, expect, it } from "vitest";
import { runNativeOrdinaryWork } from "./nativeOrdinaryWork.js";

describe("native ordinary work evidence", () => {
  it("observes Automerge copying maps containing unrelated payload identities", () => {
    const result = runNativeOrdinaryWork();
    expect(result.versions).toEqual({ automerge: "3.4.1", yjs: "13.6.32" });
    const rows = result.automerge as {
      unrelatedCount: number;
      historyEdits: number;
      copies: {
        keys: number;
        targetKey: boolean;
        unrelatedKeys: number;
      }[];
    }[];
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.copies.length).toBeGreaterThan(0);
      if (row.unrelatedCount > 0)
        expect(
          row.copies.some(
            (copy) =>
              copy.targetKey &&
              copy.unrelatedKeys === row.unrelatedCount &&
              copy.keys >= row.unrelatedCount + 1,
          ),
        ).toBe(true);
    }
  });
  it("observes attributed Yjs insertion traversing a fragmented target prefix", () => {
    const result = runNativeOrdinaryWork();
    const yjs = result.yjs as {
      rows: {
        fragmentCount: number;
        offset: number;
        existingItems: number;
        uniqueItemsRead: number;
        rightReads: number;
      }[];
    };
    expect(yjs.rows).toHaveLength(12);
    const end = yjs.rows.filter((row) => row.offset === 1024);
    const first = end.find((row) => row.fragmentCount === 1)!;
    const last = end.find((row) => row.fragmentCount === 1024)!;
    expect(last.uniqueItemsRead).toBeGreaterThan(first.uniqueItemsRead);
    expect(last.uniqueItemsRead).toBeGreaterThanOrEqual(1024);
    expect(last.rightReads).toBeGreaterThanOrEqual(last.uniqueItemsRead);
  });
});
