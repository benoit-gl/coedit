import { describe, expect, it } from "vitest";
import type { Contribution } from "../domain/types";
import { mergeContributionGroup, projectHistory } from "./historyProjection";

function contribution(revision: number, overrides: Partial<Contribution> = {}): Contribution {
  return {
    id: `c${revision}`,
    revision,
    contributorId: "author",
    contributorName: "Author",
    contributorKind: "human",
    sessionId: null,
    groupId: null,
    timestamp: `2026-01-01T00:00:${String(revision).padStart(2, "0")}.000Z`,
    operationType: "updateNode",
    affectedNodeIds: ["node"],
    payload: {},
    baseRevision: revision - 1,
    resultingHash: `hash-${revision}`,
    message: null,
    ...overrides,
  };
}

describe("history projection", () => {
  it("collapses only contiguous body checkpoints with the same non-null group ID", () => {
    const rows = projectHistory([
      contribution(8, { operationType: "updateBody", groupId: "g2" }),
      contribution(7, { operationType: "updateBody", groupId: "g2" }),
      contribution(6, { operationType: "updateNode", groupId: "g2" }),
      contribution(5, { operationType: "updateBody", groupId: "g2" }),
      contribution(4, { operationType: "updateBody", groupId: "g1" }),
      contribution(3, { operationType: "updateBody", groupId: "g1" }),
      contribution(2, { operationType: "updateBody", groupId: null }),
    ], false);

    expect(rows.loadedContributionCount).toBe(7);
    expect(rows.visibleHistoryRowCount).toBe(5);
    expect(rows.rows.map((row) => row.kind)).toEqual([
      "body-group", "contribution", "body-group", "body-group", "contribution",
    ]);
    const first = rows.rows[0];
    expect(first.kind).toBe("body-group");
    if (first.kind !== "body-group") throw new Error("Expected body group");
    expect(first.contributions.map((item) => item.revision)).toEqual([8, 7]);
    expect(first.canonical.revision).toBe(8);
    expect(first.oldestRevision).toBe(7);
    expect(first.newestRevision).toBe(8);
  });

  it("merges a page boundary into one group and labels the oldest loaded group partial", () => {
    const firstPage = [
      contribution(105, { operationType: "updateNode" }),
      contribution(104, { operationType: "updateBody", groupId: "long" }),
      contribution(103, { operationType: "updateBody", groupId: "long" }),
    ];
    const appended = [
      ...firstPage,
      contribution(102, { operationType: "updateBody", groupId: "long" }),
      contribution(101, { operationType: "updateBody", groupId: "long" }),
    ];
    const projection = projectHistory(appended, true);
    expect(projection.visibleHistoryRowCount).toBe(2);
    const group = projection.rows[1];
    expect(group.kind).toBe("body-group");
    if (group.kind !== "body-group") throw new Error("Expected body group");
    expect(group.contributions.map((item) => item.revision)).toEqual([104, 103, 102, 101]);
    expect(group.partial).toBe(true);
  });

  it("deduplicates raw rows and exact group expansion by contribution ID", () => {
    const loaded = [
      contribution(4, { operationType: "updateBody", groupId: "g" }),
      contribution(3, { operationType: "updateBody", groupId: "g" }),
    ];
    const projection = projectHistory([...loaded, loaded[1]], false);
    expect(projection.loadedContributionCount).toBe(2);
    expect(mergeContributionGroup(loaded, [
      loaded[1],
      contribution(2, { operationType: "updateBody", groupId: "g" }),
    ]).map((item) => item.revision)).toEqual([4, 3, 2]);
  });
});
