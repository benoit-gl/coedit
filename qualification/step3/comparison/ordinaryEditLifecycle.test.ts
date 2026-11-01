import { expect, it } from "vitest";
import { runOrdinaryEditLifecycle } from "./ordinaryEditLifecycle.js";

it("records matched lifecycle outcomes, localized warm edits and decoder fallback", () => {
  const result = runOrdinaryEditLifecycle();
  expect(result.status).toBe("complete");
  const rows = result.rows as {
    candidate: string;
    variant: string;
    phases: Record<
      string,
      {
        first: {
          work: { snapshots: number; indexed?: { rebuildUnits: number } };
        };
        warm: {
          work: { snapshots: number; indexed?: { rebuildUnits: number } };
        };
      }
    >;
    transitions: Record<
      string,
      { work?: { indexed?: { rebuildUnits: number } }; available?: boolean }
    >;
  }[];
  expect(rows).toHaveLength(6);
  for (const row of rows) {
    expect(Object.keys(row.phases)).toEqual([
      "normal",
      "afterMerge",
      "afterRestore",
      "afterReplacement",
      "afterRejectionRecovery",
    ]);
    if (row.variant === "incremental") {
      for (const phase of Object.values(row.phases)) {
        expect(phase.first.work.snapshots).toBe(0);
        expect(phase.warm.work.snapshots).toBe(0);
        expect(phase.first.work.indexed?.rebuildUnits).toBe(0);
        expect(phase.warm.work.indexed?.rebuildUnits).toBe(0);
      }
      expect(row.transitions.recovery?.available).toBe(true);
      expect(
        row.transitions.recovery?.work?.indexed?.rebuildUnits,
      ).toBeGreaterThan(0);
    }
  }
  const fallback = result.fallback as {
    status: string;
    activationAvailable: boolean;
    snapshots: number;
    placementDecodes: number;
  }[];
  expect(fallback).toHaveLength(2);
  for (const row of fallback) {
    expect(row.status).toBe("ineligible");
    expect(row.activationAvailable).toBe(false);
    expect(row.snapshots).toBeGreaterThan(0);
    expect(row.placementDecodes).toBeGreaterThan(0);
  }
});
