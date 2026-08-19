import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegisterDraftParticipant } from "../application/draftTransition";
import type { DocumentNode } from "../domain/types";
import { DocumentCanvas, type DocumentCanvasProps } from "./DocumentCanvas";

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

function node(id: string, parentId: string | null, position: number): DocumentNode {
  return {
    id,
    parentId,
    position,
    tags: [],
    title: id,
    bodyHtml: "",
    yjsState: "",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

const register: RegisterDraftParticipant = () => () => undefined;

function liveProps(
  nodes: DocumentNode[],
  overrides: Partial<Extract<DocumentCanvasProps, { readOnly: false }>> = {},
): Extract<DocumentCanvasProps, { readOnly: false }> {
  return {
    nodes,
    expandedNodeIds: new Set(nodes.map((item) => item.id)),
    workspaceKind: "live",
    contextNodeId: nodes[0]?.id ?? null,
    readOnly: false,
    disabled: false,
    editorOwnerNodeId: null,
    editorGeneration: 0,
    tagSuggestions: [],
    onRequestEditorOwner: async () => true,
    onReleaseEditorOwner: async () => true,
    onCommitMetadata: async () => undefined,
    onCommitBody: async () => undefined,
    onCreateNode: async () => "created",
    onMoveNode: async () => true,
    onDeleteNode: async () => true,
    registerDraftParticipant: register,
    ...overrides,
  };
}

async function render(props: DocumentCanvasProps): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<DocumentCanvas {...props} />));
}

function block(nodeId: string): HTMLElement {
  const match = [...container!.querySelectorAll<HTMLElement>(".node-block")]
    .find((item) => item.dataset.nodeId === nodeId);
  if (!match) throw new Error(`Block ${nodeId} was not rendered.`);
  return match;
}

describe("DocumentCanvas live structural interactions", () => {
  it("maps title and handle keyboard commands to sibling, child, reorder, and indent operations", async () => {
    const nodes = [node("first", null, 0), node("second", null, 1), node("child", "first", 0)];
    const create = vi.fn(async () => "created");
    const move = vi.fn(async () => true);
    await render(liveProps(nodes, { onCreateNode: create, onMoveNode: move }));

    await act(async () => {
      block("second").querySelector<HTMLInputElement>('[data-node-control="title"]')!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await Promise.resolve();
    });
    expect(create).toHaveBeenCalledWith(null, 2);

    await act(async () => {
      block("first").querySelector<HTMLButtonElement>('[data-node-control="handle"]')!
        .dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", ctrlKey: true, shiftKey: true, bubbles: true,
        }));
      await Promise.resolve();
    });
    expect(create).toHaveBeenCalledWith("first", 1);

    await act(async () => {
      block("second").querySelector<HTMLButtonElement>('[data-node-control="handle"]')!
        .dispatchEvent(new KeyboardEvent("keydown", {
          key: "ArrowUp", altKey: true, shiftKey: true, bubbles: true,
        }));
      await Promise.resolve();
    });
    expect(move).toHaveBeenCalledWith("second", null, 0);

    await act(async () => {
      block("first").querySelector<HTMLButtonElement>('[data-node-control="handle"]')!
        .dispatchEvent(new KeyboardEvent("keydown", {
          key: "ArrowDown", altKey: true, shiftKey: true, bubbles: true,
        }));
      await Promise.resolve();
    });
    expect(move).toHaveBeenCalledWith("first", null, 2);

    await act(async () => {
      block("second").querySelector<HTMLButtonElement>('[data-node-control="handle"]')!
        .dispatchEvent(new KeyboardEvent("keydown", {
          key: "ArrowRight", altKey: true, shiftKey: true, bubbles: true,
        }));
      await Promise.resolve();
    });
    expect(move).toHaveBeenCalledWith("second", "first", 1);

    const callsBeforeComposition = move.mock.calls.length;
    await act(async () => {
      block("second").querySelector<HTMLButtonElement>('[data-node-control="handle"]')!
        .dispatchEvent(new KeyboardEvent("keydown", {
          key: "ArrowRight", altKey: true, shiftKey: true, isComposing: true, bubbles: true,
        }));
    });
    expect(move).toHaveBeenCalledTimes(callsBeforeComposition);
  });

  it("supports pointer reparenting with the same move contract", async () => {
    const nodes = [node("first", null, 0), node("second", null, 1), node("child", "first", 0)];
    const move = vi.fn(async () => true);
    await render(liveProps(nodes, { onMoveNode: move }));
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    };
    const dragStart = new Event("dragstart", { bubbles: true });
    Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });

    await act(async () => {
      block("second").querySelector<HTMLButtonElement>('[data-node-control="handle"]')!
        .dispatchEvent(dragStart);
      block("first").dispatchEvent(drop);
      await Promise.resolve();
    });

    expect(move).toHaveBeenCalledWith("second", "first", 1);
  });

  it("drains an editor hidden by collapse and cancels collapse when the drain fails", async () => {
    const nodes = [node("root", null, 0), node("child", "root", 0)];
    const events: string[] = [];
    const expansion = vi.fn((_ids: ReadonlySet<string>) => { events.push("collapsed"); });
    const release = vi.fn(async () => {
      events.push("release");
      return false;
    });
    const props = liveProps(nodes, {
      editorOwnerNodeId: "child",
      onReleaseEditorOwner: release,
      onExpandedNodeIdsChange: expansion,
    });
    await render(props);

    await act(async () => {
      block("root").querySelector<HTMLButtonElement>('[data-node-control="disclosure"]')!.click();
      await Promise.resolve();
    });
    expect(events).toEqual(["release"]);
    expect(expansion).not.toHaveBeenCalled();

    release.mockImplementation(async () => {
      events.push("release-success");
      return true;
    });
    await act(async () => {
      block("root").querySelector<HTMLButtonElement>('[data-node-control="disclosure"]')!.click();
      await Promise.resolve();
    });
    expect(events).toEqual(["release", "release-success", "collapsed"]);
    expect(expansion.mock.calls[0][0].has("root")).toBe(false);
  });

  it("keeps historical disclosure local and exposes no mutation surface", async () => {
    const nodes = [node("root", null, 0), node("child", "root", 0)];
    const expansion = vi.fn();
    await render({
      nodes,
      expandedNodeIds: new Set(["root"]),
      workspaceKind: "historical",
      readOnly: true,
      onExpandedNodeIdsChange: expansion,
    });

    expect(container!.querySelector("input, [contenteditable], .node-block-actions, .node-block-handle, .node-block-edit-body"))
      .toBeNull();
    await act(async () => {
      block("root").querySelector<HTMLButtonElement>('[data-node-control="disclosure"]')!.click();
    });
    expect(expansion).toHaveBeenCalledTimes(1);
    expect(expansion.mock.calls[0][0].has("root")).toBe(false);
  });
});
