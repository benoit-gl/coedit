import type { OriginRecord } from "./content.js";
import {
  cloneInlineContentValue,
  contentLength,
  validateInlineContentValue,
} from "./content.js";
import type {
  ContentItem,
  FormattingMark,
  InlineContentValue,
} from "./content.js";

/** Stable classification for an expected CollaborativeContent edit rejection. */
export type ContentEditErrorKind =
  | "InvalidBase"
  | "InvalidRange"
  | "InvalidText"
  | "OriginConflict"
  | "InvalidResult";

/** Expected CollaborativeContent edit failure. */
export interface ContentEditError {
  readonly kind: ContentEditErrorKind;
  readonly message: string;
}

/** Result of one carrier-neutral CollaborativeContent edit. */
export type ContentEditResult =
  | { readonly ok: true; readonly value: InlineContentValue }
  | { readonly ok: false; readonly error: ContentEditError };

/** Inserts visible text with one explicitly supplied Origin. */
export function insertText(
  base: InlineContentValue,
  offset: number,
  text: string,
  origin: OriginRecord,
): ContentEditResult {
  if (text.length === 0 || text.includes("\n") || text.includes("\r")) {
    return failure(
      "InvalidText",
      "Inserted text must be non-empty and contain no hard break.",
    );
  }
  return insertItems(
    base,
    offset,
    [{ kind: "text", text, originId: origin.id }],
    origin,
  );
}

/** Inserts one hard break with one explicitly supplied Origin. */
export function insertHardBreak(
  base: InlineContentValue,
  offset: number,
  origin: OriginRecord,
): ContentEditResult {
  return insertItems(
    base,
    offset,
    [{ kind: "hardBreak", originId: origin.id }],
    origin,
  );
}

/** Deletes one non-empty logical offset range without changing surviving Origins. */
export function deleteContentRange(
  base: InlineContentValue,
  start: number,
  end: number,
): ContentEditResult {
  const baseError = validateBase(base);
  if (baseError !== undefined) {
    return baseError;
  }
  const length = contentLength(base);
  if (!isRange(start, end, length) || start === end) {
    return failure(
      "InvalidRange",
      "Delete range must be non-empty and inside content.",
    );
  }

  const units = expandItems(base.items);
  units.splice(start, end - start);
  const marks = base.marks
    .map((mark) => transformMarkForDeletion(mark, start, end))
    .filter((mark): mark is FormattingMark => mark !== undefined);
  return validatedResult({
    items: compactUnits(units),
    marks,
    origins: structuredClone(base.origins),
  });
}

/** Adds one validated intrinsic formatting mark without changing Origin state. */
export function addFormattingMark(
  base: InlineContentValue,
  mark: FormattingMark,
): ContentEditResult {
  const baseError = validateBase(base);
  if (baseError !== undefined) {
    return baseError;
  }
  return validatedResult({
    items: structuredClone(base.items),
    marks: [...structuredClone(base.marks), structuredClone(mark)],
    origins: structuredClone(base.origins),
  });
}

/** Removes all intrinsic formatting in a range while preserving Origin state. */
export function clearFormattingRange(
  base: InlineContentValue,
  start: number,
  end: number,
): ContentEditResult {
  const baseError = validateBase(base);
  if (baseError !== undefined) {
    return baseError;
  }
  const length = contentLength(base);
  if (!isRange(start, end, length) || start === end) {
    return failure(
      "InvalidRange",
      "Formatting range must be non-empty and inside content.",
    );
  }

  const marks: FormattingMark[] = [];
  for (const mark of base.marks) {
    if (mark.end <= start || mark.start >= end) {
      marks.push(structuredClone(mark));
      continue;
    }
    if (mark.start < start) {
      marks.push({ ...structuredClone(mark), end: start });
    }
    if (mark.end > end) {
      marks.push({ ...structuredClone(mark), start: end });
    }
  }
  return validatedResult({
    items: structuredClone(base.items),
    marks,
    origins: structuredClone(base.origins),
  });
}

