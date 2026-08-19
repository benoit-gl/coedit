import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { DocumentNode } from "../domain/types";
import { HistoricalNodeView } from "./HistoricalNodeView";

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

describe("HistoricalNodeView", () => {
  it("renders sanitized static metadata and body content without an editor surface", async () => {
    const node: DocumentNode = {
      id: "node",
      parentId: null,
      position: 0,
      tags: ["Research", "Draft"],
      title: "Earlier idea",
      bodyHtml: '<p onclick="steal()">Safe <strong>history</strong></p><script>alert("unsafe")</script>',
      yjsState: "",
      metadata: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<HistoricalNodeView node={node} />));

    expect(container.querySelector(".historical-node-title")?.textContent).toBe("Earlier idea");
    expect([...container.querySelectorAll(".historical-tags span")].map((tag) => tag.textContent))
      .toEqual(["Research", "Draft"]);
    expect(container.querySelector(".historical-body")?.textContent).toBe("Safe history");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
    expect(container.querySelector("input, textarea, button, [contenteditable=true], [role=toolbar]")).toBeNull();
  });
});
