import type {
  BlockId,
  ContributionId,
  ContributorId,
  InlineContentId,
  OriginId,
} from "./ids.js";
import { isCanonicalUuidV4 } from "./ids.js";

const MAX_ITEMS = 100_000;
const MAX_MARKS = 100_000;
const MAX_ORIGINS = 50_000;
const MAX_TEXT_LENGTH = 100_000;
const MAX_OPAQUE_LINK_BYTES = 8_192;
const MAX_OPAQUE_LINK_DEPTH = 8;

export type OriginKind = "human" | "imported" | "automation" | "ai" | "unknown";

export interface OriginRecord {
  readonly id: OriginId;
  readonly agentId: ContributorId;
  readonly kind: OriginKind;
  readonly createdBy: ContributionId;
}

export interface TextContentItem {
  readonly kind: "text";
  readonly text: string;
  readonly originId: OriginId;
}

export interface HardBreakContentItem {
  readonly kind: "hardBreak";
  readonly originId: OriginId;
}

export type ContentItem = TextContentItem | HardBreakContentItem;
export type MarkBoundaryPolicy = "none" | "start" | "end" | "both";
export type FormattingMarkKind =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "inlineCode"
  | "link";

export type OpaqueLinkValue =
  | null
  | boolean
  | number
  | string
  | readonly OpaqueLinkValue[]
  | { readonly [key: string]: OpaqueLinkValue };

export type StableRangeCursor = string;

export interface InternalLinkRange {
  readonly inlineContentId: InlineContentId;
  readonly startCursor: StableRangeCursor;
  readonly endCursor: StableRangeCursor;
  readonly startAffinity: "before" | "after";
  readonly endAffinity: "before" | "after";
  readonly quote: {
    readonly exact: string;
    readonly prefix: string;
    readonly suffix: string;
  };
  readonly approximatePosition?: {
    readonly start: number;
    readonly end: number;
  };
}

export interface OpaqueLinkTarget {
  readonly kind: "opaque";
  readonly metadata: OpaqueLinkValue;
}

export interface InternalBlockLinkTarget {
  readonly kind: "block";
  readonly blockId: BlockId;
  readonly range?: InternalLinkRange;
}

export type LinkTarget = OpaqueLinkTarget | InternalBlockLinkTarget;

export interface FormattingMark {
  readonly kind: FormattingMarkKind;
  readonly start: number;
  readonly end: number;
  readonly boundaryPolicy: MarkBoundaryPolicy;
  readonly target?: LinkTarget;
}

export interface InlineContentValue {
  readonly items: readonly ContentItem[];
  readonly marks: readonly FormattingMark[];
  readonly origins: readonly OriginRecord[];
}

export type ContentValidationErrorKind =
  | "InvalidId"
  | "DuplicateOrigin"
  | "MissingOrigin"
  | "InvalidItem"
  | "InvalidMark"
  | "InvalidLinkTarget"
  | "LimitExceeded";

export interface ContentValidationError {
  readonly kind: ContentValidationErrorKind;
  readonly message: string;
}

export type ContentValidationResult =
  | { readonly ok: true; readonly value: InlineContentValue }
  | { readonly ok: false; readonly error: ContentValidationError };

/** Creates a detached valid empty CollaborativeContent value. */
export function createEmptyInlineContentValue(): InlineContentValue {
  return Object.freeze({ items: [], marks: [], origins: [] });
}

/** Returns the logical offset length. A hard break occupies one offset. */
export function contentLength(value: InlineContentValue): number {
  let length = 0;
  for (const item of value.items) {
    length += item.kind === "text" ? item.text.length : 1;
  }
  return length;
}

