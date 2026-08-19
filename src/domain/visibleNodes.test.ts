import { describe, expect, it } from "vitest";
import type { DocumentNode } from "./types";
import { projectVisibleNodes } from "./visibleNodes";

const now = "2026-01-01T00:00:00.000Z";

function node(
  id: string,
  parentId: string | null,
  position: number,
  deletedAt: string | null = null,
): DocumentNode {
  return {
    id,
    parentId,
    position,
    tags: [],
    title: id,
    bodyHtml: `<p>${id}</p>`,
    yjsState: "",
    metadata: {},
    createdAt: now,
    updatedAt: now,
    deletedAt,
  };
}

describe("visible-node projection", () => {
  it("projects deterministic pre-order depth and visible adjacency", () => {
    const nodes = [
      node("root-z", null, 2),
      node("child-b", "root-a", 1),
      node("root-b", null, 0),
      node("grandchild", "child-a", 0),
      node("child-a", "root-a", 0),
      node("root-a", null, 0),
    ];

    const visible = projectVisibleNodes(nodes, new Set(["root-a", "child-a"]));

    expect(visible.map((block) => block.node.id)).toEqual([
      "root-a",
      "child-a",
      "grandchild",
      "child-b",
      "root-b",
      "root-z",
    ]);
    expect(visible.map((block) => block.depth)).toEqual([0, 1, 2, 1, 0, 0]);
    expect(visible.map((block) => block.visibleIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(visible.map((block) => [
      block.previousVisibleNodeId,
      block.nextVisibleNodeId,
    ])).toEqual([
      [null, "child-a"],
      ["root-a", "grandchild"],
      ["child-a", "child-b"],
      ["grandchild", "root-b"],
      ["child-b", "root-z"],
      ["root-b", null],
    ]);
    expect(visible[0]).toMatchObject({ hasActiveChildren: true, expanded: true });
    expect(visible[1]).toMatchObject({ hasActiveChildren: true, expanded: true });
    expect(visible[2]).toMatchObject({ hasActiveChildren: false, expanded: false });
  });

  it("emits collapsed parents and excludes all of their descendants", () => {
    const nodes = [
      node("root", null, 0),
      node("child", "root", 0),
      node("grandchild", "child", 0),
    ];

    const collapsed = projectVisibleNodes(nodes, new Set(["child"]));
    expect(collapsed.map((block) => block.node.id)).toEqual(["root"]);
    expect(collapsed[0]).toMatchObject({
      hasActiveChildren: true,
      expanded: false,
      previousVisibleNodeId: null,
      nextVisibleNodeId: null,
    });
  });

  it("ignores stale expansion IDs and never reports a leaf as expanded", () => {
    const leaf = node("leaf", null, 0);
    const visible = projectVisibleNodes([leaf], new Set(["leaf", "missing"]));

    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ hasActiveChildren: false, expanded: false });
  });

  it("excludes deleted nodes and complete deleted subtrees", () => {
    const nodes = [
      node("active-root", null, 0),
      node("active-child", "active-root", 0),
      node("deleted-child", "active-root", 1, now),
      node("deleted-root", null, 1, now),
      node("deleted-descendant", "deleted-root", 0, now),
      node("deleted-only-parent", null, 2),
      node("deleted-only-child", "deleted-only-parent", 0, now),
    ];

    const visible = projectVisibleNodes(nodes, new Set(["active-root", "deleted-root"]));
    expect(visible.map((block) => block.node.id)).toEqual([
      "active-root",
      "active-child",
      "deleted-only-parent",
    ]);
    expect(visible[0].hasActiveChildren).toBe(true);
    expect(visible[2].hasActiveChildren).toBe(false);
  });

  it("returns frozen projection records without modifying source order or values", () => {
    const nodes = [node("second", null, 1), node("first", null, 0)];
    const sourceSnapshot = structuredClone(nodes);
    const expanded = new Set(["second"]);

    const visible = projectVisibleNodes(nodes, expanded);

    expect(nodes).toEqual(sourceSnapshot);
    expect(nodes.map((item) => item.id)).toEqual(["second", "first"]);
    expect(expanded).toEqual(new Set(["second"]));
    expect(Object.isFrozen(visible)).toBe(true);
    expect(visible.every((block) => Object.isFrozen(block))).toBe(true);
    expect(visible[0].node).toBe(nodes[1]);
  });

  it("returns an immutable empty projection for an empty hierarchy", () => {
    const visible = projectVisibleNodes([], new Set());
    expect(visible).toEqual([]);
    expect(Object.isFrozen(visible)).toBe(true);
  });

  it("rejects a missing parent and a cycle through domain validation", () => {
    expect(() => projectVisibleNodes([
      node("orphan", "missing", 0),
    ], new Set())).toThrow(/missing parent/);

    expect(() => projectVisibleNodes([
      node("first", "second", 0),
      node("second", "first", 0),
    ], new Set())).toThrow(/cycle/);
  });

  it("rejects an active node whose parent is deleted instead of promoting it", () => {
    expect(() => projectVisibleNodes([
      node("deleted-parent", null, 0, now),
      node("active-child", "deleted-parent", 0),
    ], new Set())).toThrow(/missing parent/);
  });

  it("projects a deeply expanded hierarchy without recursive traversal", () => {
    const count = 10_000;
    const nodes = Array.from({ length: count }, (_, index) => node(
      `node-${String(index).padStart(5, "0")}`,
      index === 0 ? null : `node-${String(index - 1).padStart(5, "0")}`,
      0,
    ));
    const expanded = new Set(nodes.map((item) => item.id));

    const visible = projectVisibleNodes(nodes, expanded);

    expect(visible).toHaveLength(count);
    expect(visible[0]).toMatchObject({ depth: 0, previousVisibleNodeId: null });
    expect(visible[count - 1]).toMatchObject({
      depth: count - 1,
      previousVisibleNodeId: nodes[count - 2].id,
      nextVisibleNodeId: null,
    });
  });
});
