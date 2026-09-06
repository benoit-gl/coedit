import type {
  BlockId,
  ContributionId,
  ContributorId,
  OriginId,
} from "./ids.js";
import { isCanonicalUuidV4 } from "./ids.js";

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

/** Controls whether inserted content joins a mark at either boundary. */
export type MarkBoundaryPolicy = "none" | "start" | "end" | "both";

/** Closed initial intrinsic formatting vocabulary. */
export type FormattingMarkKind =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "inlineCode"
  | "link";

/** JSON-like value that the document model preserves without interpretation. */
export type OpaqueLinkValue =
  | null
  | boolean
  | number
  | string
  | readonly OpaqueLinkValue[]
  | { readonly [key: string]: OpaqueLinkValue };

/** Inert presentation-owned link target. */
export interface OpaqueLinkTarget {
  /** Selects opaque presentation metadata. */
  readonly kind: "opaque";
  /** Metadata preserved exactly by the document engine. */
  readonly metadata: OpaqueLinkValue;
}

/**
 * Typed same-document Block link used during Step 3 carrier qualification.
 *
 * @remarks
 * `blockId` is the primary durable target. The accepted model also permits an
 * optional durable Range refinement, but Step 6 owns the Range representation
 * and internal-link Range encoding. Step 3 therefore does not freeze a Range
 * value into this carrier-neutral link shape. Range feasibility is qualified
 * separately through the candidate-neutral carrier APIs.
 */
export interface InternalBlockLinkTarget {
  /** Selects a document-local Block target. */
  readonly kind: "block";
  /** Primary durable target Block. */
  readonly blockId: BlockId;
}

/** Target carried by an intrinsic link mark. */
export type LinkTarget = OpaqueLinkTarget | InternalBlockLinkTarget;

/** One intrinsic formatting descriptor with no document-level numeric range. */
export interface FormattingMark {
  /** Formatting kind. */
  readonly kind: FormattingMarkKind;
  /** Insertion behavior at the logical mark boundaries. */
  readonly boundaryPolicy: MarkBoundaryPolicy;
  /** Required only for a link mark. */
  readonly target?: LinkTarget;
}

/** One visible text run with one protected Origin and one formatting set. */
export interface TextContentItem {
  /** Selects visible text. */
  readonly kind: "text";
  /** Non-empty authored Unicode text without hard-break characters. */
  readonly text: string;
  /** Protected Origin for this attributed run. */
  readonly originId: OriginId;
  /** Intrinsic formatting active for the complete attributed run. */
  readonly marks: readonly FormattingMark[];
}

/** One hard break with one protected Origin and one formatting set. */
export interface HardBreakContentItem {
  /** Selects a hard break. */
  readonly kind: "hardBreak";
  /** Protected Origin for this hard break. */
  readonly originId: OriginId;
  /** Intrinsic formatting active for this hard break. */
  readonly marks: readonly FormattingMark[];
}

/** One carrier-neutral attributed content run. */
export type ContentItem = TextContentItem | HardBreakContentItem;

/** Detached carrier-neutral canonical CollaborativeContent value. */
export interface InlineContentValue {
  /** Ordered attributed text runs and hard breaks. */
  readonly items: readonly ContentItem[];
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
  | "InvalidLinkTarget";

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
  return Object.freeze({ items: [], origins: [] });
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
    } else if (item.kind !== "hardBreak") {
      return failure("InvalidItem", "Unknown content item kind.");
    }

    for (const mark of item.marks) {
      const markError = validateFormattingMark(mark);
      if (markError !== undefined) {
        return { ok: false, error: markError };
      }
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

/** Validates one range-free intrinsic formatting descriptor. */
export function validateFormattingMark(
  mark: FormattingMark,
): ContentValidationError | undefined {
  if (
    mark.kind !== "bold" &&
    mark.kind !== "italic" &&
    mark.kind !== "underline" &&
    mark.kind !== "strikethrough" &&
    mark.kind !== "inlineCode" &&
    mark.kind !== "link"
  ) {
    return error("InvalidMark", "Unknown formatting mark kind.");
  }
  if (
    mark.boundaryPolicy !== "none" &&
    mark.boundaryPolicy !== "start" &&
    mark.boundaryPolicy !== "end" &&
    mark.boundaryPolicy !== "both"
  ) {
    return error("InvalidMark", "Formatting boundary policy is invalid.");
  }
  if (mark.kind === "link") {
    if (mark.target === undefined) {
      return error("InvalidLinkTarget", "Link marks require one target.");
    }
    return validateLinkTarget(mark.target);
  }
  return mark.target === undefined
    ? undefined
    : error("InvalidMark", "Only link marks can carry a target.");
}

function validateLinkTarget(
  target: LinkTarget,
): ContentValidationError | undefined {
  if (target.kind === "opaque") {
    return isOpaqueValue(target.metadata)
      ? undefined
      : error(
          "InvalidLinkTarget",
          "Opaque link metadata must be an acyclic JSON-like value.",
        );
  }

  return isCanonicalUuidV4(target.blockId)
    ? undefined
    : error(
        "InvalidLinkTarget",
        "Internal links require a canonical BlockId.",
      );
}

function isOpaqueValue(value: unknown): value is OpaqueLinkValue {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (
      current === null ||
      typeof current === "boolean" ||
      typeof current === "string"
    ) {
      continue;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        return false;
      }
      continue;
    }
    if (typeof current !== "object") {
      return false;
    }
    if (seen.has(current)) {
      return false;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }

    const prototype = Object.getPrototypeOf(current) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    const record = current as Readonly<Record<string, unknown>>;
    for (const key of Object.keys(record)) {
      if (key.length === 0) {
        return false;
      }
      pending.push(record[key]);
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
