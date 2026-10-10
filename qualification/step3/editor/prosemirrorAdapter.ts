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
  type TrustedPrivateClipboardCopy,
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
    hard_break: {
      group: "inline",
      inline: true,
      selectable: false,
      toDOM: () => ["br"],
    },
  },
  marks: {
    em: { toDOM: () => ["em", 0] },
    strong: { toDOM: () => ["strong", 0] },
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
  const after = attributeNativeTransaction(before, transaction, origin);
  if (after === undefined) return undefined;
  return translateEditorText(inlineContentId, before, after, context);
}

/**
 * Apply transaction replacement steps to attribution at their actual editor
 * coordinates. This avoids ambiguous prefix/suffix inference for repeated or
 * identical text while keeping mark-only transactions transient.
 */
export function attributeNativeTransaction(
  before: EditorTextBuffer,
  transaction: Transaction,
  origin: QualificationOrigin,
): EditorTextBuffer | undefined {
  let current = before;
  let changed = false;
  for (let index = 0; index < transaction.steps.length; index += 1) {
    const step = transaction.steps[index]!;
    const beforeDocument = transaction.docs[index];
    if (beforeDocument === undefined)
      throw new TypeError("ProseMirror transaction step base is missing.");
    const result = step.apply(beforeDocument);
    if (result.failed !== null || result.doc === null)
      throw new TypeError("ProseMirror transaction step is invalid.");
    const afterText = nativeTextFromProseMirror(result.doc);
    const replacements: { from: number; to: number; inserted: string }[] = [];
    step.getMap().forEach((from, to, newFrom, newTo) => {
      replacements.push({
        from,
        to,
        inserted: afterText.slice(newFrom, newTo),
      });
    });
    for (const replacement of replacements.sort(
      (left, right) => right.from - left.from,
    )) {
      current = spliceAttributedText(
        current,
        replacement.from,
        replacement.to,
        replacement.inserted === ""
          ? []
          : [{ text: replacement.inserted, origin: { ...origin } }],
      );
      changed = true;
    }
  }
  return changed ? current : undefined;
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
  /** Reads the carrier projection immediately before a semantic publication. */
  readonly readCurrentBuffer: () => EditorTextBuffer;
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
  /** Target-controlled receipts for private copy gestures issued by this editor. */
  readonly trustedCopies: Map<string, TrustedPrivateClipboardCopy>;
  /** Attribution for HTML/plain text and rejected private fragments. */
  readonly fallbackOrigin: QualificationOrigin;
  /** Experimental admission limits; Gate B selects any final values. */
  readonly limits: PrivateClipboardLimits;
  /** Creates a stable source effect or retained historical-state token. */
  readonly nextCopyReference: () => string;
  /** Verifies that a reference is durable carrier evidence, not a receipt key. */
  readonly isStableSourceReference: (reference: string) => boolean;
}

/** Mounted transient ProseMirror adapter with an explicit cleanup operation. */
export interface MountedProseMirrorEditor {
  /** Underlying browser editor view; it is never canonical state. */
  readonly view: EditorView;
  /** Submit one semantic undo intent without rewinding carrier state. */
  readonly undo: () => void;
  /** Submit one semantic redo intent without rewinding carrier state. */
  readonly redo: () => void;
  /** Releases DOM listeners and the transient ProseMirror view. */
  readonly unmount: () => void;
}

/**
 * Mount a direct ProseMirror view that publishes document changes through the
 * qualification semantic-change seam.
 *
 * The caller owns carrier lifecycle and must apply `publish` synchronously.
 * Selection and marks update only the transient view and create no carrier
 * operation. Its IME and clipboard hooks characterize the browser boundary;
 * they deliberately do not establish final product policies or formats.
 */
