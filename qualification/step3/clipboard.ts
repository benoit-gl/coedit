import type {
  InlineContentValue,
  OriginRecord,
} from "../../src/domain/content.js";
import { validateInlineContentValue } from "../../src/domain/content.js";
import type { DocumentId } from "../../src/domain/ids.js";
import { parseDocumentId } from "../../src/domain/ids.js";

/** Private clipboard MIME type accepted by the Step 3 qualification fixture. */
export const coeditFragmentMimeType = "application/x-coedit-fragment+json";

/** Current qualification-only private fragment format version. */
export const coeditFragmentFormatVersion = 1;

/** Private same-document fragment used only to qualify clipboard semantics. */
export interface CoeditQualificationFragment {
  /** Version of this qualification-only private payload. */
  readonly formatVersion: 1;
  /** Source document whose Origins and internal Block links can be preserved. */
  readonly sourceDocumentId: DocumentId;
  /** Opaque source Version token captured by the caller. */
  readonly sourceVersion: string;
  /** Detached canonical attributed content copied by the browser adapter. */
  readonly content: InlineContentValue;
}

/** Result of validating an untrusted private clipboard payload. */
export type CoeditQualificationFragmentParseResult =
  | { readonly ok: true; readonly value: CoeditQualificationFragment }
  | { readonly ok: false; readonly reason: string };

/** Candidate resource guards applied before a private clipboard fragment is used. */
export interface CoeditQualificationClipboardGuards {
  /** Maximum UTF-8 size accepted before JSON decoding. */
  readonly maxEncodedBytes: number;
  /** Maximum object and array nodes inspected after decoding. */
  readonly maxDecodedNodes: number;
  /** Maximum object and array nesting depth inspected after decoding. */
  readonly maxNestingDepth: number;
  /** Maximum attributed content items in one fragment. */
  readonly maxItems: number;
  /** Maximum Origin records in one fragment. */
  readonly maxOrigins: number;
}

/** Ordinary clipboard representations that remain available after private-data failure. */
export interface CoeditQualificationClipboardFallback {
  /** Sanitized supported HTML, when the browser boundary produced it. */
  readonly sanitizedHtml?: string;
  /** Plain visible text, when the clipboard produced it. */
  readonly plainText?: string;
}

/** Result of routing a private clipboard representation with ordinary fallback. */
export type CoeditQualificationClipboardRoute =
  | { readonly kind: "private"; readonly fragment: CoeditQualificationFragment }
  | {
      readonly kind: "html";
      readonly sanitizedHtml: string;
      readonly privateFailure?: string;
    }
  | {
      readonly kind: "text";
      readonly plainText: string;
      readonly privateFailure?: string;
    }
  | { readonly kind: "unavailable"; readonly privateFailure?: string };

/** Encodes a validated private fragment for browser clipboard qualification. */
export function encodeCoeditQualificationFragment(
  fragment: CoeditQualificationFragment,
): string {
  const validation = validateInlineContentValue(fragment.content);
  if (!validation.ok) {
    throw new TypeError(validation.error.message);
  }
  if (fragment.sourceVersion.length === 0) {
    throw new TypeError("Clipboard source Version token must be non-empty.");
  }
  return JSON.stringify(fragment);
}

