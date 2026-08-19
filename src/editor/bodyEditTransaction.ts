export interface BodyTransactionObservation {
  /** Persistence hydration is never user editing. Defaults to `user`. */
  origin?: "user" | "persistence-load";
  docChanged: boolean;
  selectionChanged?: boolean;
  insertedText?: string;
  deletedContent?: boolean;
  inputType?: string | null;
  isComposing?: boolean;
  /** Explicit adapter override for formatting, replacement, undo, or redo. */
  atomic?: boolean;
}

export type BodyContentChange =
  | { kind: "insertion"; graphemeCount: number }
  | { kind: "deletion" }
  | { kind: "atomic" };

export type ClassifiedBodyTransaction =
  | { kind: "none" }
  | { kind: "selection-boundary" }
  | { kind: "composition-update" }
  | BodyContentChange;

const ATOMIC_INPUT_TYPES = new Set([
  "deleteByCut",
  "historyRedo",
  "historyUndo",
  "insertCompositionText",
  "insertFromDrop",
  "insertFromPaste",
  "insertFromYank",
  "insertReplacementText",
]);

interface SegmentData {
  segment: string;
}

interface SegmenterLike {
  segment(value: string): Iterable<SegmentData>;
}

interface SegmenterConstructorLike {
  new (locales?: string | string[], options?: { granularity: "grapheme" }): SegmenterLike;
}

const Segmenter = (Intl as typeof Intl & { Segmenter?: SegmenterConstructorLike }).Segmenter;
const graphemeSegmenter = Segmenter
  ? new Segmenter(undefined, { granularity: "grapheme" })
  : null;

function fallbackGraphemeCount(value: string): number {
  let count = 0;
  let joinNext = false;
  let regionalIndicatorRun = 0;
  let previousWasCarriageReturn = false;

  for (const symbol of value) {
    const codePoint = symbol.codePointAt(0)!;
    if (previousWasCarriageReturn && codePoint === 0x0a) {
      previousWasCarriageReturn = false;
      continue;
    }
    previousWasCarriageReturn = codePoint === 0x0d;

    const isCombiningMark = /\p{Mark}/u.test(symbol);
    const isVariationSelector = (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
      || (codePoint >= 0xe0100 && codePoint <= 0xe01ef);
    const isEmojiModifier = codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
    if (isCombiningMark || isVariationSelector || isEmojiModifier) {
      if (count === 0) count = 1;
      continue;
    }
    if (codePoint === 0x200d) {
      joinNext = true;
      continue;
    }
    if (joinNext) {
      joinNext = false;
      regionalIndicatorRun = 0;
      continue;
    }

    const isRegionalIndicator = codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
    if (isRegionalIndicator) {
      if (regionalIndicatorRun % 2 === 0) count += 1;
      regionalIndicatorRun += 1;
      continue;
    }
    regionalIndicatorRun = 0;
    count += 1;
  }
  return count;
}

export function countGraphemeClusters(value: string): number {
  if (!graphemeSegmenter) return fallbackGraphemeCount(value);
  return Array.from(graphemeSegmenter.segment(value)).length;
}

export function classifyBodyTransaction(
  observation: BodyTransactionObservation,
): ClassifiedBodyTransaction {
  if (observation.origin === "persistence-load") return { kind: "none" };
  if (!observation.docChanged) {
    return observation.selectionChanged
      ? { kind: "selection-boundary" }
      : { kind: "none" };
  }
  if (observation.isComposing) return { kind: "composition-update" };

  const inputType = observation.inputType ?? "";
  const insertedGraphemes = countGraphemeClusters(observation.insertedText ?? "");
  const deleted = observation.deletedContent === true || inputType.startsWith("delete");
  const atomic = observation.atomic === true
    || ATOMIC_INPUT_TYPES.has(inputType)
    || inputType.startsWith("format");

  if (atomic || (deleted && insertedGraphemes > 0)) return { kind: "atomic" };
  if (deleted) return { kind: "deletion" };
  if (insertedGraphemes > 0) {
    return { kind: "insertion", graphemeCount: insertedGraphemes };
  }
  // A document change without a countable insertion/deletion is kept atomic:
  // structural text changes and adapter-unknown formatting must not disappear.
  return { kind: "atomic" };
}