/** Validates the complete detached canonical value without mutation. */
export function validateInlineContentValue(
  value: InlineContentValue,
): ContentValidationResult {
  if (
    value.items.length > MAX_ITEMS ||
    value.marks.length > MAX_MARKS ||
    value.origins.length > MAX_ORIGINS
  ) {
    return failure("LimitExceeded", "CollaborativeContent exceeds item limits.");
  }

  const origins = new Set<string>();
  for (const origin of value.origins) {
    if (
      !isCanonicalUuidV4(origin.id) ||
      !isCanonicalUuidV4(origin.agentId) ||
      !isCanonicalUuidV4(origin.createdBy)
    ) {
      return failure("InvalidId", "Origin records require canonical UUID-v4 IDs.");
    }
    if (origins.has(origin.id)) {
      return failure("DuplicateOrigin", "Origin IDs must be unique in content.");
    }
    origins.add(origin.id);
  }

  let textLength = 0;
  for (const item of value.items) {
    if (!isCanonicalUuidV4(item.originId) || !origins.has(item.originId)) {
      return failure("MissingOrigin", "Every live content item needs a valid Origin.");
    }
    if (item.kind === "text") {
      if (
        item.text.length === 0 ||
        item.text.includes("\n") ||
        item.text.includes("\r")
      ) {
        return failure(
          "InvalidItem",
          "Text items must be non-empty and contain no hard-break characters.",
        );
      }
      textLength += item.text.length;
    } else if (item.kind === "hardBreak") {
      textLength += 1;
    } else {
      return failure("InvalidItem", "Unknown content item kind.");
    }
    if (textLength > MAX_TEXT_LENGTH) {
      return failure("LimitExceeded", "CollaborativeContent exceeds the text limit.");
    }
  }

  for (const mark of value.marks) {
    if (
      !Number.isSafeInteger(mark.start) ||
      !Number.isSafeInteger(mark.end) ||
      mark.start < 0 ||
      mark.end <= mark.start ||
      mark.end > textLength
    ) {
      return failure("InvalidMark", "Formatting mark range is outside content.");
    }
    if (mark.kind === "link") {
      if (mark.target === undefined) {
        return failure("InvalidLinkTarget", "Link marks require one target.");
      }
      const targetError = validateLinkTarget(mark.target);
      if (targetError !== undefined) {
        return { ok: false, error: targetError };
      }
    } else if (mark.target !== undefined) {
      return failure("InvalidMark", "Only link marks can carry a target.");
    }
  }

  return { ok: true, value };
}

/** Makes a deep detached copy of canonical content. */
export function cloneInlineContentValue(
  value: InlineContentValue,
): InlineContentValue {
  return structuredClone(value) as InlineContentValue;
}

function validateLinkTarget(target: LinkTarget): ContentValidationError | undefined {
  if (target.kind === "opaque") {
    if (!isOpaqueValue(target.metadata, 0)) {
      return error(
        "InvalidLinkTarget",
        "Opaque link metadata is not a bounded JSON-like value.",
      );
    }
    const encoded = JSON.stringify(target.metadata);
    if (new TextEncoder().encode(encoded).byteLength > MAX_OPAQUE_LINK_BYTES) {
      return error("LimitExceeded", "Opaque link metadata exceeds its byte limit.");
    }
    return undefined;
  }

  if (!isCanonicalUuidV4(target.blockId)) {
    return error(
      "InvalidLinkTarget",
      "Internal links require a canonical BlockId.",
    );
  }
  const range = target.range;
  if (range === undefined) {
    return undefined;
  }
  if (
    !isCanonicalUuidV4(range.inlineContentId) ||
    range.startCursor.length === 0 ||
    range.endCursor.length === 0
  ) {
    return error(
      "InvalidLinkTarget",
      "Internal-link range identity and cursors are invalid.",
    );
  }
  if (range.approximatePosition !== undefined) {
    const { start, end } = range.approximatePosition;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start
    ) {
      return error(
        "InvalidLinkTarget",
        "Internal-link approximate range is invalid.",
      );
    }
  }
  return undefined;
}

function isOpaqueValue(value: OpaqueLinkValue, depth: number): boolean {
  if (depth > MAX_OPAQUE_LINK_DEPTH) {
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
  return Object.entries(value).every(
    ([key, entry]) => key.length > 0 && isOpaqueValue(entry, depth + 1),
  );
}

function error(
  kind: ContentValidationErrorKind,
  message: string,
): ContentValidationError {
  return { kind, message };
}

function failure(
  kind: ContentValidationErrorKind,
  message: string,
): Extract<ContentValidationResult, { readonly ok: false }> {
  return { ok: false, error: error(kind, message) };
}
