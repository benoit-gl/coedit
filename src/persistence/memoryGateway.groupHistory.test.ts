import { describe, expect, it } from "vitest";
import type { Contributor } from "../domain/types";
import { MemoryDocumentGateway } from "./memoryGateway";

const contributor: Contributor = {
  id: "author",
  displayName: "Author",
  kind: "human",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const body = {
  type: "updateBody" as const,
  nodeId: "node",
  bodyHtml: "<p>text</p>",
  yjsUpdate: "",
  yjsState: "",
};

describe("memory contribution group queries", () => {
  it("returns exact group checkpoints newest-first, independently of ordinary history filters", async () => {
    const gateway = new MemoryDocumentGateway();
    await gateway.createDocument("Draft", contributor);
    await gateway.applyOperation(
      { type: "createNode", node: { id: "node", title: "Node" } },
      { contributorId: "author", sessionId: null, groupId: null, message: "create" },
    );
    await gateway.applyOperation(body, {
      contributorId: "author", sessionId: null, groupId: "episode-a", message: "Writing contribution",
    });
    await gateway.applyOperation(body, {
      contributorId: "author", sessionId: null, groupId: "episode-a", message: "Writing contribution",
    });
    await gateway.applyOperation(
      { type: "updateNode", nodeId: "node", changes: { title: "Boundary" } },
      { contributorId: "author", sessionId: null, groupId: null, message: "boundary" },
    );
    await gateway.applyOperation(body, {
      contributorId: "author", sessionId: null, groupId: "episode-b", message: "Writing contribution",
    });

    expect(gateway.contributionGroupQueryCapability.kind).toBe("available");
    const page = await gateway.listContributionGroup({ groupId: "episode-a", limit: 10 });
    expect(page.items.map((item) => item.revision)).toEqual([3, 2]);
    expect(page.items.every((item) => item.groupId === "episode-a" && item.operationType === "updateBody")).toBe(true);
    expect(page.hasMore).toBe(false);
  });

  it("pages a long exact group with an exclusive revision cursor and rejects blank IDs", async () => {
    const gateway = new MemoryDocumentGateway();
    await gateway.createDocument("Draft", contributor);
    await gateway.applyOperation(
      { type: "createNode", node: { id: "node", title: "Node" } },
      { contributorId: "author", sessionId: null, groupId: null, message: "create" },
    );
    for (let index = 0; index < 5; index += 1) {
      await gateway.applyOperation(body, {
        contributorId: "author", sessionId: null, groupId: "long", message: "Writing contribution",
      });
    }

    const first = await gateway.listContributionGroup({ groupId: "long", limit: 2 });
    expect(first.items.map((item) => item.revision)).toEqual([6, 5]);
    expect(first).toMatchObject({ hasMore: true, nextBeforeRevision: 5 });

    const second = await gateway.listContributionGroup({
      groupId: "long",
      beforeRevision: first.nextBeforeRevision!,
      limit: 2,
    });
    expect(second.items.map((item) => item.revision)).toEqual([4, 3]);
    expect(second).toMatchObject({ hasMore: true, nextBeforeRevision: 3 });

    const last = await gateway.listContributionGroup({
      groupId: "long",
      beforeRevision: second.nextBeforeRevision!,
      limit: 2,
    });
    expect(last.items.map((item) => item.revision)).toEqual([2]);
    expect(last.hasMore).toBe(false);

    await expect(gateway.listContributionGroup({ groupId: "   " })).rejects.toThrow("non-empty group ID");
  });
});
