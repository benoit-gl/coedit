import { parseDocumentId } from "../../../src/domain/index.js";
import type { DocumentId } from "../../../src/domain/index.js";
import type {
  QualificationOrigin,
  QualificationTextSpan,
} from "../payload/carrier.js";
import type { EditorTextBuffer } from "./semanticText.js";
import { sliceAttributedText } from "./semanticText.js";

/** Qualification candidate only: no frozen private clipboard format or guard. */
export const STEP3_PRIVATE_CLIPBOARD_TYPE =
  "application/x-coedit-fragment+json";

/** Configurable fixture limits. Gate B owns any selected admission values. */
export interface PrivateClipboardLimits {
  /** Maximum encoded JSON string length in UTF-16 code units. */
  readonly maxEncodedLength: number;
  /** Maximum attributed pieces after decoding. */
  readonly maxSpans: number;
  /** Maximum combined native text length. */
  readonly maxTextLength: number;
}

/** Private clipboard result, with Origin provenance only when validated. */
export interface ClipboardText {
  /** Native string to insert, or ordinary plain-text fallback. */
  readonly text: string;
  /** Exact text pieces with trusted or imported attribution. */
  readonly spans: readonly QualificationTextSpan[];
  /** Whether the validated same-document private data was accepted. */
  readonly privateOriginPreserved: boolean;
  /** Qualification-only source relationship, when private data was trusted. */
  readonly source?: {
    readonly kind: "copy";
    readonly reference: string;
  };
}

/** Serialize a same-document copy using source Origin without editor metadata. */
export function encodePrivateClipboard(
  buffer: EditorTextBuffer,
  start: number,
  end: number,
  documentId: DocumentId,
  sourceReference: string,
): { readonly plainText: string; readonly privateText: string } {
  if (typeof sourceReference !== "string" || sourceReference.length === 0)
    throw new TypeError("Clipboard source reference is invalid.");
  const spans = sliceAttributedText(buffer, start, end);
  const text = buffer.text.slice(start, end);
  return {
    plainText: text,
    privateText: JSON.stringify({
      formatVersion: 1,
      documentId,
      sourceReference,
      spans: spans.map((span) => ({
        text: span.text,
        origin: { id: span.origin.id, kind: span.origin.kind },
      })),
    }),
  };
}

/**
 * Read hostile private clipboard data without disabling ordinary text paste.
 *
 * On invalid, oversized, cross-document, or unresolved private input, use only
 * the plain-text fallback with caller-supplied imported or unknown Origin.
 * The catalog must come from the target carrier, never from clipboard data.
 */
export function decodePrivateClipboard(
  privateText: string | undefined,
  plainText: string,
  targetDocumentId: DocumentId,
  originCatalog: ReadonlyMap<string, QualificationOrigin>,
  fallbackOrigin: QualificationOrigin,
  limits: PrivateClipboardLimits,
): ClipboardText {
  if (typeof plainText !== "string")
    throw new TypeError("Plain clipboard text must be native text.");
  assertLimits(limits);
  const fallback = (): ClipboardText => ({
    text: plainText,
    spans:
      plainText === ""
        ? []
        : [{ text: plainText, origin: { ...fallbackOrigin } }],
    privateOriginPreserved: false,
  });
  if (
    privateText === undefined ||
    typeof privateText !== "string" ||
    privateText.length > limits.maxEncodedLength
  )
    return fallback();
  try {
    const value: unknown = JSON.parse(privateText);
    if (!isObject(value)) return fallback();
    if (
      value.formatVersion !== 1 ||
      typeof value.documentId !== "string" ||
      parseDocumentId(value.documentId) !== targetDocumentId ||
      typeof value.sourceReference !== "string" ||
      value.sourceReference.length === 0 ||
      !Array.isArray(value.spans) ||
      value.spans.length > limits.maxSpans
    )
      return fallback();
    let combined = "";
    const spans: QualificationTextSpan[] = [];
    for (const part of value.spans as readonly unknown[]) {
      if (!isObject(part) || typeof part.text !== "string") return fallback();
      if (
        combined.length + part.text.length > limits.maxTextLength ||
        part.text.length === 0 ||
        !isObject(part.origin) ||
        typeof part.origin.id !== "string" ||
        typeof part.origin.kind !== "string"
      )
        return fallback();
      const catalogOrigin = originCatalog.get(part.origin.id);
      if (
        catalogOrigin === undefined ||
        catalogOrigin.kind !== part.origin.kind
      )
        return fallback();
      combined += part.text;
      spans.push({ text: part.text, origin: { ...catalogOrigin } });
    }
    if (combined !== plainText || combined.length > limits.maxTextLength)
      return fallback();
    return {
      text: combined,
      spans,
      privateOriginPreserved: true,
      source: { kind: "copy", reference: value.sourceReference },
    };
  } catch {
    return fallback();
  }
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertLimits(limits: PrivateClipboardLimits): void {
  for (const value of [
    limits.maxEncodedLength,
    limits.maxSpans,
    limits.maxTextLength,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new TypeError(
        "Clipboard fixture limits must be nonnegative integers.",
      );
  }
}
