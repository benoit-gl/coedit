import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Contributor } from "../domain/types";
import {
  HOST_DEFERRED_REVISION_QUERIES,
  type MaterializedRevision,
  type RevisionQueryCapability,
} from "../persistence/gateway";
import { MemoryDocumentGateway } from "../persistence/memoryGateway";
import { useDocumentController } from "./useDocumentController";
import { WorkspaceMutationUnavailableError } from "./workspaceProjection";

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

async function renderController(
  gateway = new MemoryDocumentGateway(),
  revisionQueryCapability: RevisionQueryCapability = gateway.revisionQueryCapability,
): Promise<() => Controller> {
  let current: Controller | null = null;
  function Harness() {
    current = useDocumentController({
      documentGateway: gateway,
      revisionQueryCapability,
      profile,
    });
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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settleControllerWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
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

describe("useDocumentController workspace projection", () => {
  it("flushes before entering historical mode, guards commands, and returns to retained live state", async () => {
    const gateway = new MemoryDocumentGateway();
    const materialize = vi.spyOn(gateway, "materializeRevision");
    const getController = await renderController(gateway);
    await createTwoNodes(getController);
    const historyBefore = await gateway.listContributions();
    const generation = getController().editorGeneration;
    const events: string[] = [];
    getController().registerDraftParticipant("test-editor", {
      freeze: () => events.push("freeze"),
      flush: async () => { events.push("flush"); },
      unfreeze: () => events.push("unfreeze"),
    });

    await act(async () => {
      expect(await getController().viewRevision(1)).toBe(true);
    });

    expect(events).toEqual(["freeze", "flush", "unfreeze"]);
    expect(materialize).toHaveBeenCalledTimes(1);
    expect(getController().workspaceProjection).toMatchObject({
      kind: "historical",
      currentRevision: 2,
      editorOwnerNodeId: null,
      retainedLive: {
        live: { selectedNodeId: "first", view: { document: { revision: 2 } } },
        resumeEditorNodeId: "first",
      },
    });
    expect(getController().revisionRequest).toEqual({ kind: "idle" });
    expect(getController().view).toMatchObject({
      readOnly: true,
      document: { revision: 1 },
      nodes: [{ id: "first" }],
    });
    expect(getController().currentRevision).toBe(2);
    expect(getController().editorGeneration).toBe(generation + 1);
    expect(await gateway.listContributions()).toEqual(historyBefore);

    await act(async () => {
      expect(await getController().applyOperation(
        { type: "createNode", node: { id: "blocked", title: "Blocked" } },
        "Must not run",
      )).toBe(false);
      expect(await getController().exportDocument("json")).toBe(false);
      expect(await getController().createDocument("Replacement")).toBe(false);
    });
    await expect(getController().commitDocumentTitle("Blocked rename"))
      .rejects.toBeInstanceOf(WorkspaceMutationUnavailableError);
    expect(await gateway.listContributions()).toEqual(historyBefore);

    act(() => { expect(getController().backToCurrent()).toBe(true); });
    expect(materialize).toHaveBeenCalledTimes(1);
    expect(getController().workspaceProjection).toMatchObject({
      kind: "live",
      displayed: { selectedNodeId: "first", view: { document: { revision: 2 } } },
      editorOwnerNodeId: "first",
    });
    expect(getController().view).toMatchObject({ readOnly: false, document: { revision: 2 } });
    expect(getController().editorGeneration).toBe(generation + 2);
  });

  it("does not query or leave live mode when the draft flush fails", async () => {
    const gateway = new MemoryDocumentGateway();
    const materialize = vi.spyOn(gateway, "materializeRevision");
    const getController = await renderController(gateway);
    await createTwoNodes(getController);
    getController().registerDraftParticipant("failing-editor", {
      freeze: () => undefined,
      flush: async () => { throw new Error("draft save failed"); },
      unfreeze: () => undefined,
    });

    await act(async () => {
      expect(await getController().viewRevision(1)).toBe(false);
    });

    expect(materialize).not.toHaveBeenCalled();
    expect(getController().workspaceProjection?.kind).toBe("live");
    expect(getController().view?.document.revision).toBe(2);
    expect(getController().error).toBe("draft save failed");
  });

  it("rejects View before flushing when the host query capability is unavailable", async () => {
    const gateway = new MemoryDocumentGateway();
    const getController = await renderController(gateway, HOST_DEFERRED_REVISION_QUERIES);
    await createTwoNodes(getController);
    const events: string[] = [];
    getController().registerDraftParticipant("test-editor", {
      freeze: () => events.push("freeze"),
      flush: async () => { events.push("flush"); },
      unfreeze: () => events.push("unfreeze"),
    });

    await act(async () => { expect(await getController().viewRevision(1)).toBe(false); });

    expect(events).toEqual([]);
    expect(getController().workspaceProjection?.kind).toBe("live");
    expect(getController().error).toBe("Historical revision viewing is unavailable in this host.");
  });

  it("accepts only the newest revision response and Back invalidates a historical-origin request", async () => {
    const gateway = new MemoryDocumentGateway();
    const pending: Array<{ revision: number; result: Deferred<MaterializedRevision> }> = [];
    const capability: RevisionQueryCapability = {
      kind: "available",
      queries: {
        materializeRevision: vi.fn((revision: number) => {
          const result = deferred<MaterializedRevision>();
          pending.push({ revision, result });
          return result.promise;
        }),
      },
    };
    const getController = await renderController(gateway, capability);
    await createTwoNodes(getController);
    const revisionOne = await gateway.materializeRevision(1);
    const revisionTwo = await gateway.materializeRevision(2);

    let first!: Promise<boolean>;
    act(() => { first = getController().viewRevision(1); });
    await settleControllerWork();
    expect(getController().revisionRequest).toMatchObject({ kind: "loading", requestedRevision: 1 });

    let second!: Promise<boolean>;
    act(() => { second = getController().viewRevision(2); });
    await settleControllerWork();
    expect(pending.map((item) => item.revision)).toEqual([1, 2]);

    await act(async () => {
      pending[1].result.resolve(revisionTwo);
      expect(await second).toBe(true);
    });
    expect(getController().workspaceProjection).toMatchObject({
      kind: "historical",
      displayed: { materialized: { revision: 2 } },
      currentRevision: 2,
    });

    await act(async () => {
      pending[0].result.resolve(revisionOne);
      expect(await first).toBe(false);
    });
    expect(getController().workspaceProjection).toMatchObject({
      kind: "historical",
      displayed: { materialized: { revision: 2 } },
    });

    let fromHistory!: Promise<boolean>;
    act(() => { fromHistory = getController().viewRevision(1); });
    await settleControllerWork();
    expect(getController().revisionRequest).toMatchObject({ kind: "loading", requestedRevision: 1 });
    act(() => { expect(getController().backToCurrent()).toBe(true); });
    expect(getController().workspaceProjection?.kind).toBe("live");

    await act(async () => {
      pending[2].result.resolve(revisionOne);
      expect(await fromHistory).toBe(false);
    });
    expect(getController().workspaceProjection).toMatchObject({
      kind: "live",
      displayed: { view: { document: { revision: 2 } } },
    });
  });

  it("retains the exact historical origin on failure and exits it only after a successful restore", async () => {
    const gateway = new MemoryDocumentGateway();
    const getController = await renderController(gateway);
    await createTwoNodes(getController);

    await act(async () => { expect(await getController().viewRevision(1)).toBe(true); });
    const historicalOrigin = getController().workspaceProjection;
    const materialize = vi.spyOn(gateway, "materializeRevision").mockRejectedValueOnce(new Error("snapshot unavailable"));

    await act(async () => { expect(await getController().viewRevision(0)).toBe(false); });
    expect(materialize).toHaveBeenCalledWith(0);
    expect(getController().workspaceProjection).toBe(historicalOrigin);
    expect(getController().error).toBe("snapshot unavailable");

    const restore = vi.spyOn(gateway, "restoreRevision").mockRejectedValueOnce(new Error("restore failed"));
    await act(async () => { expect(await getController().restoreRevision(1)).toBe(false); });
    expect(restore).toHaveBeenCalledWith(1, expect.objectContaining({ contributorId: "author" }));
    expect(getController().workspaceProjection).toBe(historicalOrigin);
    expect(getController().error).toBe("restore failed");

    await act(async () => { expect(await getController().restoreRevision(1)).toBe(true); });
    expect(getController().workspaceProjection?.kind).toBe("live");
    expect(getController().view).toMatchObject({ readOnly: false, document: { revision: 3 } });
    expect(getController().view?.nodes.map((node) => node.id)).toEqual(["first"]);
  });

  it("Close invalidates an in-flight response and clears both live and historical projections", async () => {
    const gateway = new MemoryDocumentGateway();
    const query = deferred<MaterializedRevision>();
    const capability: RevisionQueryCapability = {
      kind: "available",
      queries: { materializeRevision: () => query.promise },
    };
    const getController = await renderController(gateway, capability);
    await createTwoNodes(getController);
    const revisionOne = await gateway.materializeRevision(1);

    let viewing!: Promise<boolean>;
    act(() => { viewing = getController().viewRevision(1); });
    await settleControllerWork();
    expect(getController().revisionRequest.kind).toBe("loading");

    await act(async () => { expect(await getController().closeDocument()).toBe(true); });
    expect(getController().view).toBeNull();
    expect(getController().workspaceProjection).toBeNull();
    expect(getController().revisionRequest).toEqual({ kind: "idle" });

    await act(async () => {
      query.resolve(revisionOne);
      expect(await viewing).toBe(false);
    });
    expect(getController().view).toBeNull();
    expect(getController().workspaceProjection).toBeNull();
  });
});
