import { describe, expect, it } from "vitest";
import { runSnapshotComparison } from "./snapshotComparison.js";

describe("snapshot comparison", () => {
  it("checks paired projections and attributed effects and returns sample metadata", () => {
    const result = runSnapshotComparison(1, 2, 2);
    expect(result).toMatchObject({ samples: 1, iterations: 2, warmup: 2 });
    expect(result.profiles).toHaveLength(13);
    expect(
      result.profiles.find(
        (profile) => profile.name === "target-origin-spans-64",
      ),
    ).toMatchObject({ targetLength: 256, unrelatedCount: 0, targetSpans: 64 });
    expect(
      result.profiles.find((profile) => profile.name === "live-blocks-20")
        ?.blockCount,
    ).toBe(20);
    for (const count of [20, 100]) {
      expect(
        result.profiles.find((p) => p.name === `blocks-only-${count}`),
      ).toMatchObject({
        blockCount: count,
        unrelatedCount: 0,
        historyEdits: 0,
      });
    }
    for (const count of [100, 500]) {
      expect(
        result.profiles.find((p) => p.name === `target-history-${count}`),
      ).toMatchObject({
        blockCount: 0,
        unrelatedCount: 0,
        historyEdits: count,
      });
    }
    expect(result.rows).toHaveLength(result.profiles.length * 4);
    for (const candidate of ["yjs", "automerge"]) {
      const seedSizes = new Map(
        (
          result.rows as Array<{
            candidate: string;
            variant: string;
            profile: { name: string };
            seedEncodedBytes: number;
          }>
        )
          .filter(
            (row) => row.candidate === candidate && row.variant === "snapshot",
          )
          .map((row) => [row.profile.name, row.seedEncodedBytes]),
      );
      expect(seedSizes.get("target-history-500")).toBeGreaterThan(
        seedSizes.get("target-history-100")!,
      );
      for (const profile of result.profiles) {
        const rows = (
          result.rows as Array<{
            candidate: string;
            variant: string;
            profile: { name: string };
            effectCount: number;
            transitions: Record<
              string,
              {
                transitionMs: number[];
                nextEditMs: number[];
                transitionSummary: { medianMs: number };
                nextEditSummary: { medianMs: number };
              }
            >;
            loadMs: number[];
            loadSummary: { medianMs: number };
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
          expect(Object.keys(row.transitions)).toEqual([
            "merge",
            "restore",
            "fallback-replace",
          ]);
          for (const transition of Object.values(row.transitions)) {
            expect(transition.transitionMs).toHaveLength(1);
            expect(transition.nextEditMs).toHaveLength(1);
            expect(transition.transitionMs[0]).toBeGreaterThanOrEqual(0);
            expect(transition.nextEditMs[0]).toBeGreaterThanOrEqual(0);
            expect(transition.transitionSummary.medianMs).toBe(
              transition.transitionMs[0],
            );
            expect(transition.nextEditSummary.medianMs).toBe(
              transition.nextEditMs[0],
            );
          }
          expect(row.seedEncodedBytes).toBeGreaterThan(0);
          expect(row.loadMs).toHaveLength(1);
          expect(row.loadMs[0]).toBeGreaterThanOrEqual(0);
          expect(row.loadSummary.medianMs).toBe(row.loadMs[0]);
          expect(row.coldFirstEditMs).toHaveLength(1);
          expect(row.steadyBatchMeanMsPerEdit).toHaveLength(1);
          expect(row.coldFirstEditMs[0]).toBeGreaterThanOrEqual(0);
          expect(row.steadyBatchMeanMsPerEdit[0]).toBeGreaterThanOrEqual(0);
        }
      }
    }
  }, 60_000);
});
