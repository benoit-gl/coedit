import { describe, expect, it } from "vitest";
import { userEvent } from "@vitest/browser/context";
import { DOMParser as ProseMirrorDOMParser } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";

import {
  parseBlockId,
  type DocumentId,
  type InlineContentId,
} from "../../../src/domain/index.js";
import type {
  IntegratedDocumentCarrier,
  IntegratedDocumentChange,
  QualificationStableTextPosition,
} from "../integrated/carrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import type { IntegratedDocumentCarrierFactory } from "../integrated/carrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";
import { STEP3_PRIVATE_CLIPBOARD_TYPE } from "./clipboard.js";
import {
  type EditorTextBuffer,
  readEditorText,
  spliceAttributedText,
} from "./semanticText.js";
import {
  type MountedProseMirrorEditor,
  mountProseMirrorEditor,
  qualificationProseMirrorSchema,
} from "./prosemirrorAdapter.js";

const contentId = "83000000-0000-4000-8000-000000000002" as InlineContentId;
const documentId = "83000000-0000-4000-8000-000000000003" as DocumentId;
const original = { id: "human-original", kind: "human" as const };
const editing = { id: "human-edit", kind: "human" as const };
const imported = { id: "external-import", kind: "imported" as const };
const rootId = parseBlockId("83000000-0000-4000-8000-000000000001");
const carrierFactories: readonly IntegratedDocumentCarrierFactory<LocalDensePosition>[] =
  [
    createYjsIntegratedDocumentCarrierFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    ),
    createAutomergeIntegratedDocumentCarrierFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    ),
  ];

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

function clipboardEventWithTransport(
  type: "copy" | "cut" | "paste",
  clipboardData: Pick<DataTransfer, "getData" | "setData">,
): ClipboardEvent {
  const event = clipboardEvent(type, new DataTransfer());
  Object.defineProperty(event, "clipboardData", { value: clipboardData });
  return event;
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
  ) => QualificationStableTextPosition;
  resolve: (position: QualificationStableTextPosition) => number | undefined;
  insert: (offset: number, length: number) => void;
  apply: (change: IntegratedDocumentChange<never>) => void;
} {
  let next = 0;
  const offsets = new Map<
    number,
    { offset: number; affinity: "before" | "after" }
  >();
  return {
    create: (offset, affinity) => {
      next += 1;
      offsets.set(next, { offset, affinity });
      return {
        candidate: "yjs",
        inlineContentId: contentId,
        encoded: new Uint8Array([next]),
      };
    },
    resolve: (position) =>
      position.candidate === "yjs"
        ? offsets.get(position.encoded[0] ?? -1)?.offset
        : undefined,
    insert: (offset, length) => {
      for (const position of offsets.values())
        if (
          position.offset > offset ||
          (position.offset === offset && position.affinity === "after")
        )
          position.offset += length;
    },
    apply: (change) => {
      for (const payload of change.payloads ?? []) {
        if (payload.kind === "insert-text") {
          for (const position of offsets.values())
            if (
              position.offset > payload.offset ||
              (position.offset === payload.offset &&
                position.affinity === "after")
            )
              position.offset += payload.text.length;
        } else if (payload.kind === "delete-text") {
          const length = payload.end - payload.start;
          for (const position of offsets.values()) {
            if (position.offset >= payload.end) position.offset -= length;
            else if (position.offset > payload.start)
              position.offset = payload.start;
          }
        }
      }
    },
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

function mountCarrierEditor(
  factory: IntegratedDocumentCarrierFactory<LocalDensePosition>,
  initialText = "alpha",
): {
  readonly carrier: IntegratedDocumentCarrier<LocalDensePosition>;
  readonly editor: MountedProseMirrorEditor;
  readonly mount: HTMLDivElement;
  readonly copySource: () => string | undefined;
  readonly published: IntegratedDocumentChange<LocalDensePosition>[];
} {
  const mount = document.createElement("div");
  document.body.append(mount);
  const carrier = factory.create(rootId);
  carrier.applyChange({
    inlineContents: [{ inlineContentId: contentId, blockId: rootId }],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: contentId,
        mediaType: "text/plain",
        text: initialText,
        origin: original,
      },
    ],
    context: { actorId: "actor-a", effectId: "seed" },
  });
  let nextEffect = 0;
  let copySource: string | undefined;
  const published: IntegratedDocumentChange<LocalDensePosition>[] = [];
  const editor = mountProseMirrorEditor<LocalDensePosition>({
    element: mount,
    inlineContentId: contentId,
    buffer: readEditorText(carrier, contentId),
    readCurrentBuffer: () => readEditorText(carrier, contentId),
    textPositions: {
      create: (offset, affinity) =>
        carrier.createStableTextPosition(contentId, offset, affinity),
      resolve: (position) => carrier.resolveStableTextPosition(position),
    },
    origin: editing,
    pasteOrigin: imported,
    nextContext: () => ({
      actorId: "actor-a",
      effectId: `${factory.candidate}-browser-${nextEffect++}`,
    }),
    publish: (change) => {
      published.push(change);
      carrier.applyChange(change);
    },
    clipboard: {
      documentId,
      originCatalog: new Map([[original.id, original]]),
      trustedCopies: new Map(),
      limits: { maxEncodedLength: 4096, maxSpans: 8, maxTextLength: 64 },
      nextCopyReference: () => {
        copySource = carrier.captureHistoricalState();
        return copySource;
      },
      isStableSourceReference: (reference) => reference === copySource,
    },
  });
  return { carrier, editor, mount, copySource: () => copySource, published };
}

