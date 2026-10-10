import { describe, expect, it } from "vitest";
import { TextSelection } from "prosemirror-state";

import type { DocumentId } from "../../../src/domain/index.js";
import type { InlineContentId } from "../../../src/domain/index.js";
import type { IntegratedDocumentChange } from "../integrated/carrier.js";
import { STEP3_PRIVATE_CLIPBOARD_TYPE } from "./clipboard.js";
import { mountProseMirrorEditor } from "./prosemirrorAdapter.js";

const contentId = "83000000-0000-4000-8000-000000000002" as InlineContentId;
const documentId = "83000000-0000-4000-8000-000000000003" as DocumentId;
const original = { id: "human-original", kind: "human" as const };
const editing = { id: "human-edit", kind: "human" as const };
const imported = { id: "external-import", kind: "imported" as const };

function clipboardEvent(
  type: "copy" | "cut" | "paste",
  clipboardData: DataTransfer,
): ClipboardEvent {
  return new ClipboardEvent(type, {
    bubbles: true,
    cancelable: true,
    clipboardData,
  });
}

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

  it("holds IME updates until composition ends and refuses dirty unmount", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const published: IntegratedDocumentChange<never>[] = [];
    const editor = mountProseMirrorEditor<never>({
      element: mount,
      inlineContentId: contentId,
      buffer: { text: "alpha", spans: [{ text: "alpha", origin: original }] },
      origin: editing,
      nextContext: () => ({ actorId: "actor-a", effectId: "ime" }),
      publish: (change) => published.push(change),
    });

    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    editor.view.dispatch(editor.view.state.tr.insertText("あ", 5));
    expect(published).toEqual([]);
    expect(() => editor.unmount()).toThrow(/composition/u);
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend"));
    expect(published).toEqual([
      {
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: contentId,
            offset: 5,
            text: "あ",
            origin: editing,
          },
        ],
        context: { actorId: "actor-a", effectId: "ime" },
      },
    ]);
    editor.unmount();
    mount.remove();
  });

  it("uses private same-document Origins and hostile plain-text fallback", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const published: IntegratedDocumentChange<never>[] = [];
    const editor = mountProseMirrorEditor<never>({
      element: mount,
      inlineContentId: contentId,
      buffer: { text: "alpha", spans: [{ text: "alpha", origin: original }] },
      origin: editing,
      nextContext: () => ({
        actorId: "actor-a",
        effectId: `clipboard-${published.length}`,
      }),
      publish: (change) => published.push(change),
      clipboard: {
        documentId,
        originCatalog: new Map([[original.id, original]]),
        fallbackOrigin: imported,
        limits: { maxEncodedLength: 4096, maxSpans: 8, maxTextLength: 64 },
        nextCopyReference: () => "copy-0",
      },
    });

    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, 1, 4),
      ),
    );
    const copied = new DataTransfer();
    editor.view.dom.dispatchEvent(clipboardEvent("copy", copied));
    expect(copied.getData("text/plain")).toBe("lph");
    expect(copied.getData(STEP3_PRIVATE_CLIPBOARD_TYPE)).toContain("copy-0");

    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, 5),
      ),
    );
    editor.view.dom.dispatchEvent(clipboardEvent("paste", copied));
    expect(published).toEqual([
      {
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: contentId,
            offset: 5,
            text: "lph",
            origin: original,
          },
        ],
        context: {
          actorId: "actor-a",
          effectId: "clipboard-0",
          source: { kind: "copy", reference: "copy-0" },
        },
      },
    ]);

    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, 0),
      ),
    );
    const hostile = new DataTransfer();
    hostile.setData("text/plain", "?");
    hostile.setData(STEP3_PRIVATE_CLIPBOARD_TYPE, "{not-json");
    editor.view.dom.dispatchEvent(clipboardEvent("paste", hostile));
    expect(published[1]).toMatchObject({
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: contentId,
          offset: 0,
          text: "?",
          origin: imported,
        },
      ],
    });
    editor.unmount();
    mount.remove();
  });
});
