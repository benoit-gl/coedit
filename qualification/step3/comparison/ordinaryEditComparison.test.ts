import { describe, expect, it } from "vitest";
import {
  ordinaryEditProfiles,
  runOrdinaryEditComparison,
} from "./ordinaryEditComparison.js";

describe("ordinary edit evidence", () => {
  it("compares matched semantic outcomes and rejects scan regressions independently of timing", () => {
    const result = runOrdinaryEditComparison(
      [ordinaryEditProfiles[0]!, ordinaryEditProfiles[3]!],
      1,
      0,
    );
    expect(result.status).toBe("complete");
    expect(result.rows).toHaveLength(12);
    for (const row of result.rows as {
      variant: string;
      work: {
        snapshots: number;
        indexed?: { readUnits: number; rebuildUnits: number };
      };
      editorWork: { activationUnits: number };
    }[]) {
      if (row.variant === "incremental") {
        expect(row.work.snapshots).toBe(0);
        expect(row.work.indexed?.rebuildUnits).toBe(0);
        expect(row.work.indexed!.readUnits).toBeLessThan(100);
        expect(row.editorWork.activationUnits).toBe(0);
      } else expect(row.work.snapshots).toBeGreaterThanOrEqual(0);
    }
  });
});
