import { describe, expect, it } from "vitest";
import { runSnapshotComparison } from "./snapshotComparison.js";

describe("snapshot comparison", () => {
  it("checks paired projections and attributed effects and returns sample metadata", () => {
    const result = runSnapshotComparison(1, 2, 2);
    expect(result).toMatchObject({ samples: 1, iterations: 2, warmup: 2 });
    expect(result.profiles).toHaveLength(7);
    expect(result.rows).toHaveLength(result.profiles.length * 4);
    for (const candidate of ["yjs", "automerge"]) {
      for (const profile of result.profiles) {
        const rows = (
          result.rows as Array<{
            candidate: string;
            variant: string;
            profile: { name: string };
            effectCount: number;
            coldFirstEditMs: number[];
            steadyBatchMeanMsPerEdit: number[];
            seedEncodedBytes: number;
          }>
        ).filter(
          (row) =>
            row.candidate === candidate && row.profile.name === profile.name,
        );
        expect(rows.map((row) => row.variant)).toEqual([
          "snapshot",
          "targeted",
        ]);
        for (const row of rows) {
          expect(row.effectCount).toBe(4);
          expect(row.seedEncodedBytes).toBeGreaterThan(0);
          expect(row.coldFirstEditMs).toHaveLength(1);
          expect(row.steadyBatchMeanMsPerEdit).toHaveLength(1);
          expect(row.coldFirstEditMs[0]).toBeGreaterThanOrEqual(0);
          expect(row.steadyBatchMeanMsPerEdit[0]).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
