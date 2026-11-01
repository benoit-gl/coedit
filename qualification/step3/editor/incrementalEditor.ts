import type { InlineContentId } from "../../../src/domain/index.js";
import type {
  IntegratedDocumentCarrier,
  IntegratedPayloadChange,
  QualificationIndexedWork,
} from "../integrated/carrier.js";
import type { QualificationEffectContext } from "../integrated/effectContext.js";
import { IndexedText } from "../integrated/indexedText.js";
import type { QualificationTextSpan } from "../payload/carrier.js";
import type { EditorTextOperation } from "./semanticText.js";

/** Passive editor-index counters, separate from carrier and native-library work. */
export interface IncrementalEditorWork {
  /** Units materialized during explicit activation or recovery only. */
  activationUnits: number;
  /** Indexed reads and path visits, including activation when not reset by the caller. */
  indexed: QualificationIndexedWork;
}

interface Gesture {
  readonly forward: readonly EditorTextOperation[];
  readonly inverse: readonly EditorTextOperation[];
}

/**
 * Qualification-only delta editor over an explicitly activated incremental carrier.
 *
 * Revision checks include Origin-only and lifecycle changes. Ordinary publication
 * stages path copies and inverse slices before native mutation, then adopts the
 * returned revision without a fallible post-publication full-buffer check.
 * Undo refuses a stale session; concurrent insertion reconciliation remains
 * separately exercised by the retained reference editor and native anchors.
 */
export class QualificationIncrementalEditor<Position> {
  private text = new IndexedText([]);
  private revision = Symbol("unactivated-editor");
  private readonly undos: Gesture[] = [];
  private readonly redos: Gesture[] = [];

  public constructor(
    private readonly carrier: IntegratedDocumentCarrier<Position>,
    private readonly inlineContentId: InlineContentId,
    private readonly work?: IncrementalEditorWork,
  ) {
    this.refresh();
  }

  /** Current activated UTF-16 length, without projecting native text. */
  public get length(): number {
    return this.text.length;
  }

  /** Explicit activation/recovery; full target work is outside ordinary editing. */
  public refresh(): void {
    let metadata = this.carrier.readOrdinaryTextRange(
      this.inlineContentId,
      0,
      0,
    );
    if (metadata === undefined && this.carrier.prepareOrdinaryText())
      metadata = this.carrier.readOrdinaryTextRange(this.inlineContentId, 0, 0);
    if (metadata === undefined)
      throw new TypeError(
        "Incremental editor requires a validated live text target and pure position decoder.",
      );
    const initial = this.carrier.readOrdinaryTextRange(
      this.inlineContentId,
      0,
      metadata.length,
    );
    if (initial === undefined)
      throw new Error("Incremental activation lost its target.");
    this.text = new IndexedText(initial.spans, this.work?.indexed);
    this.revision = initial.revision;
    if (this.work) this.work.activationUnits += initial.length;
    this.undos.length = 0;
    this.redos.length = 0;
  }

  /** Read only a selected attributed slice from the detached editor index. */
  public read(start: number, end: number): readonly QualificationTextSpan[] {
    this.requireCurrent();
    return this.text.read(start, end);
  }

  /** Submit ordered UTF-16 replacements as one canonical atomic command. */
  public apply(
    operations: readonly EditorTextOperation[],
    context: QualificationEffectContext,
  ): void {
    this.requireCurrent();
    const prepared = this.prepare(operations);
    if (prepared.payloads.length === 0) return;
    const gesture = {
      forward: operations.map((op) => ({
        ...op,
        insertion: op.insertion.map((span) => ({
          text: span.text,
          origin: { ...span.origin },
        })),
      })),
      inverse: prepared.inverse,
    };
    const revision = this.carrier.applyOrdinaryChange(
      { payloads: prepared.payloads, context },
      this.revision,
    );
    this.text = prepared.text;
    this.revision = revision;
    this.undos.push(gesture);
    this.redos.length = 0;
  }

  /** Undo an exact local gesture, refusing any intervening external revision. */
  public undo(context: QualificationEffectContext): void {
    this.replay(this.undos, this.redos, context, "inverse");
  }

  /** Redo an exact local gesture as fresh semantic operations. */
  public redo(context: QualificationEffectContext): void {
    this.replay(this.redos, this.undos, context, "forward");
  }

  private replay(
    from: Gesture[],
    to: Gesture[],
    context: QualificationEffectContext,
    direction: "forward" | "inverse",
  ): void {
    this.requireCurrent();
    const gesture = from.at(-1);
    if (gesture === undefined)
      throw new RangeError("No incremental editor gesture to replay.");
    const prepared = this.prepare(gesture[direction]);
    const revision = this.carrier.applyOrdinaryChange(
      { payloads: prepared.payloads, context },
      this.revision,
    );
    this.text = prepared.text;
    this.revision = revision;
    from.pop();
    to.push(gesture);
  }

  private requireCurrent(): void {
    const current = this.carrier.readOrdinaryTextRange(
      this.inlineContentId,
      0,
      0,
    );
    if (current?.revision !== this.revision)
      throw new TypeError(
        "Incremental editor has a stale canonical revision; refresh explicitly.",
      );
  }

  private prepare(operations: readonly EditorTextOperation[]): {
    readonly text: IndexedText;
    readonly payloads: readonly IntegratedPayloadChange[];
    readonly inverse: readonly EditorTextOperation[];
  } {
    const text = this.text.fork();
    const payloads: IntegratedPayloadChange[] = [];
    const inverse: EditorTextOperation[] = [];
    for (const operation of operations) {
      const removed = text.read(operation.start, operation.end);
      if (operation.start === operation.end && operation.insertion.length === 0)
        continue;
      if (operation.start !== operation.end)
        payloads.push({
          kind: "delete-text",
          inlineContentId: this.inlineContentId,
          start: operation.start,
          end: operation.end,
        });
      let offset = operation.start;
      text.replace(
        operation.start,
        operation.end,
        "",
        { id: "", kind: "unknown" },
        text.revision,
      );
      for (const span of operation.insertion) {
        if (span.text.length === 0)
          throw new TypeError("Inserted editor spans must be nonempty.");
        payloads.push({
          kind: "insert-text",
          inlineContentId: this.inlineContentId,
          offset,
          text: span.text,
          origin: span.origin,
        });
        text.replace(offset, offset, span.text, span.origin, text.revision);
        offset += span.text.length;
      }
      inverse.unshift({
        start: operation.start,
        end: offset,
        insertion: removed,
      });
    }
    return { text, payloads, inverse };
  }
}

/** Fresh zero-valued passive editor counters for independent measurements. */
export function createIncrementalEditorWork(): IncrementalEditorWork {
  return {
    activationUnits: 0,
    indexed: {
      rebuildUnits: 0,
      readUnits: 0,
      readPieces: 0,
      pathVisits: 0,
      cacheHits: 0,
    },
  };
}
