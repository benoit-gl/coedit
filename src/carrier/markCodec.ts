import type {
  FormattingMark,
  FormattingMarkKind,
  LinkTarget,
  MarkBoundaryPolicy,
  OpaqueLinkValue,
} from "../domain/content.js";
import { isCanonicalUuidV4 } from "../domain/ids.js";

const MARK_PREFIX = "coedit:mark:";

/** Carrier-private semantic descriptor encoded in one independent mark key. */
export interface EncodedMarkDescriptor {
  /** Intrinsic formatting kind. */
  readonly kind: FormattingMarkKind;
  /** Canonical insertion-boundary behavior. */
  readonly boundaryPolicy: MarkBoundaryPolicy;
  /** Link target when the descriptor represents a link. */
  readonly target?: LinkTarget;
}

/** Encodes one semantic formatting descriptor as an independent carrier key. */
export function encodeMarkKey(mark: FormattingMark): string {
  const descriptor: EncodedMarkDescriptor = {
    kind: mark.kind,
    boundaryPolicy: mark.boundaryPolicy,
    ...(mark.target === undefined ? {} : { target: mark.target }),
  };
  return MARK_PREFIX + encodeURIComponent(JSON.stringify(descriptor));
}

/** Decodes and validates one private semantic formatting carrier key. */
export function decodeMarkKey(key: string): EncodedMarkDescriptor | undefined {
  if (!key.startsWith(MARK_PREFIX)) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(key.slice(MARK_PREFIX.length)));
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) {
    return undefined;
  }
  const kind = parsed.kind;
  const boundaryPolicy = parsed.boundaryPolicy;
  if (!isFormattingMarkKind(kind) || !isBoundaryPolicy(boundaryPolicy)) {
    return undefined;
  }
  const targetValue = parsed.target;
  if (targetValue === undefined) {
    return kind === "link" ? undefined : { kind, boundaryPolicy };
  }
  if (kind !== "link" || !isLinkTarget(targetValue)) {
    return undefined;
  }
  return { kind, boundaryPolicy, target: targetValue };
}

/** Tests whether an insertion at one offset inherits a formatting mark. */
export function markAppliesAtInsertion(
  mark: FormattingMark,
  offset: number,
): boolean {
  if (offset > mark.start && offset < mark.end) {
    return true;
  }
  if (offset === mark.start) {
    return mark.boundaryPolicy === "start" || mark.boundaryPolicy === "both";
  }
  if (offset === mark.end) {
    return mark.boundaryPolicy === "end" || mark.boundaryPolicy === "both";
  }
  return false;
}

function isFormattingMarkKind(value: unknown): value is FormattingMarkKind {
  return (
    value === "bold" ||
    value === "italic" ||
    value === "underline" ||
    value === "strikethrough" ||
    value === "inlineCode" ||
    value === "link"
  );
}

function isBoundaryPolicy(value: unknown): value is MarkBoundaryPolicy {
  return (
    value === "none" || value === "start" || value === "end" || value === "both"
  );
}

function isLinkTarget(value: unknown): value is LinkTarget {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === "opaque") {
    return isOpaqueValue(value.metadata, 0);
  }
  if (
    value.kind !== "block" ||
    typeof value.blockId !== "string" ||
    !isCanonicalUuidV4(value.blockId)
  ) {
    return false;
  }
  const range = value.range;
  if (range === undefined) {
    return true;
  }
  if (!isRecord(range)) {
    return false;
  }
  return (
    typeof range.inlineContentId === "string" &&
    isCanonicalUuidV4(range.inlineContentId) &&
    typeof range.startCursor === "string" &&
    range.startCursor.length > 0 &&
    typeof range.endCursor === "string" &&
    range.endCursor.length > 0 &&
    (range.startAffinity === "before" || range.startAffinity === "after") &&
    (range.endAffinity === "before" || range.endAffinity === "after") &&
    isQuote(range.quote) &&
    isApproximatePosition(range.approximatePosition)
  );
}

function isQuote(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.exact === "string" &&
    typeof value.prefix === "string" &&
    typeof value.suffix === "string"
  );
}

function isApproximatePosition(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      Number.isSafeInteger(value.start) &&
      Number.isSafeInteger(value.end) &&
      typeof value.start === "number" &&
      typeof value.end === "number" &&
      value.start >= 0 &&
      value.end >= value.start)
  );
}

function isOpaqueValue(
  value: unknown,
  depth: number,
): value is OpaqueLinkValue {
  if (depth > 8) {
    return false;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isOpaqueValue(entry, depth + 1));
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([key, entry]) => key.length > 0 && isOpaqueValue(entry, depth + 1),
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
