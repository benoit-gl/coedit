import type {
  BlockId,
  ContributionId,
  ContributorId,
  InlineContentId,
  OriginId,
} from "./ids.js";
import { isCanonicalUuidV4 } from "./ids.js";

const MAX_OPAQUE_LINK_BYTES = 8_192;
const MAX_OPAQUE_LINK_DEPTH = 8;

/** Classifies the source that first created one logical content unit. */
export type OriginKind = "human" | "imported" | "automation" | "ai" | "unknown";

/** Immutable attribution for one authorship or source event. */
export interface OriginRecord {
  /** Stable document-scoped Origin identity. */
  readonly id: OriginId;
  /** Durable identity of the creating agent or source representative. */
  readonly agentId: ContributorId;
  /** Source category used by provenance projection. */
  readonly kind: OriginKind;
  /** Contribution that first published this Origin. */
  readonly createdBy: ContributionId;
}

/** One visible text run that has exactly one protected Origin. */
export interface TextContentItem {
  /** Selects visible text. */
  readonly kind: "text";
  /** Non-empty text without hard-break characters. */
  readonly text: string;
  /** Protected Origin for every UTF-16 code unit in this run. */
  readonly originId: OriginId;
}

/** One hard break that has exactly one protected Origin. */
export interface HardBreakContentItem {
  /** Selects a hard break. */
  readonly kind: "hardBreak";
  /** Protected Origin for this hard break. */
  readonly originId: OriginId;
}

/** One carrier-neutral logical content item. */
export type ContentItem = TextContentItem | HardBreakContentItem;

/** Controls whether inserted content joins a mark at either boundary. */
export type MarkBoundaryPolicy = "none" | "start" | "end" | "both";

/** Closed initial intrinsic formatting vocabulary. */
export type FormattingMarkKind =
  "bold" | "italic" | "underline" | "strikethrough" | "inlineCode" | "link";

/** Bounded JSON-like value that the document model preserves without interpretation. */
export type OpaqueLinkValue =
  | null
  | boolean
  | number
  | string
  | readonly OpaqueLinkValue[]
  | { readonly [key: string]: OpaqueLinkValue };

/** Opaque serialized cursor value owned by one carrier adapter. */
export type StableRangeCursor = string;

/** Optional passage refinement inside the Block named by an internal link. */
export interface InternalLinkRange {
  /** InlineContent that owns the target passage. */
  readonly inlineContentId: InlineContentId;
  /** Stable carrier cursor for the start boundary. */
  readonly startCursor: StableRangeCursor;
  /** Stable carrier cursor for the end boundary. */
  readonly endCursor: StableRangeCursor;
  /** Cursor affinity for the start boundary. */
  readonly startAffinity: "before" | "after";
  /** Cursor affinity for the end boundary. */
  readonly endAffinity: "before" | "after";
  /** Quote and context evidence used when stable cursors do not resolve. */
  readonly quote: {
    /** Exact visible target text. */
    readonly exact: string;
    /** Visible context immediately before the target. */
    readonly prefix: string;
    /** Visible context immediately after the target. */
    readonly suffix: string;
  };
  /** Optional fallback offset hint. It is not authoritative. */
  readonly approximatePosition?: {
    /** Approximate start offset. */
    readonly start: number;
    /** Approximate end offset. */
    readonly end: number;
  };
}

/** Inert presentation-owned link target. */
export interface OpaqueLinkTarget {
  /** Selects opaque presentation metadata. */
  readonly kind: "opaque";
  /** Bounded metadata preserved exactly by the document engine. */
  readonly metadata: OpaqueLinkValue;
}

/** Typed same-document Block link with an optional passage refinement. */
export interface InternalBlockLinkTarget {
  /** Selects a document-local Block target. */
  readonly kind: "block";
  /** Primary durable target Block. */
  readonly blockId: BlockId;
  /** Optional passage refinement inside the target Block. */
  readonly range?: InternalLinkRange;
}

/** Target carried by an intrinsic link mark. */
export type LinkTarget = OpaqueLinkTarget | InternalBlockLinkTarget;

