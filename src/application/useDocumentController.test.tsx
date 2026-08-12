import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { Contributor } from "../domain/types";
import { MemoryDocumentGateway } from "../persistence/memoryGateway";
import { useDocumentController } from "./useDocumentController";

declare global {
  // React uses this opt-in to validate that stateful test work is wrapped in act().
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const profile: Contributor = {
  id: "author",
  displayName: "Author",
  kind: "human",
  createdAt: "2026-01-01T00:00:00.000Z",
};

type Controller = ReturnType<typeof useDocumentController>;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function renderController(): Promise<() => Controller> {
  const gateway = new MemoryDocumentGateway();
  let current: Controller | null = null;
  function Harness() {
    current = useDocumentController({ documentGateway: gateway, profile });
    return null;
  }

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Harness />));
  return () => {
    if (!current) throw new Error("The controller has not rendered.");
    return current;
  };
}

async function createTwoNodes(getController: () => Controller): Promise<void> {
  await act(async () => { expect(await getController().createDocument("Draft")).toBe(true); });
  await act(async () => {
    expect(await getController().applyOperation(
      { type: "createNode", node: { id: "first", tags: [], title: "First" } },
      "First node",
    )).toBe(true);
  });
  await act(async () => {
    expect(await getController().applyOperation(
      { type: "createNode", node: { id: "second", tags: [], title: "Second" } },
      "Second node",
    )).toBe(true);
  });
}

describe("useDocumentController draft transitions", () => {
  it("flushes before selection and close, with synchronous freezing", async () => {
    const getController = await renderController();
    await createTwoNodes(getController);
    expect(getController().selectedId).toBe("first");

    const events: string[] = [];
    const unregister = getController().registerDraftParticipant("test-editor", {
      freeze: () => events.push("freeze"),
      flush: async () => { events.push("flush"); },
      unfreeze: () => events.push("unfreeze"),
    });

    let selection!: Promise<boolean>;
    act(() => { selection = getController().selectNode("second"); });
    expect(events[0]).toBe("freeze");
    await act(async () => { expect(await selection).toBe(true); });
    expect(events).toEqual(["freeze", "flush", "unfreeze"]);
    expect(getController().selectedId).toBe("second");

    events.length = 0;
    let closing!: Promise<boolean>;
    act(() => { closing = getController().closeDocument(); });
    expect(events[0]).toBe("freeze");
    await act(async () => { expect(await closing).toBe(true); });
    expect(events).toEqual(["freeze", "flush", "unfreeze"]);
    expect(getController().view).toBeNull();
    unregister();
  });

  it("keeps the current selection when flushing fails", async () => {
    const getController = await renderController();
    await createTwoNodes(getController);
    const events: string[] = [];
    getController().registerDraftParticipant("test-editor", {
      freeze: () => events.push("freeze"),
      flush: async () => {
        events.push("flush");
        throw new Error("draft save failed");
      },
      unfreeze: () => events.push("unfreeze"),
    });

    await act(async () => {
      expect(await getController().selectNode("second")).toBe(false);
    });
    expect(events).toEqual(["freeze", "flush", "unfreeze"]);
    expect(getController().selectedId).toBe("first");
    expect(getController().error).toBe("draft save failed");
  });

  it("flushes before restore and replaces the authoritative editor generation", async () => {
    const getController = await renderController();
    await createTwoNodes(getController);
    const generation = getController().editorGeneration;
    const events: string[] = [];
    getController().registerDraftParticipant("test-editor", {
      freeze: () => events.push("freeze"),
      flush: async () => { events.push("flush"); },
      unfreeze: () => events.push("unfreeze"),
    });

    await act(async () => {
      expect(await getController().restoreRevision(1)).toBe(true);
    });
    expect(events).toEqual(["freeze", "flush", "unfreeze"]);
    expect(getController().editorGeneration).toBe(generation + 1);
    expect(getController().view?.document.revision).toBe(3);
    expect(getController().view?.nodes.map((node) => node.id)).toEqual(["first"]);
  });
});
