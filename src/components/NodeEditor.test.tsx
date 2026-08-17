import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DraftParticipant, RegisterDraftParticipant } from "../application/draftTransition";
import type { DocumentNode } from "../domain/types";

vi.mock("../editor/RichTextEditor", () => ({ RichTextEditor: () => <div role="textbox" aria-label="Node body" /> }));

import { NodeEditor } from "./NodeEditor";

declare global {
  // React uses this opt-in to validate that stateful test work is wrapped in act().
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const initialNode: DocumentNode = {
  id: "node",
  parentId: null,
  position: 0,
  tags: [],
  title: "Draft",
  bodyHtml: "",
  yjsState: "",
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("NodeEditor metadata drafts", () => {
  it("adopts the normalized title returned by persistence after a successful flush", async () => {
    let participant: DraftParticipant | null = null;
    const register: RegisterDraftParticipant = (_key, next) => {
      participant = next;
      return () => { if (participant === next) participant = null; };
    };

    function Harness() {
      const [node, setNode] = useState(initialNode);
      return (
        <NodeEditor
          node={node}
          tagSuggestions={[]}
          readOnly={false}
          registerDraftParticipant={register}
          onBodyChange={async () => undefined}
          onMetadataChange={async (changes) => {
            setNode((current) => ({
              ...current,
              ...changes,
              ...(changes.title !== undefined
                ? { title: changes.title.trim() || "Untitled idea" }
                : {}),
            }));
          }}
        />
      );
    }

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Harness />));

    const input = container.querySelector<HTMLInputElement>(".title-input");
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "   ");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input!.value).toBe("   ");
    await act(async () => { await participant!.flush(); });

    expect(input!.value).toBe("Untitled idea");
  });

  it("renders one body editor and no secondary freeform summary field", async () => {
    const register: RegisterDraftParticipant = () => () => undefined;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <NodeEditor
        node={initialNode}
        tagSuggestions={[]}
        readOnly={false}
        registerDraftParticipant={register}
        onBodyChange={async () => undefined}
        onMetadataChange={async () => undefined}
      />,
    ));

    expect(container.querySelectorAll('[role="textbox"][aria-label="Node body"]')).toHaveLength(1);
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).not.toContain("Working summary");
  });
});
