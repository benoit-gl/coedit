import { Schema, type Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, type Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import type { InlineContentId } from "../../../src/domain/index.js";
import type { DocumentId } from "../../../src/domain/index.js";
import type { QualificationOrigin } from "../payload/carrier.js";
import type { IntegratedDocumentChange } from "../integrated/carrier.js";
import type { QualificationEffectContext } from "../integrated/effectContext.js";
import {
  decodePrivateClipboard,
  encodePrivateClipboard,
  STEP3_PRIVATE_CLIPBOARD_TYPE,
  type PrivateClipboardLimits,
} from "./clipboard.js";
import {
  type EditorTextBuffer,
  sliceAttributedText,
  spliceAttributedText,
  translateEditorText,
} from "./semanticText.js";

/**
 * Flat transient ProseMirror schema for one allowlisted InlineContent.
 *
 * The schema deliberately has no block tree. A hard break is projected as the
 * native line-feed character, and marks remain editor-only state.
 */
export const qualificationProseMirrorSchema = new Schema({
  nodes: {
    doc: { content: "inline*" },
    text: { group: "inline" },
    hard_break: { group: "inline", inline: true, selectable: false },
  },
  marks: {
    em: {},
    strong: {},
  },
});

/** Create transient ProseMirror state from the canonical native-string view. */
export function createProseMirrorEditorState(
  buffer: EditorTextBuffer,
): EditorState {
  return EditorState.create({
    schema: qualificationProseMirrorSchema,
    doc: documentFromNativeText(buffer.text),
  });
}

/** Project flat ProseMirror content to its native-string editor representation. */
export function nativeTextFromProseMirror(document: ProseMirrorNode): string {
  if (document.type.schema !== qualificationProseMirrorSchema)
    throw new TypeError(
      "ProseMirror document uses the wrong qualification schema.",
    );
  let text = "";
  document.forEach((child) => {
    if (child.type.name === "text") text += child.text;
    else if (child.type.name === "hard_break") text += "\n";
    else
      throw new TypeError("ProseMirror document contains unsupported content.");
  });
  return text;
}

/**
 * Translate one committed ProseMirror transaction through the integrated seam.
 *
 * Selection, marks, and transaction metadata are transient. New native text
 * receives the supplied trusted Origin; unchanged text retains exact Origin.
 */
export function translateProseMirrorTransaction<Position>(
  inlineContentId: InlineContentId,
  before: EditorTextBuffer,
  transaction: Transaction,
  origin: QualificationOrigin,
  context: QualificationEffectContext,
): IntegratedDocumentChange<Position> | undefined {
  if (!transaction.docChanged) return undefined;
  const afterText = nativeTextFromProseMirror(transaction.doc);
  const after = attributeNativeReplacement(before, afterText, origin);
  return translateEditorText(inlineContentId, before, after, context);
}

/**
 * Build the post-transaction text projection without letting new text inherit
 * attribution from either adjacent side.
 */
export function attributeNativeReplacement(
  before: EditorTextBuffer,
  afterText: string,
  origin: QualificationOrigin,
): EditorTextBuffer {
  let prefix = 0;
  while (
    prefix < before.text.length &&
    prefix < afterText.length &&
    before.text[prefix] === afterText[prefix]
  )
    prefix += 1;
  let suffix = 0;
  while (
    suffix < before.text.length - prefix &&
    suffix < afterText.length - prefix &&
    before.text[before.text.length - suffix - 1] ===
      afterText[afterText.length - suffix - 1]
  )
    suffix += 1;
  const endBefore = before.text.length - suffix;
  const endAfter = afterText.length - suffix;
  return {
    text: afterText,
    spans: [
      ...sliceAttributedText(before, 0, prefix),
      ...(endAfter === prefix
        ? []
        : [{ text: afterText.slice(prefix, endAfter), origin: { ...origin } }]),
      ...sliceAttributedText(before, endBefore, before.text.length),
    ],
  };
}

/** Parameters for one mounted direct-ProseMirror qualification adapter. */
export interface ProseMirrorEditorMountOptions<Position> {
  /** DOM element that receives the transient editor view. */
  readonly element: HTMLElement;
  /** Canonical target for every published semantic change. */
  readonly inlineContentId: InlineContentId;
  /** Current detached canonical projection at mount time. */
  readonly buffer: EditorTextBuffer;
  /** Trusted Origin assigned only to newly inserted native text. */
  readonly origin: QualificationOrigin;
  /** Produces one fresh qualification context for each published action. */
  readonly nextContext: () => QualificationEffectContext;
  /** Applies one complete carrier-neutral semantic change. */
  readonly publish: (change: IntegratedDocumentChange<Position>) => void;
  /** Optional hostile-input policy for DOM clipboard events. */
  readonly clipboard?: ProseMirrorClipboardOptions;
}

/** Explicit qualification inputs for browser clipboard events. */
export interface ProseMirrorClipboardOptions {
  /** Document identity required before private Origin can be trusted. */
  readonly documentId: DocumentId;
  /** Trusted target-side Origin catalog; clipboard data never supplies it. */
  readonly originCatalog: ReadonlyMap<string, QualificationOrigin>;
  /** Attribution for HTML/plain text and rejected private fragments. */
  readonly fallbackOrigin: QualificationOrigin;
  /** Experimental admission limits; Gate B selects any final values. */
  readonly limits: PrivateClipboardLimits;
  /** Creates a source reference for an ordinary copy or cut gesture. */
  readonly nextCopyReference: () => string;
}

/** Mounted transient ProseMirror adapter with an explicit cleanup operation. */
export interface MountedProseMirrorEditor {
  /** Underlying browser editor view; it is never canonical state. */
  readonly view: EditorView;
  /** Releases DOM listeners and the transient ProseMirror view. */
  readonly unmount: () => void;
}

/**
 * Mount a direct ProseMirror view that publishes document changes through the
 * qualification semantic-change seam.
 *
 * The caller owns carrier lifecycle and must apply `publish` synchronously.
 * Selection and marks update only the transient view and create no carrier
 * operation. This adapter intentionally does not implement clipboard or IME
 * policies; their browser boundary remains a separate qualification concern.
 */
export function mountProseMirrorEditor<Position>(
  options: ProseMirrorEditorMountOptions<Position>,
): MountedProseMirrorEditor {
  let canonical = options.buffer;
  let compositionBefore: EditorTextBuffer | undefined;
  let state = createProseMirrorEditorState(canonical);
  const view = new EditorView(options.element, {
    state,
    handleDOMEvents: {
      compositionstart: () => {
        if (compositionBefore === undefined) compositionBefore = canonical;
        return false;
      },
      compositionend: () => {
        const before = compositionBefore;
        compositionBefore = undefined;
        if (before !== undefined)
          publishNativeChange(before, nativeTextFromProseMirror(state.doc));
        return false;
      },
      copy: (_view, event) => {
        copySelection(event);
        return true;
      },
      cut: (_view, event) => {
        copySelection(event);
        const { from, to } = state.selection;
        if (from !== to) view.dispatch(state.tr.delete(from, to));
        return true;
      },
      paste: (_view, event) => pasteSelection(event),
    },
    dispatchTransaction(transaction) {
      state = state.apply(transaction);
      view.updateState(state);
      if (compositionBefore === undefined)
        publishNativeChange(
          canonical,
          nativeTextFromProseMirror(transaction.doc),
        );
    },
  });

  return {
    view,
    unmount: () => {
      if (compositionBefore !== undefined)
        throw new TypeError("Commit or cancel composition before unmounting.");
      view.destroy();
    },
  };

  function publishNativeChange(
    before: EditorTextBuffer,
    afterText: string,
  ): void {
    const after = attributeNativeReplacement(before, afterText, options.origin);
    const change = translateEditorText<Position>(
      options.inlineContentId,
      before,
      after,
      options.nextContext(),
    );
    if (change !== undefined) options.publish(change);
    canonical = after;
  }

  function copySelection(event: ClipboardEvent): void {
    const clipboard = options.clipboard;
    if (clipboard === undefined) return;
    event.preventDefault();
    const { from, to } = state.selection;
    const encoded = encodePrivateClipboard(
      canonical,
      nativeOffset(from),
      nativeOffset(to),
      clipboard.documentId,
      clipboard.nextCopyReference(),
    );
    event.clipboardData?.setData("text/plain", encoded.plainText);
    event.clipboardData?.setData(
      STEP3_PRIVATE_CLIPBOARD_TYPE,
      encoded.privateText,
    );
  }

  function pasteSelection(event: ClipboardEvent): boolean {
    const clipboard = options.clipboard;
    if (clipboard === undefined) return false;
    event.preventDefault();
    const privateText = event.clipboardData?.getData(
      STEP3_PRIVATE_CLIPBOARD_TYPE,
    );
    const plainText = event.clipboardData?.getData("text/plain") ?? "";
    const decoded = decodePrivateClipboard(
      privateText === "" ? undefined : privateText,
      plainText,
      clipboard.documentId,
      clipboard.originCatalog,
      clipboard.fallbackOrigin,
      clipboard.limits,
    );
    const { from, to } = state.selection;
    const before = canonical;
    const after = spliceAttributedText(
      before,
      nativeOffset(from),
      nativeOffset(to),
      decoded.spans,
    );
    const transaction = state.tr.insertText(decoded.text, from, to);
    state = state.apply(transaction);
    view.updateState(state);
    const change = translateEditorText<Position>(
      options.inlineContentId,
      before,
      after,
      {
        ...options.nextContext(),
        ...(decoded.source === undefined ? {} : { source: decoded.source }),
      },
    );
    if (change !== undefined) options.publish(change);
    canonical = after;
    return true;
  }
}

/** Convert a flat-schema ProseMirror text position to a native-string offset. */
function nativeOffset(proseMirrorPosition: number): number {
  return proseMirrorPosition;
}

function documentFromNativeText(text: string): ProseMirrorNode {
  const content = [];
  let start = 0;
  for (let index = 0; index <= text.length; index += 1) {
    if (index !== text.length && text[index] !== "\n") continue;
    if (start < index)
      content.push(
        qualificationProseMirrorSchema.text(text.slice(start, index)),
      );
    if (index < text.length)
      content.push(qualificationProseMirrorSchema.nodes.hard_break.create());
    start = index + 1;
  }
  return qualificationProseMirrorSchema.nodes.doc.create(null, content);
}
