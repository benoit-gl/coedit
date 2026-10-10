import { describe, expect, it } from "vitest";
import { TextSelection } from "prosemirror-state";

import type { DocumentId } from "../../../src/domain/index.js";
import type { InlineContentId } from "../../../src/domain/index.js";
import type { IntegratedDocumentChange } from "../integrated/carrier.js";
import { STEP3_PRIVATE_CLIPBOARD_TYPE } from "./clipboard.js";
import { type EditorTextBuffer, spliceAttributedText } from "./semanticText.js";
import {
  mountProseMirrorEditor,
  qualificationProseMirrorSchema,
} from "./prosemirrorAdapter.js";

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

function waitForCompositionFlush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => setTimeout(resolve, 0), 0);
  });
}

function browserTextPositions(): {
  create: (
    offset: number,
    affinity: "before" | "after",
  ) => import("../integrated/carrier.js").QualificationStableTextPosition;
  resolve: (
    position: import("../integrated/carrier.js").QualificationStableTextPosition,
  ) => number | undefined;
} {
  let next = 0;
  const offsets = new Map<number, number>();
  return {
    create: (offset) => {
      next += 1;
      offsets.set(next, offset);
      return {
        candidate: "yjs",
        inlineContentId: contentId,
        encoded: new Uint8Array([next]),
      };
    },
    resolve: (position) =>
      position.candidate === "yjs"
        ? offsets.get(position.encoded[0] ?? -1)
        : undefined,
  };
}

function applyPublishedChange(
  buffer: EditorTextBuffer,
  change: IntegratedDocumentChange<never>,
): EditorTextBuffer {
  let current = buffer;
  for (const payload of change.payloads ?? []) {
    if (payload.kind === "insert-text")
      current = spliceAttributedText(current, payload.offset, payload.offset, [
        { text: payload.text, origin: payload.origin },
      ]);
    else if (payload.kind === "delete-text")
      current = spliceAttributedText(current, payload.start, payload.end, []);
    else
      throw new TypeError("Browser editor fixture received a non-text change.");
  }
  return {
    text: current.text,
    spans: current.spans.reduce<EditorTextBuffer["spans"][number][]>(
      (spans, span) => {
        const prior = spans.at(-1);
        if (
          prior !== undefined &&
          prior.origin.id === span.origin.id &&
          prior.origin.kind === span.origin.kind
        )
          spans[spans.length - 1] = {
            text: prior.text + span.text,
            origin: prior.origin,
          };
        else spans.push(span);
        return spans;
      },
      [],
    ),
  };
}

