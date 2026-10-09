import type { InlineContentId } from "../../../src/domain/index.js";
import type {
  QualificationOrigin,
  QualificationTextSpan,
} from "../payload/carrier.js";
import type {
  IntegratedDocumentCarrier,
  IntegratedDocumentChange,
  IntegratedPayloadChange,
} from "../integrated/carrier.js";
import type { QualificationEffectContext } from "../integrated/effectContext.js";

/** A transient attributed editing buffer, never a canonical carrier value. */
export interface EditorTextBuffer {
  /** Complete native string presented by the editor. */
  readonly text: string;
  /** Origin of each piece of the presented text. */
  readonly spans: readonly QualificationTextSpan[];
}

interface EditorGesture {
  readonly before: EditorTextBuffer;
  readonly after: EditorTextBuffer;
}

/** Extract an exact attributed substring without inheriting adjacent Origins. */
export function sliceAttributedText(
  buffer: EditorTextBuffer,
  start: number,
  end: number,
): readonly QualificationTextSpan[] {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    end > buffer.text.length
  )
    throw new RangeError("Editor selection is outside the native string.");
  const result: QualificationTextSpan[] = [];
  let offset = 0;
  for (const span of buffer.spans) {
    const spanEnd = offset + span.text.length;
    const from = Math.max(start, offset);
    const to = Math.min(end, spanEnd);
    if (from < to)
      result.push({
        text: span.text.slice(from - offset, to - offset),
        origin: { ...span.origin },
      });
    offset = spanEnd;
  }
  if (offset !== buffer.text.length)
    throw new TypeError("Editor Origin spans do not cover the canonical text.");
  return result;
}

/** Returns detached current text, including fine-grained protected Origin. */
export function readEditorText<Position>(
  carrier: IntegratedDocumentCarrier<Position>,
  inlineContentId: InlineContentId,
): EditorTextBuffer {
  const value = carrier.snapshot().payloads.get(inlineContentId);
  if (value?.kind !== "text")
    throw new TypeError("Editor target must be a live fine-grained text payload.");
  return {
    text: value.text,
    spans: value.spans.map((span) => ({
      text: span.text,
      origin: { ...span.origin },
    })),
  };
}

/**
 * Translate a complete editor text change to the shared semantic-change seam.
 *
 * The longest unchanged prefix and suffix are kept. Text and Origin from the
 * replacement section are submitted as fine-grained operations in one change.
 * Selection, formatting, composition, and editor history never enter the carrier.
 */
export function translateEditorText<Position>(
  inlineContentId: InlineContentId,
  before: EditorTextBuffer,
  after: EditorTextBuffer,
  context: QualificationEffectContext,
): IntegratedDocumentChange<Position> | undefined {
  if (before.text === after.text) return undefined;
  let prefix = 0;
  while (
    prefix < before.text.length &&
    prefix < after.text.length &&
    before.text[prefix] === after.text[prefix]
  )
    prefix += 1;
  let suffix = 0;
  while (
    suffix < before.text.length - prefix &&
    suffix < after.text.length - prefix &&
    before.text[before.text.length - suffix - 1] ===
      after.text[after.text.length - suffix - 1]
  )
    suffix += 1;
  const endBefore = before.text.length - suffix;
  const endAfter = after.text.length - suffix;
  const payloads: IntegratedPayloadChange[] = [];
  if (endBefore > prefix)
    payloads.push({
      kind: "delete-text",
      inlineContentId,
      start: prefix,
      end: endBefore,
    });
  let offset = prefix;
  for (const span of sliceAttributedText(after, prefix, endAfter)) {
    payloads.push({
      kind: "insert-text",
      inlineContentId,
      offset,
      text: span.text,
      origin: span.origin,
    });
    offset += span.text.length;
  }
  return { payloads, context };
}

function attributedInsertion(
  before: EditorTextBuffer,
  start: number,
  end: number,
  text: string,
  origin: QualificationOrigin,
): EditorTextBuffer {
  return attributedSplice(before, start, end, text === "" ? [] : [{ text, origin }]);
}

function attributedSplice(
  before: EditorTextBuffer,
  start: number,
  end: number,
  insertion: readonly QualificationTextSpan[],
): EditorTextBuffer {
  const prefix = sliceAttributedText(before, 0, start);
  const suffix = sliceAttributedText(before, end, before.text.length);
  if (insertion.some((span) => typeof span.text !== "string" || span.text.length === 0))
    throw new TypeError("Inserted clipboard spans must contain nonempty text.");
  const text = insertion.map((span) => span.text).join("");
  return {
    text: before.text.slice(0, start) + text + before.text.slice(end),
    spans: [
      ...prefix,
      ...insertion.map((span) => ({ text: span.text, origin: { ...span.origin } })),
      ...suffix,
    ],
  };
}

function attributedIdentity(buffer: EditorTextBuffer): string {
  const normalized: { text: string; id: string; kind: string }[] = [];
  for (const span of buffer.spans) {
    if (span.text === "") continue;
    const previous = normalized.at(-1);
    if (previous?.id === span.origin.id && previous.kind === span.origin.kind)
      previous.text += span.text;
    else normalized.push({ text: span.text, id: span.origin.id, kind: span.origin.kind });
  }
  return JSON.stringify(normalized);
}

