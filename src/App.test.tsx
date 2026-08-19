import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentNode } from "./domain/types";
import { MemoryDocumentGateway } from "./persistence/memoryGateway";

vi.mock("./components/NodeEditor", () => ({
  NodeEditor: ({ node }: { node: DocumentNode }) => (
    <div data-testid="live-node-editor">Live editor: {node.title}</div>
  ),
}));

import { App } from "./App";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  vi.restoreAllMocks();
  if (root) await act(async () => root?.unmount());
  container?.remove();
  localStorage.clear();
  root = null;
  container = null;
});

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    (element as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function button(label: string): HTMLButtonElement {
  const match = [...container!.querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.textContent?.trim() === label);
  if (!match) throw new Error(`Button ${JSON.stringify(label)} was not rendered.`);
  return match;
}

function revisionRow(revision: number): HTMLLIElement {
  const match = [...container!.querySelectorAll<HTMLLIElement>(".history-list li")]
    .find((item) => item.querySelector(".history-revision")?.textContent === `r${revision}`);
  if (!match) throw new Error(`Revision ${revision} row was not rendered.`);
  return match;
}

describe("App historical workspace", () => {
  it("views and leaves history without mutation, then restores through one explicit command", async () => {
    const gateway = new MemoryDocumentGateway();
    const materialize = vi.spyOn(gateway, "materializeRevision");
    const restore = vi.spyOn(gateway, "restoreRevision");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <App
        documentGateway={gateway}
        revisionQueryCapability={gateway.revisionQueryCapability}
      />,
    ));

    await click(button("Create document"));
    await click(button("Create the first idea"));
    await click(container.querySelector(".outline-heading button")!);
    expect(container.querySelector('[data-testid="live-node-editor"]')).not.toBeNull();
    expect((await gateway.listContributions()).items).toHaveLength(3);

    const historyToggle = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent?.startsWith("History"));
    if (!historyToggle) throw new Error("History toggle was not rendered.");
    await click(historyToggle);
    await settle();

    await click(revisionRow(1).querySelector("button")!);
    await settle();

    expect(materialize).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".historical-banner")?.textContent)
      .toContain("Viewing revision 1Read only · current revision is 2");
    expect(container.querySelector('[role="status"]')?.textContent)
      .toBe("Viewing revision 1, read only. Current revision is 2.");
    expect(container.querySelector('[data-testid="live-node-editor"]')).toBeNull();
    expect(container.querySelector(".historical-node-view")).not.toBeNull();
    expect(container.querySelector(".node-editor input, .node-editor [contenteditable=true]")).toBeNull();
    expect(container.querySelector(".document-title")?.tagName).toBe("DIV");
    expect(container.querySelector<HTMLButtonElement>(".outline-heading button")?.disabled).toBe(true);
    expect([...container.querySelectorAll<HTMLButtonElement>(".menu button")].every((item) => item.disabled)).toBe(true);
    expect(revisionRow(1).getAttribute("aria-current")).toBe("true");
    expect((await gateway.listContributions()).items).toHaveLength(3);

    await click(button("Back to current"));
    expect(container.querySelector(".historical-banner")).toBeNull();
    expect(container.querySelector('[data-testid="live-node-editor"]')).not.toBeNull();
    expect(materialize).toHaveBeenCalledTimes(1);
    expect((await gateway.listContributions()).items).toHaveLength(3);

    await click(revisionRow(1).querySelector("button")!);
    await settle();
    await click(button("Restore as new revision…"));
    await settle();

    expect(confirm).toHaveBeenCalledWith(
      "Restore revision 1 as a new current revision? A new revision will be appended and later history will be retained.",
    );
    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith(1, expect.objectContaining({ contributorId: expect.any(String) }));
    expect(container.querySelector(".historical-banner")).toBeNull();
    expect(container.querySelector('[data-testid="live-node-editor"]')).not.toBeNull();
    const history = await gateway.listContributions();
    expect(history.items).toHaveLength(4);
    expect(history.items[0]).toMatchObject({ operationType: "restoreRevision", revision: 3 });
  });
});