describe("direct ProseMirror browser qualification", () => {
  it("mounts a real Chromium editor and publishes one native edit", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const published: IntegratedDocumentChange<never>[] = [];
    let current: EditorTextBuffer = {
      text: "alpha",
      spans: [{ text: "alpha", origin: original }],
    };
    const editor = mountProseMirrorEditor<never>({
      element: mount,
      inlineContentId: contentId,
      buffer: current,
      readCurrentBuffer: () => current,
      textPositions: browserTextPositions(),
      origin: editing,
      nextContext: () => ({
        actorId: "actor-a",
        effectId: `browser-${published.length}`,
      }),
      publish: (change) => {
        published.push(change);
        current = applyPublishedChange(current, change);
      },
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
    editor.undo();
    editor.redo();
    expect(published).toHaveLength(3);
    expect(published[1]?.payloads).toEqual([
      { kind: "delete-text", inlineContentId: contentId, start: 5, end: 6 },
    ]);
    expect(published[2]?.payloads).toEqual([
      {
        kind: "insert-text",
        inlineContentId: contentId,
        offset: 5,
        text: "!",
        origin: editing,
      },
    ]);

    editor.unmount();
    expect(mount.querySelector("[contenteditable='true']")).toBeNull();
    mount.remove();
  });

  it("holds IME updates until composition ends and refuses dirty unmount", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const published: IntegratedDocumentChange<never>[] = [];
    let current: EditorTextBuffer = {
      text: "alpha",
      spans: [{ text: "alpha", origin: original }],
    };
    const editor = mountProseMirrorEditor<never>({
      element: mount,
      inlineContentId: contentId,
      buffer: current,
      readCurrentBuffer: () => current,
      textPositions: browserTextPositions(),
      origin: editing,
      nextContext: () => ({
        actorId: "actor-a",
        effectId: `ime-${published.length}`,
      }),
      publish: (change) => {
        published.push(change);
        current = applyPublishedChange(current, change);
      },
    });

    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    editor.view.dispatch(editor.view.state.tr.insertText("あ", 5));
    expect(published).toEqual([]);
    expect(() => editor.unmount()).toThrow(/composition/u);
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend"));
    await waitForCompositionFlush();
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
        context: { actorId: "actor-a", effectId: "ime-0" },
      },
    ]);
    editor.undo();
    expect(published[1]?.payloads).toEqual([
      {
        kind: "delete-text",
        inlineContentId: contentId,
        start: 5,
        end: 6,
      },
    ]);
    editor.unmount();
    mount.remove();
  });

  it("absorbs ProseMirror's deferred final IME mutation into one action", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const published: IntegratedDocumentChange<never>[] = [];
    let current: EditorTextBuffer = {
      text: "alpha",
      spans: [{ text: "alpha", origin: original }],
    };
    const editor = mountProseMirrorEditor<never>({
      element: mount,
      inlineContentId: contentId,
      buffer: current,
      readCurrentBuffer: () => current,
      textPositions: browserTextPositions(),
      origin: editing,
      nextContext: () => ({
        actorId: "actor-a",
        effectId: `ime-final-${published.length}`,
      }),
      publish: (change) => {
        published.push(change);
        current = applyPublishedChange(current, change);
      },
    });
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    editor.view.dispatch(editor.view.state.tr.insertText("a", 5));
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend"));
    queueMicrotask(() =>
      editor.view.dispatch(editor.view.state.tr.insertText("b", 6)),
    );
    await waitForCompositionFlush();
    expect(published).toHaveLength(1);
    expect(published[0]?.payloads).toEqual([
      {
        kind: "insert-text",
        inlineContentId: contentId,
        offset: 5,
        text: "a",
        origin: editing,
      },
      {
        kind: "insert-text",
        inlineContentId: contentId,
        offset: 6,
        text: "b",
        origin: editing,
      },
    ]);
    editor.unmount();
    mount.remove();
  });

  it("rejects a stale IME commit without leaving the editor composed", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const published: IntegratedDocumentChange<never>[] = [];
    const rejected: unknown[] = [];
    let current: EditorTextBuffer = {
      text: "alpha",
      spans: [{ text: "alpha", origin: original }],
    };
    const editor = mountProseMirrorEditor<never>({
      element: mount,
      inlineContentId: contentId,
      buffer: current,
      readCurrentBuffer: () => current,
      textPositions: browserTextPositions(),
      origin: editing,
      nextContext: () => ({ actorId: "actor-a", effectId: "stale-ime" }),
      publish: (change) => {
        published.push(change);
        current = applyPublishedChange(current, change);
      },
      onPublicationRejected: (error) => rejected.push(error),
    });
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    editor.view.dispatch(editor.view.state.tr.insertText("!", 5));
    current = spliceAttributedText(current, 0, 0, [
      { text: "R", origin: original },
    ]);
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend"));
    await waitForCompositionFlush();
    expect(published).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toBeInstanceOf(TypeError);
    editor.unmount();
    mount.remove();
  });

  it("refuses undo when the carrier projection changed remotely", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const published: IntegratedDocumentChange<never>[] = [];
    let current: EditorTextBuffer = {
      text: "alpha",
      spans: [{ text: "alpha", origin: original }],
    };
    const editor = mountProseMirrorEditor<never>({
      element: mount,
      inlineContentId: contentId,
      buffer: current,
      readCurrentBuffer: () => current,
      textPositions: browserTextPositions(),
      origin: editing,
      nextContext: () => ({
        actorId: "actor-a",
        effectId: `remote-${published.length}`,
      }),
      publish: (change) => {
        published.push(change);
        current = applyPublishedChange(current, change);
      },
    });
    editor.view.dispatch(editor.view.state.tr.insertText("!", 5));
    current = spliceAttributedText(current, 0, 0, [
      { text: "R", origin: original },
    ]);
    expect(() => editor.undo()).toThrow(/stale/u);
    expect(published).toHaveLength(1);
    editor.unmount();
    mount.remove();
  });

  it("mounts native line feeds and keeps marks transient", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const published: IntegratedDocumentChange<never>[] = [];
    const current: EditorTextBuffer = {
      text: "a\nb",
      spans: [{ text: "a\nb", origin: original }],
    };
    const editor = mountProseMirrorEditor<never>({
      element: mount,
      inlineContentId: contentId,
      buffer: current,
      readCurrentBuffer: () => current,
      textPositions: browserTextPositions(),
      origin: editing,
      nextContext: () => ({ actorId: "actor-a", effectId: "mark" }),
      publish: (change) => published.push(change),
    });
    expect(mount.querySelector("br")).not.toBeNull();
    editor.view.dispatch(
      editor.view.state.tr.addMark(
        0,
        1,
        qualificationProseMirrorSchema.marks.em.create(),
      ),
    );
    expect(mount.querySelector("em")).not.toBeNull();
    expect(published).toEqual([]);
    editor.unmount();
    mount.remove();
  });

  it("uses private same-document Origins and hostile plain-text fallback", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const published: IntegratedDocumentChange<never>[] = [];
    let current: EditorTextBuffer = {
      text: "alpha",
      spans: [{ text: "alpha", origin: original }],
    };
    const editor = mountProseMirrorEditor<never>({
      element: mount,
      inlineContentId: contentId,
      buffer: current,
      readCurrentBuffer: () => current,
      textPositions: browserTextPositions(),
      origin: editing,
      nextContext: () => ({
        actorId: "actor-a",
        effectId: `clipboard-${published.length}`,
      }),
      publish: (change) => {
        published.push(change);
        current = applyPublishedChange(current, change);
      },
      clipboard: {
        documentId,
        originCatalog: new Map([[original.id, original]]),
        trustedCopies: new Map(),
        fallbackOrigin: imported,
        limits: { maxEncodedLength: 4096, maxSpans: 8, maxTextLength: 64 },
        nextCopyReference: () => "historical-copy-0",
        isStableSourceReference: (reference) =>
          reference === "historical-copy-0",
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
    expect(copied.getData(STEP3_PRIVATE_CLIPBOARD_TYPE)).toContain(
      "historical-copy-0",
    );

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
          source: { kind: "copy", reference: "historical-copy-0" },
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
