import { describe, expect, it } from "vitest";
import { MemoryDocumentGateway } from "./memoryGateway";
import type { Contributor } from "../domain/types";

const contributor: Contributor = {
  id: "author",
  displayName: "Author",
  kind: "human",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const context = { contributorId: "author", sessionId: null, groupId: null, message: null };

describe("memory document gateway", () => {
  it("attributes, hashes, and restores changes without deleting history", async () => {
    const gateway = new MemoryDocumentGateway();
    await gateway.createDocument(null, "Report", contributor);
    await gateway.applyOperation({ type: "createNode", node: { id: "intro", kind: "section", title: "Introduction" } }, context);
    await gateway.applyOperation({ type: "updateNode", nodeId: "intro", changes: { summary: "Context" } }, context);

    const restored = await gateway.restoreRevision(1, context);
    const history = await gateway.listContributions();
    expect(restored.nodes[0].summary).toBe("");
    expect(restored.document.revision).toBe(3);
    expect(history).toHaveLength(4);
    expect(history.every((item) => item.resultingHash.length > 0)).toBe(true);
  });
});