export function mountProseMirrorEditor<Position>(
  options: ProseMirrorEditorMountOptions<Position>,
): MountedProseMirrorEditor {
  let canonical = options.buffer;
  let composition:
    { before: EditorTextBuffer; after: EditorTextBuffer } | undefined;
  const undos: { before: EditorTextBuffer; after: EditorTextBuffer }[] = [];
  const redos: { before: EditorTextBuffer; after: EditorTextBuffer }[] = [];
  let state = createProseMirrorEditorState(canonical);
  const view = new EditorView(options.element, {
    state,
    handleDOMEvents: {
      compositionstart: () => {
        if (composition === undefined)
          composition = { before: canonical, after: canonical };
        return false;
      },
      compositionend: () => {
        // ProseMirror may flush the final IME DOM mutation on its own queued
        // turn after this hook. A second turn prevents splitting that final
        // mutation into a separate semantic action.
        setTimeout(() => {
          setTimeout(() => {
            const pending = composition;
            if (pending === undefined) return;
            publishAttributedChange(pending.before, pending.after);
            composition = undefined;
          }, 0);
        }, 0);
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
      const before = composition?.after ?? canonical;
      const after = attributeNativeTransaction(
        before,
        transaction,
        options.origin,
      );
      if (after === undefined) return;
      try {
        if (composition === undefined) publishAttributedChange(before, after);
        else composition = { ...composition, after };
      } catch (error) {
        resetViewToCurrent();
        throw error;
      }
    },
  });

  return {
    view,
    undo: () => replay(undos, redos, "undo"),
    redo: () => replay(redos, undos, "redo"),
    unmount: () => {
      if (composition !== undefined)
        throw new TypeError("Commit or cancel composition before unmounting.");
      view.destroy();
    },
  };

  function publishAttributedChange(
    before: EditorTextBuffer,
    after: EditorTextBuffer,
    source?: QualificationEffectContext["source"],
    record = true,
  ): void {
    if (!sameBuffer(options.readCurrentBuffer(), before))
      throw new TypeError(
        "Editor publication has a stale canonical text base.",
      );
    const change = translateEditorText<Position>(
      options.inlineContentId,
      before,
      after,
      {
        ...options.nextContext(),
        ...(source === undefined ? {} : { source }),
      },
    );
    let applied = after;
    if (change !== undefined) {
      options.publish(change);
      applied = options.readCurrentBuffer();
      if (!sameBuffer(applied, after))
        throw new TypeError(
          "Editor publication did not synchronously update canonical text.",
        );
    }
    canonical = applied;
    if (change !== undefined && record) {
      undos.push({ before, after: applied });
      redos.length = 0;
    }
  }

  function replay(
    source: { before: EditorTextBuffer; after: EditorTextBuffer }[],
    destination: { before: EditorTextBuffer; after: EditorTextBuffer }[],
    direction: "undo" | "redo",
  ): void {
    if (composition !== undefined)
      throw new TypeError("Commit or cancel composition before replaying.");
    const gesture = source.at(-1);
    if (gesture === undefined) throw new RangeError(`Nothing to ${direction}.`);
    const before = direction === "undo" ? gesture.after : gesture.before;
    const after = direction === "undo" ? gesture.before : gesture.after;
    if (!sameBuffer(options.readCurrentBuffer(), before))
      throw new TypeError(
        `Editor ${direction} has a stale canonical text base.`,
      );
    publishAttributedChange(before, after, undefined, false);
    source.pop();
    destination.push(gesture);
    state = createProseMirrorEditorState(canonical);
    view.updateState(state);
  }

  function copySelection(event: ClipboardEvent): void {
    const clipboard = options.clipboard;
    if (clipboard === undefined) return;
    event.preventDefault();
    const { from, to } = state.selection;
    const sourceReference = clipboard.nextCopyReference();
    if (!clipboard.isStableSourceReference(sourceReference))
      throw new TypeError(
        "Clipboard source reference is not durable evidence.",
      );
    const encoded = encodePrivateClipboard(
      canonical,
      nativeOffset(from),
      nativeOffset(to),
      clipboard.documentId,
      sourceReference,
    );
    event.clipboardData?.setData("text/plain", encoded.plainText);
    event.clipboardData?.setData(
      STEP3_PRIVATE_CLIPBOARD_TYPE,
      encoded.privateText,
    );
    clipboard.trustedCopies.set(sourceReference, {
      text: encoded.plainText,
      spans: sliceAttributedText(
        canonical,
        nativeOffset(from),
        nativeOffset(to),
      ),
    });
  }

  function pasteSelection(event: ClipboardEvent): boolean {
    const clipboard = options.clipboard;
    if (clipboard === undefined) return false;
    if (composition !== undefined)
      throw new TypeError("Commit or cancel composition before pasting.");
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
      clipboard.trustedCopies,
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
    publishAttributedChange(before, after, decoded.source);
    const transaction = state.tr.insertText(decoded.text, from, to);
    state = state.apply(transaction);
    view.updateState(state);
    return true;
  }

  function resetViewToCurrent(): void {
    canonical = options.readCurrentBuffer();
    state = createProseMirrorEditorState(canonical);
    view.updateState(state);
  }
}

function sameBuffer(left: EditorTextBuffer, right: EditorTextBuffer): boolean {
  return (
    left.text === right.text &&
    JSON.stringify(coalesceOrigins(left)) ===
      JSON.stringify(coalesceOrigins(right))
  );
}

/** Compare logical Origin runs, not candidate-specific span segmentation. */
function coalesceOrigins(buffer: EditorTextBuffer): readonly {
  readonly text: string;
  readonly origin: QualificationOrigin;
}[] {
  const runs: { text: string; origin: QualificationOrigin }[] = [];
  for (const span of buffer.spans) {
    const prior = runs.at(-1);
    if (
      prior !== undefined &&
      prior.origin.id === span.origin.id &&
      prior.origin.kind === span.origin.kind
    )
      prior.text += span.text;
    else runs.push({ text: span.text, origin: { ...span.origin } });
  }
  return runs;
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
