import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DraftParticipant, RegisterDraftParticipant } from "../application/draftTransition";
import type { DocumentNode } from "../domain/types";
import { NodeMetadataFields } from "./NodeMetadataFields";

declare global {
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

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("NodeMetadataFields", () => {
  it("adopts persistence normalization and creates a sibling only for unmodified, non-IME Enter", async () => {
    let participant: DraftParticipant | null = null;
    const register: RegisterDraftParticipant = (_key, next) => {
      participant = next;
      return () => { if (participant === next) participant = null; };
    };
    const createSibling = vi.fn(async () => undefined);

    function Harness() {
      const [node, setNode] = useState(initialNode);
      return (
        <NodeMetadataFields
          node={node}
          tagSuggestions={[]}
          disabled={false}
          registerDraftParticipant={register}
          onContext={() => undefined}
          onCreateSibling={createSibling}
          onCommit={async (changes) => {
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
    const input = container.querySelector<HTMLInputElement>('[data-node-control="title"]')!;

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "   ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await participant!.flush();
    });
    expect(input.value).toBe("Untitled idea");

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await Promise.resolve();
    });
    expect(createSibling).toHaveBeenCalledTimes(1);
  });
});
