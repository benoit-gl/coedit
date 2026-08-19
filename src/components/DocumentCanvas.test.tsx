import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { DocumentNode } from "../domain/types";
import { DocumentCanvas } from "./DocumentCanvas";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

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
    bodyHtml: `<p>${id} body</p>`,
    yjsState: "",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt,
  };
}

describe("DocumentCanvas read-only scaffold", () => {
  it("renders the WP-6 projection as one ordered static document in either workspace mode", async () => {
    const nodes = [
      node("later-root", null, 1),
      node("child", "root", 0),
      node("deleted", "root", 1, "2026-01-02T00:00:00.000Z"),
      node("root", null, 0),
    ];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <DocumentCanvas
        nodes={nodes}
        expandedNodeIds={new Set(["root"])}
        workspaceKind="historical"
        readOnly
      />,
    ));

    const canvas = container.querySelector(".document-canvas");
    const items = [...container.querySelectorAll<HTMLElement>(".node-block")];
    expect(canvas?.getAttribute("aria-label")).toBe("Historical document");
    expect(canvas?.getAttribute("data-workspace-kind")).toBe("historical");
    expect(canvas?.getAttribute("data-read-only")).toBe("true");
    expect(items.map((item) => item.dataset.nodeId)).toEqual(["root", "child", "later-root"]);
    expect(items.map((item) => item.dataset.depth)).toEqual(["0", "1", "0"]);
    expect(container.querySelector("script, input, textarea, [contenteditable], [role=toolbar]")).toBeNull();
    expect([...container.querySelectorAll("button")].every(
      (button) => button.classList.contains("node-block-disclosure"),
    )).toBe(true);
  });

  it("shows collapsed and empty projections without exposing controls", async () => {
    const nodes = [node("root", null, 0), node("child", "root", 0)];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <DocumentCanvas nodes={nodes} expandedNodeIds={new Set()} workspaceKind="live" readOnly />,
    ));

    expect([...container.querySelectorAll<HTMLElement>(".node-block")].map((item) => item.dataset.nodeId))
      .toEqual(["root"]);
    expect(container.textContent).toContain("Collapsed.");

    await act(async () => root?.render(
      <DocumentCanvas nodes={[]} expandedNodeIds={new Set()} workspaceKind="live" readOnly />,
    ));
    expect(container.querySelector(".document-canvas-empty")?.textContent)
      .toBe("This document has no visible ideas.");
    expect(container.querySelector("button, input, textarea, [contenteditable]")).toBeNull();
  });

  it("fails closed with a non-editable error when projection validation rejects the hierarchy", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <DocumentCanvas
        nodes={[node("orphan", "missing", 0)]}
        expandedNodeIds={new Set()}
        workspaceKind="historical"
        readOnly
      />,
    ));

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("The document hierarchy is invalid and cannot be displayed safely.");
    expect(container.querySelector(".node-block, button, input, textarea, [contenteditable]")).toBeNull();
  });
});
