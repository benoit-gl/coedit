import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { DocumentNode } from "../domain/types";
import type { VisibleNodeBlock } from "../domain/visibleNodes";
import { NodeBlock } from "./NodeBlock";

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

function node(overrides: Partial<DocumentNode> = {}): DocumentNode {
  return {
    id: "node",
    parentId: null,
    position: 0,
    tags: ["Research", "Draft"],
    title: "Static idea",
    bodyHtml: '<p onclick="steal()">Safe <strong>preview</strong></p><script>alert("unsafe")</script>',
    yjsState: "",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function block(nodeValue = node()): VisibleNodeBlock {
  return {
    node: nodeValue,
    depth: 2,
    hasActiveChildren: true,
    expanded: false,
    visibleIndex: 0,
    previousVisibleNodeId: null,
    nextVisibleNodeId: null,
  };
}

describe("NodeBlock read-only scaffold", () => {
  it("renders static metadata and sanitized body content without editor or mutation controls", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<ol><NodeBlock block={block()} readOnly /></ol>));

    const item = container.querySelector(".node-block");
    expect(item?.getAttribute("data-depth")).toBe("2");
    expect(item?.getAttribute("data-read-only")).toBe("true");
    expect(item?.textContent).toContain("Level 3. Collapsed.");
    expect(item?.textContent).toContain("Static idea");
    expect([...container.querySelectorAll(".node-block-tags li")].map((tag) => tag.textContent))
      .toEqual(["Research", "Draft"]);
    expect(container.querySelector(".node-body-preview")?.textContent).toBe("Safe preview");
    expect(container.querySelector("script, [onclick]")).toBeNull();
    expect(container.querySelector("input, textarea, button, [contenteditable], [role=toolbar]")).toBeNull();
  });

  it("renders explicit fallbacks for an empty title and body", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <ol><NodeBlock block={block(node({ title: "", bodyHtml: "", tags: [] }))} readOnly /></ol>,
    ));

    expect(container.querySelector("h2")?.textContent).toBe("Untitled idea");
    expect(container.querySelector(".node-body-preview-empty")?.textContent).toBe("No text for Untitled idea.");
    expect(container.querySelector(".node-block-tags")).toBeNull();
  });
});
