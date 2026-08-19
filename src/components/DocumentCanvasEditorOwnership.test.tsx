import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DraftParticipant } from "../application/draftTransition";
import { useDocumentController } from "../application/useDocumentController";
import type { Contributor } from "../domain/types";
import { MemoryDocumentGateway } from "../persistence/memoryGateway";

const editorMock = vi.hoisted(() => ({
  participant: null as DraftParticipant | null,
  lifecycle: [] as string[],
}));

vi.mock("../editor/RichTextEditor", async () => {
  const React = await import("react");
  return {
    RichTextEditor: (props: {
      node: { id: string };
      registerDraftParticipant: (participant: DraftParticipant) => () => void;
    }) => {
      React.useLayoutEffect(() => {
        const participant = editorMock.participant;
        if (!participant) throw new Error("The test editor participant was not configured.");
        editorMock.lifecycle.push(`mount:${props.node.id}`);
        const unregister = props.registerDraftParticipant(participant);
        return () => {
          unregister();
          editorMock.lifecycle.push(`unmount:${props.node.id}`);
        };
      }, [props.node.id, props.registerDraftParticipant]);
      return <div role="textbox" data-editor-node-id={props.node.id} />;
    },
  };
});

import { DocumentCanvas } from "./DocumentCanvas";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
type Controller = ReturnType<typeof useDocumentController>;
let currentController: Controller | null = null;

const profile: Contributor = {
  id: "author",
  displayName: "Author",
  kind: "human",
  createdAt: "2026-01-01T00:00:00.000Z",
};

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  editorMock.participant = null;
  editorMock.lifecycle = [];
  currentController = null;
});

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

function CanvasHarness({ gateway }: { gateway: MemoryDocumentGateway }) {
  const controller = useDocumentController({
    documentGateway: gateway,
    revisionQueryCapability: gateway.revisionQueryCapability,
    profile,
  });
  currentController = controller;
  const workspace = controller.workspaceProjection;

  return (
    <>
      {controller.error && <div role="alert">{controller.error}</div>}
      {workspace?.kind === "live" && (
        <DocumentCanvas
          nodes={workspace.displayed.view.nodes}
          expandedNodeIds={new Set()}
          workspaceKind="live"
          readOnly={false}
          editorOwnerNodeId={workspace.editorOwnerNodeId}
          onRequestEditorOwner={controller.selectNode}
          onCommitBody={controller.commitBody}
          registerDraftParticipant={controller.registerDraftParticipant}
        />
      )}
    </>
  );
}

function getController(): Controller {
  if (!currentController) throw new Error("The controller has not rendered.");
  return currentController;
}

async function renderHarness(): Promise<void> {
  const gateway = new MemoryDocumentGateway();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<CanvasHarness gateway={gateway} />));
  await act(async () => { expect(await getController().createDocument("Draft")).toBe(true); });
  await act(async () => {
    expect(await getController().applyOperation(
      { type: "createNode", node: { id: "first", tags: [], title: "first" } },
      "First node",
    )).toBe(true);
  });
  await act(async () => {
    expect(await getController().applyOperation(
      { type: "createNode", node: { id: "second", tags: [], title: "second" } },
      "Second node",
    )).toBe(true);
  });
}

describe("DocumentCanvas active editor ownership", () => {
  it("keeps exactly one old editor mounted until its checkpoint participant drains", async () => {
    const flush = deferred<void>();
    const events: string[] = [];
    const participant: DraftParticipant = {
      freeze: () => events.push("freeze:first"),
      flush: async () => undefined,
      unfreeze: () => events.push("unfreeze:first"),
    };
    editorMock.participant = participant;
    await renderHarness();
    events.length = 0;
    participant.flush = async () => {
      events.push("flush:first");
      await flush.promise;
    };

    expect(container?.querySelectorAll('[role="textbox"]')).toHaveLength(1);
    expect(container?.querySelector('[role="textbox"]')?.getAttribute("data-editor-node-id"))
      .toBe("first");

    const secondButton = container?.querySelector<HTMLButtonElement>(
      '[aria-label="Edit body for second"]',
    );
    expect(secondButton).not.toBeNull();
    act(() => secondButton?.click());

    expect(events).toEqual(["freeze:first", "flush:first"]);
    expect(secondButton?.disabled).toBe(true);
    expect(container?.querySelector('[role="textbox"]')?.getAttribute("data-editor-node-id"))
      .toBe("first");
    expect(editorMock.lifecycle).toEqual(["mount:first"]);

    await act(async () => {
      flush.resolve();
      await flush.promise;
      await Promise.resolve();
    });

    expect(events).toEqual(["freeze:first", "flush:first", "unfreeze:first"]);
    expect(container?.querySelectorAll('[role="textbox"]')).toHaveLength(1);
    expect(container?.querySelector('[role="textbox"]')?.getAttribute("data-editor-node-id"))
      .toBe("second");
    expect(editorMock.lifecycle).toEqual(["mount:first", "unmount:first", "mount:second"]);
  });

  it("retains the old owner and restores the target control when draining fails", async () => {
    const events: string[] = [];
    const participant: DraftParticipant = {
      freeze: () => events.push("freeze:first"),
      flush: async () => undefined,
      unfreeze: () => events.push("unfreeze:first"),
    };
    editorMock.participant = participant;
    await renderHarness();
    events.length = 0;
    participant.flush = async () => {
      events.push("flush:first");
      throw new Error("checkpoint failed");
    };

    const secondButton = container?.querySelector<HTMLButtonElement>(
      '[aria-label="Edit body for second"]',
    );
    secondButton?.focus();
    await act(async () => {
      secondButton?.click();
      await Promise.resolve();
    });

    expect(events).toEqual(["freeze:first", "flush:first", "unfreeze:first"]);
    expect(container?.querySelector('[role="alert"]')?.textContent).toBe("checkpoint failed");
    expect(container?.querySelectorAll('[role="textbox"]')).toHaveLength(1);
    expect(container?.querySelector('[role="textbox"]')?.getAttribute("data-editor-node-id"))
      .toBe("first");
    expect(secondButton?.disabled).toBe(false);
    expect(document.activeElement).toBe(secondButton);
    expect(editorMock.lifecycle).toEqual(["mount:first"]);
  });
});