/**
 * Qualification-only editor session. Undo/redo are new semantic edits, never
 * native carrier rewind or product History. If remote editing invalidates an
 * exact inverse, refuse explicitly instead of erasing concurrent work.
 */
export class QualificationTextEditor<Position> {
  private readonly undos: EditorGesture[] = [];
  private readonly redos: EditorGesture[] = [];
  private composition: EditorTextBuffer | undefined;
  private mounted = true;

  public constructor(
    private readonly carrier: IntegratedDocumentCarrier<Position>,
    private readonly inlineContentId: InlineContentId,
  ) {}

  /** Transient editor projection; not replicated. */
  public buffer(): EditorTextBuffer {
    this.requireMounted();
    return this.composition ?? readEditorText(this.carrier, this.inlineContentId);
  }

  /** Submit one application action as one integrated semantic change. */
  public replaceSelection(
    start: number,
    end: number,
    text: string,
    origin: QualificationOrigin,
    context: QualificationEffectContext,
  ): void {
    this.requireMounted();
    if (this.composition !== undefined)
      throw new TypeError("Commit IME composition before another editor action.");
    const before = readEditorText(this.carrier, this.inlineContentId);
    const after = attributedInsertion(before, start, end, text, origin);
    this.publish(before, after, context);
    if (before.text !== after.text) {
      this.undos.push({ before, after });
      this.redos.length = 0;
    }
  }

  /** Paste attributed private text, or imported fallback, as one editor action. */
  public replaceAttributedSelection(
    start: number,
    end: number,
    insertion: readonly QualificationTextSpan[],
    context: QualificationEffectContext,
  ): void {
    this.requireMounted();
    this.requireNoComposition();
    const before = readEditorText(this.carrier, this.inlineContentId);
    const after = attributedSplice(before, start, end, insertion);
    this.publish(before, after, context);
    if (before.text !== after.text) {
      this.undos.push({ before, after });
      this.redos.length = 0;
    }
  }

  /** Start IME composition without publishing partial text. */
  public beginComposition(): void {
    this.requireMounted();
    if (this.composition !== undefined)
      throw new TypeError("Composition is already active.");
    this.composition = readEditorText(this.carrier, this.inlineContentId);
  }

  /** Update transient composition text. */
  public updateComposition(
    start: number,
    end: number,
    text: string,
    origin: QualificationOrigin,
  ): void {
    this.requireMounted();
    if (this.composition === undefined)
      throw new TypeError("Composition has not started.");
    this.composition = attributedInsertion(
      this.composition,
      start,
      end,
      text,
      origin,
    );
  }

  /** Publish the complete IME action, or retain it for retry on failure. */
  public commitComposition(context: QualificationEffectContext): void {
    this.requireMounted();
    const after = this.composition;
    if (after === undefined)
      throw new TypeError("Composition has not started.");
    const before = readEditorText(this.carrier, this.inlineContentId);
    this.publish(before, after, context);
    this.composition = undefined;
    if (before.text !== after.text) {
      this.undos.push({ before, after });
      this.redos.length = 0;
    }
  }

  /** Cancel only uncommitted transient composition state. */
  public cancelComposition(): void {
    this.requireMounted();
    this.composition = undefined;
  }

  /** Perform an application undo intent through the semantic change seam. */
  public undo(context: QualificationEffectContext): void {
    this.requireMounted();
    this.requireNoComposition();
    const gesture = this.undos.at(-1);
    if (gesture === undefined) throw new RangeError("Nothing to undo.");
    this.publish(gesture.after, gesture.before, context);
    this.undos.pop();
    this.redos.push(gesture);
  }

  /** Perform an application redo intent through the semantic change seam. */
  public redo(context: QualificationEffectContext): void {
    this.requireMounted();
    this.requireNoComposition();
    const gesture = this.redos.at(-1);
    if (gesture === undefined) throw new RangeError("Nothing to redo.");
    this.publish(gesture.before, gesture.after, context);
    this.redos.pop();
    this.undos.push(gesture);
  }

  /** Explicitly close a clean editor. Never silently discard IME work. */
  public unmount(): void {
    this.requireNoComposition();
    this.mounted = false;
  }

  private publish(
    before: EditorTextBuffer,
    after: EditorTextBuffer,
    context: QualificationEffectContext,
  ): void {
    const current = readEditorText(this.carrier, this.inlineContentId);
    if (
      current.text !== before.text ||
      attributedIdentity(current) !== attributedIdentity(before)
    )
      throw new TypeError("Editor action has a stale canonical text base.");
    const change = translateEditorText<Position>(
      this.inlineContentId,
      before,
      after,
      context,
    );
    if (change !== undefined) this.carrier.applyChange(change);
  }

  private requireNoComposition(): void {
    if (this.composition !== undefined)
      throw new TypeError("An active composition must be committed or cancelled.");
  }

  private requireMounted(): void {
    if (!this.mounted) throw new TypeError("Editor is unmounted.");
  }
}
