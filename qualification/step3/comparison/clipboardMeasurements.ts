import { parseDocumentId } from "../../../src/domain/index.js";
import {
  decodePrivateClipboard,
  type ClipboardText,
  type PrivateClipboardLimits,
} from "../editor/clipboard.js";
import type { QualificationTextSpan } from "../payload/carrier.js";

/** One carrier-neutral parser input; both candidates can run this same case. */
export interface ClipboardMeasurementCase {
  /** Fixture name and boundary. */
  readonly name: string;
  /** Private input length in UTF-16 units. */
  readonly encodedLength: number;
  /** Number of private spans in the fixture. */
  readonly spanCount: number;
  /** Plain fallback length in UTF-16 units. */
  readonly textLength: number;
  /** Whether the private fragment should be accepted. */
  readonly expectedPrivate: boolean;
  /** Return a fresh timed operation for the existing bench setup convention. */
  readonly setup: () => () => ClipboardText;
}

const documentId = parseDocumentId("83000000-0000-4000-8000-000000000003");
const original = { id: "benchmark-original", kind: "human" as const };
const imported = { id: "benchmark-imported", kind: "imported" as const };
const catalog = new Map([[original.id, original]]);

/** Experimental fixture limits, not proposed production guard values. */
export const clipboardMeasurementLimits: PrivateClipboardLimits = {
  maxEncodedLength: 256,
  maxSpans: 3,
  maxTextLength: 3,
};

/**
 * Shared parser cases with below/at/above boundaries and malformed input.
 * Fixture creation is outside the timed operation. The timed operation includes
 * decode, guard checks, and a constant-time retained-source callback. It does
 * not measure actual historical lookup, carrier mutation, OS clipboard, or
 * atomic resource admission; this parser is carrier-neutral.
 */
export function clipboardMeasurementCases(): readonly ClipboardMeasurementCase[] {
  const cases: ClipboardMeasurementCase[] = [];
  function add(
    name: string,
    privateText: string,
    plainText: string,
    spanCount: number,
    expectedPrivate: boolean,
  ): void {
    cases.push({
      name,
      encodedLength: privateText.length,
      spanCount,
      textLength: plainText.length,
      expectedPrivate,
      setup: () => () =>
        decodePrivateClipboard(
          privateText,
          plainText,
          documentId,
          catalog,
          imported,
          clipboardMeasurementLimits,
          (reference) => reference === "retained",
        ),
    });
  }
  const encode = (spans: readonly QualificationTextSpan[]): string =>
    JSON.stringify({
      formatVersion: 1,
      documentId,
      sourceReference: "retained",
      spans,
    });
  const span = (text: string): QualificationTextSpan => ({
    text,
    origin: original,
  });
  const base = encode([span("a")]);
  for (const delta of [-1, 0, 1]) {
    const length = clipboardMeasurementLimits.maxEncodedLength + delta;
    add(
      `encoded-${delta}`,
      base + " ".repeat(length - base.length),
      "a",
      1,
      delta <= 0,
    );
  }
  for (const count of [2, 3, 4]) {
    const spans = Array.from({ length: count }, () => span("a"));
    // Raise the unrelated limits to isolate the span-count boundary.
    const privateText = encode(spans);
    const limits = {
      ...clipboardMeasurementLimits,
      maxEncodedLength: 1024,
      maxTextLength: 4,
    };
    cases.push({
      name: `spans-${count}`,
      encodedLength: privateText.length,
      spanCount: count,
      textLength: count,
      expectedPrivate: count <= clipboardMeasurementLimits.maxSpans,
      setup: () => () =>
        decodePrivateClipboard(
          privateText,
          "a".repeat(count),
          documentId,
          catalog,
          imported,
          limits,
          (reference) => reference === "retained",
        ),
    });
  }
  for (const length of [2, 3, 4])
    add(
      `text-${length}`,
      encode([span("a".repeat(length))]),
      "a".repeat(length),
      1,
      length <= clipboardMeasurementLimits.maxTextLength,
    );
  add("malformed-json", "{not-json", "fallback", 0, false);
  return cases;
}