/** One intrinsic formatting span over UTF-16 logical offsets. */
export interface FormattingMark {
  /** Formatting kind. */
  readonly kind: FormattingMarkKind;
  /** Inclusive start offset. */
  readonly start: number;
  /** Exclusive end offset. */
  readonly end: number;
  /** Insertion behavior at the mark boundaries. */
  readonly boundaryPolicy: MarkBoundaryPolicy;
  /** Required only for a link mark. */
  readonly target?: LinkTarget;
}

/** Detached carrier-neutral canonical CollaborativeContent value. */
export interface InlineContentValue {
  /** Ordered visible text and hard-break runs. */
  readonly items: readonly ContentItem[];
  /** Intrinsic formatting spans over the flattened visible content. */
  readonly marks: readonly FormattingMark[];
  /** Immutable Origin records referenced by live items. */
  readonly origins: readonly OriginRecord[];
}

/** Stable classification for content validation failure. */
export type ContentValidationErrorKind =
  | "InvalidId"
  | "DuplicateOrigin"
  | "MissingOrigin"
  | "InvalidItem"
  | "InvalidMark"
  | "InvalidLinkTarget"
  | "LimitExceeded";

/** Expected carrier-neutral content validation failure. */
export interface ContentValidationError {
  /** Stable machine-readable failure kind. */
  readonly kind: ContentValidationErrorKind;
  /** Human-readable diagnostic detail. */
  readonly message: string;
}

/** Result of complete CollaborativeContent validation. */
export type ContentValidationResult =
  | {
      /** Indicates valid canonical content. */
      readonly ok: true;
      /** Validated detached content value. */
      readonly value: InlineContentValue;
    }
  | {
      /** Indicates an expected validation rejection. */
      readonly ok: false;
      /** Stable validation failure detail. */
      readonly error: ContentValidationError;
    };

/** Creates a detached valid empty CollaborativeContent value. */
export function createEmptyInlineContentValue(): InlineContentValue {
  return Object.freeze({ items: [], marks: [], origins: [] });
}

/** Returns the logical UTF-16 offset length. A hard break occupies one offset. */
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
  const origins = new Set<string>();
  for (const origin of value.origins) {
    if (
      !isCanonicalUuidV4(origin.id) ||
      !isCanonicalUuidV4(origin.agentId) ||
      !isCanonicalUuidV4(origin.createdBy)
    ) {
      return failure(
        "InvalidId",
        "Origin records require canonical UUID-v4 IDs.",
      );
    }
    if (origins.has(origin.id)) {
      return failure(
        "DuplicateOrigin",
        "Origin IDs must be unique in content.",
      );
    }
    origins.add(origin.id);
  }

  let textLength = 0;
  for (const item of value.items) {
    if (!isCanonicalUuidV4(item.originId) || !origins.has(item.originId)) {
      return failure(
        "MissingOrigin",
        "Every live content item needs a valid Origin.",
      );
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
  }

  for (const mark of value.marks) {
    if (
      !Number.isSafeInteger(mark.start) ||
      !Number.isSafeInteger(mark.end) ||
      mark.start < 0 ||
      mark.end <= mark.start ||
      mark.end > textLength
    ) {
      return failure(
        "InvalidMark",
        "Formatting mark range is outside content.",
      );
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
  return structuredClone(value);
}

function validateLinkTarget(
  target: LinkTarget,
): ContentValidationError | undefined {
  if (target.kind === "opaque") {
    if (!isOpaqueValue(target.metadata, 0)) {
      return error(
        "InvalidLinkTarget",
        "Opaque link metadata is not a bounded JSON-like value.",
      );
    }
    const encoded = JSON.stringify(target.metadata);
    if (new TextEncoder().encode(encoded).byteLength > MAX_OPAQUE_LINK_BYTES) {
      return error(
        "LimitExceeded",
        "Opaque link metadata exceeds its byte limit.",
      );
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

function isOpaqueValue(
  value: unknown,
  depth: number,
): value is OpaqueLinkValue {
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
  const record = value as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(record)) {
    const entry = record[key];
    if (key.length === 0 || !isOpaqueValue(entry, depth + 1)) {
      return false;
    }
  }
  return true;
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
