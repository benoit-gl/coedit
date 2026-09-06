import type { InlineContentValue, OriginRecord } from "../../src/domain/content.js";
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
): CoeditQualificationFragmentParseResult {
  let value: unknown;
  try {
    value = JSON.parse(encoded) as unknown;
  } catch {
    return { ok: false, reason: "Private clipboard payload is not valid JSON." };
  }
  if (!isRecord(value) || value.formatVersion !== coeditFragmentFormatVersion) {
    return { ok: false, reason: "Private clipboard format version is unsupported." };
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
    return { ok: false, reason: "Private clipboard source DocumentId is invalid." };
  }

  const content = value.content as unknown as InlineContentValue;
  const validation = validateInlineContentValue(content);
  if (!validation.ok) {
    return { ok: false, reason: validation.error.message };
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
