import { describe, expect, it } from "vitest";

import type { InlineContentId } from "../../../src/domain/index.js";
import type { IntegratedDocumentChange } from "../integrated/carrier.js";
import { mountProseMirrorEditor } from "./prosemirrorAdapter.js";

const contentId = "83000000-0000-4000-8000-000000000002" as InlineContentId;
const original = { id: "human-original", kind: "human" as const };
const editing = { id: "human-edit", kind: "human" as const };

describe("direct ProseMirror browser qualification", () => {
  it("mounts a real Chromium editor and publishes one native edit", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const published: IntegratedDocumentChange<never>[] = [];
    const editor = mountProseMirrorEditor<never>({
      element: mount,
      inlineContentId: contentId,
      buffer: { text: "alpha", spans: [{ text: "alpha", origin: original }] },
      origin: editing,
      nextContext: () => ({ actorId: "actor-a", effectId: "browser-0" }),
      publish: (change) => published.push(change),
    });
    expect(mount.querySelector("[contenteditable='true']")).not.toBeNull();

    editor.view.dispatch(editor.view.state.tr.insertText("!", 5));
    expect(published).toEqual([
      {
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: contentId,
            offset: 5,
            text: "!",
            origin: editing,
          },
        ],
        context: { actorId: "actor-a", effectId: "browser-0" },
      },
    ]);

    editor.unmount();
    expect(mount.querySelector("[contenteditable='true']")).toBeNull();
    mount.remove();
  });
});
