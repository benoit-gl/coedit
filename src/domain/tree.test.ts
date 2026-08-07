import { describe, expect, it } from "vitest";
import { applyOperation, assertValidTree, buildTree } from "./tree";
import type { DocumentState } from "./types";

const now = "2026-01-01T00:00:00.000Z";
const state = (): DocumentState => ({
  document: { id: "document", title: "Test", formatVersion: 1, revision: 0, createdAt: now, updatedAt: now },
  contributors: [],
  sessions: [],
  nodes: [
    { id: "root", parentId: null, position: 0, kind: "section", title: "Root", summary: "", contentHtml: "", yjsState: "", metadata: {}, createdAt: now, updatedAt: now, deletedAt: null },
    { id: "child", parentId: "root", position: 0, kind: "idea", title: "Child", summary: "", contentHtml: "", yjsState: "", metadata: {}, createdAt: now, updatedAt: now, deletedAt: null },
  ],
});

describe("tree operations", () => {
  it("builds the ordered hierarchy", () => {
    expect(buildTree(state().nodes)[0].children[0].id).toBe("child");
  });

  it("rejects moving a node into its descendant", () => {
    expect(() => applyOperation(state(), { type: "moveNode", nodeId: "root", parentId: "child", index: 0 }, now)).toThrow(/descendant/);
  });

  it("soft-deletes a complete subtree", () => {
    const result = applyOperation(state(), { type: "softDeleteNode", nodeId: "root" }, now);
    expect(result.nodes.every((node) => node.deletedAt === now)).toBe(true);
  });

  it("detects cyclic imported state", () => {
    const invalid = state().nodes;
    invalid[0].parentId = "child";
    expect(() => assertValidTree(invalid)).toThrow(/cycle/);
  });
});

