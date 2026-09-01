import type {
  FormattingMark,
  FormattingMarkKind,
  LinkTarget,
  MarkBoundaryPolicy,
  OpaqueLinkValue,
} from "../domain/content.js";
import { validateFormattingMark } from "../domain/content.js";
import { isCanonicalUuidV4 } from "../domain/ids.js";

const MARK_PREFIX = "coedit:mark:";

/** Encodes one semantic formatting descriptor as an independent carrier key. */
export function encodeMarkKey(mark: FormattingMark): string {
  const validationError = validateFormattingMark(mark);
  if (validationError !== undefined) {
    throw new TypeError(validationError.message);
  }
  return MARK_PREFIX + encodeURIComponent(JSON.stringify(mark));
}

/** Decodes and validates one private semantic formatting carrier key. */
export function decodeMarkKey(key: string): FormattingMark | undefined {
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
  let candidate: FormattingMark;
  if (targetValue === undefined) {
    candidate = { kind, boundaryPolicy };
  } else {
    if (kind !== "link" || !isLinkTarget(targetValue)) {
      return undefined;
    }
    candidate = { kind, boundaryPolicy, target: targetValue };
  }
  return validateFormattingMark(candidate) === undefined
    ? candidate
    : undefined;
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
  return true;
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
