import { describe, expect, it } from "vitest";
import {
  parseBrowserReference,
  summarizeBrowserReference,
} from "./step3-browser-reference-report.mjs";

const profile = {
  method: { samples: 1 },
  shapes: [{ id: "small" }],
  operations: ["insert"],
  lifecyclePhases: ["reload"],
  edgeCases: ["lone-surrogate"],
};
const observations = ["yjs", "automerge"].flatMap((candidate) => [
  {
    kind: "editing",
    candidate,
    profile: "small",
    iteration: 0,
    operations: [{ name: "insert", driverOrDispatchMs: 3, publicationMs: 1 }],
  },
  {
    kind: "lifecycle",
    candidate,
    iteration: 0,
    observations: [{ name: "reload" }],
  },
  {
    kind: "edge",
    candidate,
    case: "lone-surrogate",
    outcome: "atomic-refusal",
  },
]);
const log = (rows) =>
  rows
    .map((row) => `STEP3_BROWSER_REFERENCE_ROW=${JSON.stringify(row)}`)
    .join("\n");

describe("browser/reference evidence completeness", () => {
  it("accepts a complete manifest and summarizes only editing intervals", () => {
    const result = parseBrowserReference(log(observations), profile);
    expect(result.errors).toEqual([]);
    expect(result.expectedRows).toBe(6);
    expect(summarizeBrowserReference(result.rows)).toEqual(
      ["yjs", "automerge"].map((candidate) => ({
        candidate,
        profile: "small",
        operation: "insert",
        sampleCount: 1,
        medianDriverOrDispatchMs: 3,
        medianPublicationMs: 1,
      })),
    );
  });

  it("cannot replace a missing observation with a duplicate of equal row count", () => {
    const corrupt = [...observations];
    corrupt[5] = corrupt[2];
    const result = parseBrowserReference(log(corrupt), profile);
    expect(result.rows).toHaveLength(6);
    expect(result.errors.join("\n")).toMatch(/duplicate.*Missing/su);
  });

  it.each([
    {
      operations: [
        { name: "insert", driverOrDispatchMs: null, publicationMs: 1 },
      ],
    },
    {
      operations: [
        { name: "insert", driverOrDispatchMs: 1, publicationMs: -1 },
      ],
    },
    { operations: [] },
  ])("rejects incomplete or unusable timing observations", (change) => {
    const corrupt = [
      { ...observations[0], ...change },
      ...observations.slice(1),
    ];
    expect(
      parseBrowserReference(log(corrupt), profile).errors.length,
    ).toBeGreaterThan(0);
  });

  it("retains earlier rows when later JSON or lifecycle output is corrupt", () => {
    const corrupt = [...observations];
    corrupt[4] = { ...corrupt[4], observations: [] };
    const result = parseBrowserReference(
      log(corrupt) + '\nSTEP3_BROWSER_REFERENCE_ROW={"unfinished":}',
      profile,
    );
    expect(result.rows).toHaveLength(6);
    expect(result.errors.join("\n")).toMatch(/lifecycle/u);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});