/** Parses and validates an untrusted private fragment without applying it. */
export function parseCoeditQualificationFragment(
  encoded: string,
  guards?: CoeditQualificationClipboardGuards,
): CoeditQualificationFragmentParseResult {
  if (guards !== undefined) {
    assertValidGuards(guards);
    if (new TextEncoder().encode(encoded).byteLength > guards.maxEncodedBytes) {
      return {
        ok: false,
        reason: "Private clipboard payload is over the encoded-size guard.",
      };
    }
  }
  let value: unknown;
  try {
    value = JSON.parse(encoded) as unknown;
  } catch {
    return {
      ok: false,
      reason: "Private clipboard payload is not valid JSON.",
    };
  }
  if (guards !== undefined) {
    const complexity = inspectDecodedComplexity(value, guards);
    if (complexity !== undefined) {
      return { ok: false, reason: complexity };
    }
  }
  if (!isRecord(value) || value.formatVersion !== coeditFragmentFormatVersion) {
    return {
      ok: false,
      reason: "Private clipboard format version is unsupported.",
    };
  }
  if (
    typeof value.sourceDocumentId !== "string" ||
    typeof value.sourceVersion !== "string" ||
    value.sourceVersion.length === 0 ||
    !isRecord(value.content)
  ) {
    return { ok: false, reason: "Private clipboard payload shape is invalid." };
  }

  let sourceDocumentId: DocumentId;
  try {
    sourceDocumentId = parseDocumentId(value.sourceDocumentId);
  } catch {
    return {
      ok: false,
      reason: "Private clipboard source DocumentId is invalid.",
    };
  }

  const content = value.content as unknown as InlineContentValue;
  const validation = validateInlineContentValue(content);
  if (!validation.ok) {
    return { ok: false, reason: validation.error.message };
  }
  if (
    guards !== undefined &&
    (content.items.length > guards.maxItems ||
      content.origins.length > guards.maxOrigins)
  ) {
    return {
      ok: false,
      reason: "Private clipboard payload is over a collection guard.",
    };
  }

  return {
    ok: true,
    value: {
      formatVersion: coeditFragmentFormatVersion,
      sourceDocumentId,
      sourceVersion: value.sourceVersion,
      content,
    },
  };
}

/** Selects private semantic content or the best ordinary clipboard fallback. */
export function routeCoeditQualificationClipboard(
  encodedPrivate: string | undefined,
  fallback: CoeditQualificationClipboardFallback,
  guards: CoeditQualificationClipboardGuards,
): CoeditQualificationClipboardRoute {
  let privateFailure: string | undefined;
  if (encodedPrivate !== undefined) {
    const parsed = parseCoeditQualificationFragment(encodedPrivate, guards);
    if (parsed.ok) {
      return { kind: "private", fragment: parsed.value };
    }
    privateFailure = parsed.reason;
  }
  const failure = privateFailure === undefined ? {} : { privateFailure };
  if (fallback.sanitizedHtml !== undefined) {
    return {
      kind: "html",
      sanitizedHtml: fallback.sanitizedHtml,
      ...failure,
    };
  }
  if (fallback.plainText !== undefined) {
    return { kind: "text", plainText: fallback.plainText, ...failure };
  }
  return { kind: "unavailable", ...failure };
}

/** Returns whether a private fragment can preserve Origins in the target document. */
export function canPreservePrivateFragmentOrigins(
  fragment: CoeditQualificationFragment,
  targetDocumentId: DocumentId,
  resolveOrigin: (origin: OriginRecord) => OriginRecord | undefined,
): boolean {
  if (fragment.sourceDocumentId !== targetDocumentId) {
    return false;
  }
  return fragment.content.origins.every((origin) => {
    const resolved = resolveOrigin(origin);
    return resolved !== undefined && equivalentOrigin(resolved, origin);
  });
}

function equivalentOrigin(left: OriginRecord, right: OriginRecord): boolean {
  return (
    left.id === right.id &&
    left.agentId === right.agentId &&
    left.kind === right.kind &&
    left.createdBy === right.createdBy
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertValidGuards(guards: CoeditQualificationClipboardGuards): void {
  for (const value of Object.values(guards)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError("Clipboard guards must be positive safe integers.");
    }
  }
}

function inspectDecodedComplexity(
  value: unknown,
  guards: CoeditQualificationClipboardGuards,
): string | undefined {
  const pending: Array<{ readonly value: unknown; readonly depth: number }> = [
    { value, depth: 0 },
  ];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (typeof current.value !== "object" || current.value === null) {
      continue;
    }
    nodes += 1;
    if (nodes > guards.maxDecodedNodes) {
      return "Private clipboard payload is over the decoded-node guard.";
    }
    if (current.depth > guards.maxNestingDepth) {
      return "Private clipboard payload is over the nesting-depth guard.";
    }
    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value);
    for (const child of children) {
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }
  return undefined;
}