function insertItems(
  base: InlineContentValue,
  offset: number,
  inserted: readonly ContentItem[],
  origin: OriginRecord,
): ContentEditResult {
  const baseError = validateBase(base);
  if (baseError !== undefined) {
    return baseError;
  }
  const length = contentLength(base);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > length) {
    return failure("InvalidRange", "Insertion offset is outside content.");
  }

  const existingOrigin = base.origins.find((entry) => entry.id === origin.id);
  if (
    existingOrigin !== undefined &&
    JSON.stringify(existingOrigin) !== JSON.stringify(origin)
  ) {
    return failure(
      "OriginConflict",
      "An OriginId cannot identify conflicting attribution.",
    );
  }

  const units = expandItems(base.items);
  units.splice(offset, 0, ...expandItems(inserted));
  const insertedLength = inserted.reduce(
    (sum, item) => sum + (item.kind === "text" ? item.text.length : 1),
    0,
  );
  const marks = base.marks.map((mark) =>
    transformMarkForInsertion(mark, offset, insertedLength),
  );
  const origins =
    existingOrigin === undefined
      ? [...structuredClone(base.origins), structuredClone(origin)]
      : structuredClone(base.origins);
  return validatedResult({ items: compactUnits(units), marks, origins });
}

interface TextUnit {
  readonly kind: "text";
  readonly text: string;
  readonly originId: ContentItem["originId"];
}

interface HardBreakUnit {
  readonly kind: "hardBreak";
  readonly originId: ContentItem["originId"];
}

type ContentUnit = TextUnit | HardBreakUnit;

function expandItems(items: readonly ContentItem[]): ContentUnit[] {
  const units: ContentUnit[] = [];
  for (const item of items) {
    if (item.kind === "hardBreak") {
      units.push({ kind: "hardBreak", originId: item.originId });
      continue;
    }
    for (let index = 0; index < item.text.length; index += 1) {
      units.push({
        kind: "text",
        text: item.text.slice(index, index + 1),
        originId: item.originId,
      });
    }
  }
  return units;
}

function compactUnits(units: readonly ContentUnit[]): ContentItem[] {
  const items: ContentItem[] = [];
  for (const unit of units) {
    const previous = items.at(-1);
    if (
      unit.kind === "text" &&
      previous?.kind === "text" &&
      previous.originId === unit.originId
    ) {
      items[items.length - 1] = {
        kind: "text",
        text: previous.text + unit.text,
        originId: unit.originId,
      };
    } else {
      items.push(structuredClone(unit));
    }
  }
  return items;
}

function transformMarkForInsertion(
  mark: FormattingMark,
  offset: number,
  insertedLength: number,
): FormattingMark {
  if (offset < mark.start) {
    return {
      ...structuredClone(mark),
      start: mark.start + insertedLength,
      end: mark.end + insertedLength,
    };
  }
  if (offset > mark.end) {
    return structuredClone(mark);
  }
  if (offset === mark.start) {
    const expands =
      mark.boundaryPolicy === "start" || mark.boundaryPolicy === "both";
    return expands
      ? { ...structuredClone(mark), end: mark.end + insertedLength }
      : {
          ...structuredClone(mark),
          start: mark.start + insertedLength,
          end: mark.end + insertedLength,
        };
  }
  if (offset === mark.end) {
    const expands =
      mark.boundaryPolicy === "end" || mark.boundaryPolicy === "both";
    return expands
      ? { ...structuredClone(mark), end: mark.end + insertedLength }
      : structuredClone(mark);
  }
  return { ...structuredClone(mark), end: mark.end + insertedLength };
}

function transformMarkForDeletion(
  mark: FormattingMark,
  start: number,
  end: number,
): FormattingMark | undefined {
  const transform = (position: number): number => {
    if (position <= start) {
      return position;
    }
    if (position >= end) {
      return position - (end - start);
    }
    return start;
  };
  const next = {
    ...structuredClone(mark),
    start: transform(mark.start),
    end: transform(mark.end),
  };
  return next.end > next.start ? next : undefined;
}

function validateBase(base: InlineContentValue): ContentEditResult | undefined {
  const validation = validateInlineContentValue(base);
  return validation.ok
    ? undefined
    : failure("InvalidBase", validation.error.message);
}

function validatedResult(candidate: InlineContentValue): ContentEditResult {
  const detached = cloneInlineContentValue(candidate);
  const validation = validateInlineContentValue(detached);
  return validation.ok
    ? { ok: true, value: detached }
    : failure("InvalidResult", validation.error.message);
}

function isRange(start: number, end: number, length: number): boolean {
  return (
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    end >= start &&
    end <= length
  );
}

function failure(
  kind: ContentEditErrorKind,
  message: string,
): Extract<ContentEditResult, { readonly ok: false }> {
  return { ok: false, error: { kind, message } };
}