function unmountCarrierEditor(fixture: {
  readonly editor: MountedProseMirrorEditor;
  readonly mount: HTMLElement;
}): void {
  fixture.editor.unmount();
  fixture.mount.remove();
}

describe("direct ProseMirror browser qualification", () => {
  for (const factory of carrierFactories) {
    it(`publishes Chromium keyboard input to ${factory.candidate}`, async () => {
      const fixture = mountCarrierEditor(factory);
      fixture.editor.view.dispatch(
        fixture.editor.view.state.tr.setSelection(
          TextSelection.create(fixture.editor.view.state.doc, 5),
        ),
      );
      await userEvent.click(fixture.editor.view.dom);
      await userEvent.keyboard("!");
      expect(readEditorText(fixture.carrier, contentId)).toEqual({
        text: "alpha!",
        spans: [
          { text: "alpha", origin: original },
          { text: "!", origin: editing },
        ],
      });
      unmountCarrierEditor(fixture);
    });

    it(`parses <br> and edits text on ${factory.candidate}`, async () => {
      const fixture = mountCarrierEditor(factory, "a\nb");
      const { view } = fixture.editor;
      expect(view.dom.querySelector("br")).not.toBeNull();
      const parser = ProseMirrorDOMParser.fromSchema(
        qualificationProseMirrorSchema,
      );
      expect(parser.parse(view.dom).eq(view.state.doc)).toBe(true);

      await userEvent.click(view.dom);
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)),
      );
      await userEvent.keyboard("X");

      expect(readEditorText(fixture.carrier, contentId)).toEqual({
        text: "a\nXb",
        spans: [
          { text: "a\n", origin: original },
          { text: "X", origin: editing },
          { text: "b", origin: original },
        ],
      });
      expect(fixture.published).toHaveLength(1);
      expect(parser.parse(view.dom).eq(view.state.doc)).toBe(true);
      unmountCarrierEditor(fixture);
    });

    it(`ignores empty collapsed paste on ${factory.candidate}`, async () => {
      const fixture = mountCarrierEditor(factory);
      fixture.editor.view.dispatch(
        fixture.editor.view.state.tr.setSelection(
          TextSelection.create(fixture.editor.view.state.doc, 5),
        ),
      );
      await userEvent.click(fixture.editor.view.dom);
      await userEvent.keyboard("!");
      const before = fixture.carrier.snapshot();
      const count = fixture.published.length;
      fixture.editor.view.dom.dispatchEvent(
        clipboardEvent("paste", new DataTransfer()),
      );
      expect(fixture.carrier.snapshot()).toEqual(before);
      expect(fixture.published).toHaveLength(count);
      fixture.editor.undo();
      expect(readEditorText(fixture.carrier, contentId).text).toBe("alpha");
      fixture.editor.view.dispatch(
        fixture.editor.view.state.tr.setSelection(
          TextSelection.create(fixture.editor.view.state.doc, 1, 4),
        ),
      );
      fixture.editor.view.dom.dispatchEvent(
        clipboardEvent("paste", new DataTransfer()),
      );
      expect(readEditorText(fixture.carrier, contentId).text).toBe("aa");
      fixture.editor.undo();
      expect(readEditorText(fixture.carrier, contentId).text).toBe("alpha");
      unmountCarrierEditor(fixture);
    });

    it(`represents multiline plain paste with hard breaks on ${factory.candidate}`, () => {
      const fixture = mountCarrierEditor(factory, "ab");
      const { view } = fixture.editor;
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)),
      );
      const pasted = new DataTransfer();
      pasted.setData("text/plain", "x\ny");
      view.dom.dispatchEvent(clipboardEvent("paste", pasted));
      expect(readEditorText(fixture.carrier, contentId)).toEqual({
        text: "ax\nyb",
        spans: [
          { text: "a", origin: original },
          { text: "x\ny", origin: imported },
          { text: "b", origin: original },
        ],
      });
      expect(view.state.doc.child(1).type.name).toBe("hard_break");
      expect(view.dom.querySelector("br")).not.toBeNull();
      expect(
        ProseMirrorDOMParser.fromSchema(qualificationProseMirrorSchema)
          .parse(view.dom)
          .eq(view.state.doc),
      ).toBe(true);
      unmountCarrierEditor(fixture);
    });

    it(`publishes one IME action through ${factory.candidate}`, async () => {
      const fixture = mountCarrierEditor(factory);
      fixture.editor.view.dom.dispatchEvent(
        new CompositionEvent("compositionstart"),
      );
      fixture.editor.view.dispatch(
        fixture.editor.view.state.tr.insertText("あ", 5),
      );
      expect(readEditorText(fixture.carrier, contentId).text).toBe("alpha");
      fixture.editor.view.dom.dispatchEvent(
        new CompositionEvent("compositionend"),
      );
      await waitForCompositionFlush();
      expect(readEditorText(fixture.carrier, contentId)).toEqual({
        text: "alphaあ",
        spans: [
          { text: "alpha", origin: original },
          { text: "あ", origin: editing },
        ],
      });
      fixture.editor.undo();
      expect(readEditorText(fixture.carrier, contentId).text).toBe("alpha");
      unmountCarrierEditor(fixture);
    });

    it(`refuses copy and cut until IME publication on ${factory.candidate}`, async () => {
      const fixture = mountCarrierEditor(factory);
      const view = fixture.editor.view;
      view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
      view.dispatch(view.state.tr.insertText("X", 1));
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 2)),
      );
      expect(view.state.doc.textContent).toBe("aXlpha");
      expect(readEditorText(fixture.carrier, contentId).text).toBe("alpha");

      for (const phase of ["composing", "ending"] as const) {
        if (phase === "ending")
          view.dom.dispatchEvent(new CompositionEvent("compositionend"));
        for (const kind of ["copy", "cut"] as const) {
          const transfer = new DataTransfer();
          transfer.setData("text/plain", "unchanged");
          const event = clipboardEvent(kind, transfer);
          view.dom.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(true);
          expect(transfer.getData("text/plain")).toBe("unchanged");
        }
        expect(view.state.doc.textContent).toBe("aXlpha");
        expect(readEditorText(fixture.carrier, contentId).text).toBe("alpha");
        expect(fixture.published).toEqual([]);
        expect(fixture.copySource()).toBeUndefined();
      }

      await waitForCompositionFlush();
      expect(fixture.published).toHaveLength(1);
      expect(readEditorText(fixture.carrier, contentId)).toEqual({
        text: "aXlpha",
        spans: [
          { text: "a", origin: original },
          { text: "X", origin: editing },
          { text: "lpha", origin: original },
        ],
      });
      const copied = new DataTransfer();
      view.dom.dispatchEvent(clipboardEvent("copy", copied));
      expect(copied.getData("text/plain")).toBe("X");
      const cut = new DataTransfer();
      view.dom.dispatchEvent(clipboardEvent("cut", cut));
      expect(cut.getData("text/plain")).toBe("X");
      expect(readEditorText(fixture.carrier, contentId).text).toBe("alpha");
      expect(fixture.published).toHaveLength(2);
      unmountCarrierEditor(fixture);
    });

    it(`uses ${factory.candidate} anchors to reconcile browser undo`, async () => {
      const fixture = mountCarrierEditor(factory);
      fixture.editor.view.dispatch(
        fixture.editor.view.state.tr.setSelection(
          TextSelection.create(fixture.editor.view.state.doc, 5),
        ),
      );
      await userEvent.click(fixture.editor.view.dom);
      await userEvent.keyboard("!");
      fixture.carrier.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: contentId,
            offset: 0,
            text: "R",
            origin: original,
          },
        ],
        context: { actorId: "actor-b", effectId: "remote-prefix" },
      });
      fixture.editor.undo();
      expect(readEditorText(fixture.carrier, contentId).text).toBe("Ralpha");
      unmountCarrierEditor(fixture);
    });

    it(`keeps browser undo anchors inside later ${factory.candidate} boundary edits`, async () => {
      for (const [offset, placement] of [
        [5, "before"],
        [6, "after"],
      ] as const) {
        const fixture = mountCarrierEditor(factory);
        fixture.editor.view.dispatch(
          fixture.editor.view.state.tr.setSelection(
            TextSelection.create(fixture.editor.view.state.doc, 5),
          ),
        );
        await userEvent.click(fixture.editor.view.dom);
        await userEvent.keyboard("!");
        fixture.carrier.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: contentId,
              offset,
              text: "?",
              origin: original,
            },
          ],
          context: {
            actorId: "actor-b",
            effectId: `remote-${placement}`,
          },
        });
        fixture.editor.undo();
        expect(readEditorText(fixture.carrier, contentId).text).toBe("alpha?");
        unmountCarrierEditor(fixture);
      }
    });

    it(`removes matching restored text through ${factory.candidate} browser undo`, async () => {
      const fixture = mountCarrierEditor(factory);
      fixture.editor.view.dispatch(
        fixture.editor.view.state.tr.setSelection(
          TextSelection.create(fixture.editor.view.state.doc, 5),
        ),
      );
      await userEvent.click(fixture.editor.view.dom);
      await userEvent.keyboard("!");
      fixture.carrier.applyChange({
        payloads: [
          {
            kind: "delete-text",
            inlineContentId: contentId,
            start: 5,
            end: 6,
          },
          {
            kind: "insert-text",
            inlineContentId: contentId,
            offset: 5,
            text: "!",
            origin: original,
          },
        ],
        context: { actorId: "actor-b", effectId: "remote-restored-insert" },
      });
      fixture.editor.undo();
      expect(readEditorText(fixture.carrier, contentId).text).toBe("alpha");
      unmountCarrierEditor(fixture);
    });

    it(`preserves trusted clipboard Origin through ${factory.candidate}`, () => {
      const fixture = mountCarrierEditor(factory);
      fixture.editor.view.dispatch(
        fixture.editor.view.state.tr.setSelection(
          TextSelection.create(fixture.editor.view.state.doc, 1, 4),
        ),
      );
      const copied = new DataTransfer();
      fixture.editor.view.dom.dispatchEvent(clipboardEvent("copy", copied));
      fixture.editor.view.dispatch(
        fixture.editor.view.state.tr.setSelection(
          TextSelection.create(fixture.editor.view.state.doc, 5),
        ),
      );
      fixture.editor.view.dom.dispatchEvent(clipboardEvent("paste", copied));
      expect(readEditorText(fixture.carrier, contentId)).toEqual({
        text: "alphalph",
        spans: [{ text: "alphalph", origin: original }],
      });
      const copySource = fixture.copySource();
      expect(copySource).toBeDefined();
      const pasteEffect = {
        actorId: "actor-a",
        effectId: `${factory.candidate}-browser-0`,
        source: { kind: "copy" as const, reference: copySource! },
      };
      expect(
        fixture.carrier
          .effects()
          .get(JSON.stringify([pasteEffect.actorId, pasteEffect.effectId])),
      ).toEqual(pasteEffect);
      const reloaded = factory.load(fixture.carrier.encode());
      expect(
        reloaded
          .effects()
          .get(JSON.stringify([pasteEffect.actorId, pasteEffect.effectId])),
      ).toEqual(pasteEffect);
      expect(reloaded.materializeHistoricalState(copySource!)).toEqual(
        fixture.carrier.materializeHistoricalState(copySource!),
      );
      const hostile = new DataTransfer();
      hostile.setData("text/plain", "?");
      hostile.setData(STEP3_PRIVATE_CLIPBOARD_TYPE, "{not-json");
      fixture.editor.view.dispatch(
        fixture.editor.view.state.tr.setSelection(
          TextSelection.create(fixture.editor.view.state.doc, 0),
        ),
      );
      fixture.editor.view.dom.dispatchEvent(clipboardEvent("paste", hostile));
      expect(readEditorText(fixture.carrier, contentId).spans[0]).toEqual({
        text: "?",
        origin: imported,
      });
      unmountCarrierEditor(fixture);
    });

    it(`keeps same-Origin paste at the selected offset on ${factory.candidate}`, () => {
      const fixture = mountCarrierEditor(factory);
      fixture.editor.view.dispatch(
        fixture.editor.view.state.tr.setSelection(
          TextSelection.create(fixture.editor.view.state.doc, 0, 1),
        ),
      );
      const copied = new DataTransfer();
      fixture.editor.view.dom.dispatchEvent(clipboardEvent("copy", copied));
      fixture.editor.view.dispatch(
        fixture.editor.view.state.tr.setSelection(
          TextSelection.create(fixture.editor.view.state.doc, 0),
        ),
      );
      fixture.editor.view.dom.dispatchEvent(clipboardEvent("paste", copied));
      expect(fixture.published[0]?.payloads).toEqual([
        {
          kind: "insert-text",
          inlineContentId: contentId,
          offset: 0,
          text: "a",
          origin: original,
        },
      ]);
      expect(readEditorText(fixture.carrier, contentId).text).toBe("aalpha");
      fixture.editor.undo();
      expect(fixture.published[1]?.payloads).toEqual([
        { kind: "delete-text", inlineContentId: contentId, start: 0, end: 1 },
      ]);
      expect(readEditorText(fixture.carrier, contentId).text).toBe("alpha");
      unmountCarrierEditor(fixture);
    });

    it(`refuses cut when the plain clipboard transport fails on ${factory.candidate}`, () => {
      const fixture = mountCarrierEditor(factory);
      fixture.editor.view.dispatch(
        fixture.editor.view.state.tr.setSelection(
          TextSelection.create(fixture.editor.view.state.doc, 1, 4),
        ),
      );
      const failing = clipboardEventWithTransport("cut", {
        getData: () => "",
        setData: (type) => {
          if (type === "text/plain")
            throw new DOMException("Clipboard unavailable.", "NotAllowedError");
        },
      });
      fixture.editor.view.dom.dispatchEvent(failing);
      const missing = clipboardEvent("cut", new DataTransfer());
      Object.defineProperty(missing, "clipboardData", { value: null });
      fixture.editor.view.dom.dispatchEvent(missing);
      expect(readEditorText(fixture.carrier, contentId).text).toBe("alpha");
      expect(fixture.published).toEqual([]);
      unmountCarrierEditor(fixture);
    });

    it(`publishes a browser cut through ${factory.candidate}`, () => {
      const fixture = mountCarrierEditor(factory);
      fixture.editor.view.dispatch(
        fixture.editor.view.state.tr.setSelection(
          TextSelection.create(fixture.editor.view.state.doc, 1, 4),
        ),
      );
      const cut = new DataTransfer();
      fixture.editor.view.dom.dispatchEvent(clipboardEvent("cut", cut));
      expect(cut.getData("text/plain")).toBe("lph");
      expect(readEditorText(fixture.carrier, contentId)).toEqual({
        text: "aa",
        spans: [{ text: "aa", origin: original }],
      });
      unmountCarrierEditor(fixture);
    });
  }

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
      pasteOrigin: imported,
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
    editor.undo();
    expect(published).toHaveLength(4);
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
    expect(published[3]?.payloads).toEqual([
      { kind: "delete-text", inlineContentId: contentId, start: 5, end: 6 },
    ]);

    editor.unmount();
    expect(mount.querySelector("[contenteditable='true']")).toBeNull();
    expect(() => editor.undo()).toThrow(/unmounted/u);
    mount.remove();
  });

  it("anchors repeated-text insertion at the ProseMirror transaction position", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    let current: EditorTextBuffer = {
      text: "aaa",
      spans: [{ text: "aaa", origin: original }],
    };
    const editor = mountProseMirrorEditor<never>({
      element: mount,
      inlineContentId: contentId,
      buffer: current,
      readCurrentBuffer: () => current,
      textPositions: browserTextPositions(),
      origin: editing,
      pasteOrigin: imported,
      nextContext: () => ({ actorId: "actor-a", effectId: "repeated" }),
      publish: (change) => {
        current = applyPublishedChange(current, change);
      },
    });
    editor.view.dispatch(editor.view.state.tr.insertText("a", 0));
    expect(current.spans).toEqual([
      { text: "a", origin: editing },
      { text: "aaa", origin: original },
    ]);
    editor.undo();
    expect(current).toEqual({
      text: "aaa",
      spans: [{ text: "aaa", origin: original }],
    });
    editor.unmount();
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
      pasteOrigin: imported,
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
      pasteOrigin: imported,
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
      editor.view.dispatch(
        editor.view.state.tr.insertText("b", 6).setMeta("composition", 1),
      ),
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

  it("does not let an earlier IME timer commit a later composition", async () => {
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
      pasteOrigin: imported,
      nextContext: () => ({
        actorId: "actor-a",
        effectId: `ime-race-${published.length}`,
      }),
      publish: (change) => {
        published.push(change);
        current = applyPublishedChange(current, change);
      },
    });
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    editor.view.dispatch(editor.view.state.tr.insertText("a", 5));
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend"));
    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        TextSelection.atEnd(editor.view.state.doc),
      ),
    );
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    editor.view.dispatch(editor.view.state.tr.insertText("b", 6));
    await waitForCompositionFlush();
    expect(published).toHaveLength(1);
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend"));
    await waitForCompositionFlush();
    expect(published).toHaveLength(2);
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
      pasteOrigin: imported,
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

  it("resets a stale composition before a deferred independent transaction", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
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
      pasteOrigin: imported,
      nextContext: () => ({ actorId: "actor-a", effectId: "stale-flush" }),
      publish: (change) => {
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

    expect(() =>
      editor.view.dispatch(
        editor.view.state.tr.setSelection(
          TextSelection.create(editor.view.state.doc, 5),
        ),
      ),
    ).toThrow(/stale canonical/u);
    expect(rejected).toHaveLength(1);
    editor.unmount();
    mount.remove();
  });

  it("reconciles mounted insertion undo after a remote prefix edit", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const published: IntegratedDocumentChange<never>[] = [];
    let current: EditorTextBuffer = {
      text: "alpha",
      spans: [{ text: "alpha", origin: original }],
    };
    const positions = browserTextPositions();
    const editor = mountProseMirrorEditor<never>({
      element: mount,
      inlineContentId: contentId,
      buffer: current,
      readCurrentBuffer: () => current,
      textPositions: positions,
      origin: editing,
      pasteOrigin: imported,
      nextContext: () => ({
        actorId: "actor-a",
        effectId: `remote-${published.length}`,
      }),
      publish: (change) => {
        published.push(change);
        current = applyPublishedChange(current, change);
        positions.apply(change);
      },
    });
    editor.view.dispatch(editor.view.state.tr.insertText("!", 5));
    current = spliceAttributedText(current, 0, 0, [
      { text: "R", origin: original },
    ]);
    positions.insert(0, 1);
    editor.undo();
    expect(current.text).toBe("Ralpha");
    expect(published).toHaveLength(2);
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
      pasteOrigin: imported,
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
      pasteOrigin: imported,
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

  it("uses explicit imported Origin for plain paste without private clipboard support", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    let current: EditorTextBuffer = {
      text: "alpha",
      spans: [{ text: "alpha", origin: original }],
    };
    const published: IntegratedDocumentChange<never>[] = [];
    const editor = mountProseMirrorEditor<never>({
      element: mount,
      inlineContentId: contentId,
      buffer: current,
      readCurrentBuffer: () => current,
      textPositions: browserTextPositions(),
      origin: editing,
      pasteOrigin: imported,
      nextContext: () => ({
        actorId: "actor-a",
        effectId: `plain-${published.length}`,
      }),
      publish: (change) => {
        published.push(change);
        current = applyPublishedChange(current, change);
      },
    });
    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, 5),
      ),
    );
    const pasted = new DataTransfer();
    pasted.setData("text/plain", "?");
    editor.view.dom.dispatchEvent(clipboardEvent("paste", pasted));
    expect(current).toEqual({
      text: "alpha?",
      spans: [
        { text: "alpha", origin: original },
        { text: "?", origin: imported },
      ],
    });
    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, 5, 6),
      ),
    );
    const cut = new DataTransfer();
    editor.view.dom.dispatchEvent(clipboardEvent("cut", cut));
    expect(cut.getData("text/plain")).toBe("?");
    expect(current.text).toBe("alpha");
    expect(published).toHaveLength(2);
    editor.unmount();
    mount.remove();
  });

  it("keeps ordinary clipboard behavior when private transport is unavailable", () => {
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
      pasteOrigin: imported,
      nextContext: () => ({ actorId: "actor-a", effectId: "transport" }),
      publish: (change) => {
        published.push(change);
        current = applyPublishedChange(current, change);
      },
      clipboard: {
        documentId,
        originCatalog: new Map([[original.id, original]]),
        trustedCopies: new Map(),
        limits: { maxEncodedLength: 4096, maxSpans: 8, maxTextLength: 64 },
        nextCopyReference: () => "historical-copy-transport",
        isStableSourceReference: () => true,
      },
    });
    const written = new Map<string, string>();
    const transport = {
      getData: (type: string) => {
        if (type === STEP3_PRIVATE_CLIPBOARD_TYPE)
          throw new DOMException(
            "Custom type is unavailable.",
            "NotSupportedError",
          );
        return type === "text/plain" ? "?" : "";
      },
      setData: (type: string, value: string) => {
        if (type === STEP3_PRIVATE_CLIPBOARD_TYPE)
          throw new DOMException(
            "Custom type is unavailable.",
            "NotSupportedError",
          );
        written.set(type, value);
      },
    };
    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, 1, 4),
      ),
    );
    expect(() =>
      editor.view.dom.dispatchEvent(
        clipboardEventWithTransport("cut", transport),
      ),
    ).not.toThrow();
    expect(written.get("text/plain")).toBe("lph");
    expect(current.text).toBe("aa");
    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, 2),
      ),
    );
    expect(() =>
      editor.view.dom.dispatchEvent(
        clipboardEventWithTransport("paste", transport),
      ),
    ).not.toThrow();
    expect(current).toEqual({
      text: "aa?",
      spans: [
        { text: "aa", origin: original },
        { text: "?", origin: imported },
      ],
    });
    expect(published).toHaveLength(2);
    editor.unmount();
    mount.remove();
  });
});
