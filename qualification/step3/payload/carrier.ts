/** Candidate names used by Step 3 payload qualification. */
export type PayloadCarrierCandidate = "yjs" | "automerge";

/** Origin categories used by carrier qualification fixtures. */
export type QualificationOriginKind =
  | "human"
  | "imported"
  | "automation"
  | "ai"
  | "unknown";

/** Detached Origin metadata used only by Step 3 qualification. */
export interface QualificationOrigin {
  /** Stable fixture identity. */
  readonly id: string;
  /** Source category. */
  readonly kind: QualificationOriginKind;
}

/** One projected text span with a protected Origin. */
export interface QualificationTextSpan {
  /** Native ECMAScript string material. */
  readonly text: string;
  /** Origin assigned to this material. */
  readonly origin: QualificationOrigin;
}

/** Detached projected payload used by the common qualification suite. */
export type QualificationPayloadSnapshot =
  | {
      /** Fine-grained native-string payload. */
      readonly kind: "text";
      /** Exact supplied Media Type spelling. */
      readonly mediaType: string;
      /** Exact current native string. */
      readonly text: string;
      /** Ordered Origin projection. */
      readonly spans: readonly QualificationTextSpan[];
    }
  | {
      /** Generic opaque payload. */
      readonly kind: "opaque";
      /** Exact supplied Media Type spelling. */
      readonly mediaType: string;
      /** Detached exact bytes. */
      readonly bytes: Uint8Array;
      /** Payload-level Origin. */
      readonly origin: QualificationOrigin;
    };

/** Step 3 operation surface shared by both payload-carrier candidates. */
export interface PayloadCarrier {
  /** Candidate implementation name. */
  readonly candidate: PayloadCarrierCandidate;

  /** Projects a detached carrier-neutral payload value. */
  snapshot(): QualificationPayloadSnapshot;

  /** Inserts text with explicit protected Origin. */
  insertText(offset: number, text: string, origin: QualificationOrigin): void;

  /** Deletes one native-string UTF-16 range. */
  deleteText(start: number, end: number): void;

  /** Replaces the complete payload with allowlisted fine-grained text. */
  replaceText(
    mediaType: string,
    text: string,
    origin: QualificationOrigin,
  ): void;

  /** Replaces the complete payload with generic opaque bytes. */
  replaceOpaque(
    mediaType: string,
    bytes: Uint8Array,
    origin: QualificationOrigin,
  ): void;

  /** Encodes complete candidate state for reload or merge qualification. */
  encode(): Uint8Array;

  /** Merges complete encoded state from another replica. */
  mergeEncoded(encoded: Uint8Array): void;
}

/** Factory used by the common payload qualification suite. */
export interface PayloadCarrierFactory {
  /** Candidate implementation name. */
  readonly candidate: PayloadCarrierCandidate;

  /** Creates an empty allowlisted text payload with exact Media Type spelling. */
  createText(
    mediaType: string,
    origin: QualificationOrigin,
  ): PayloadCarrier;

  /** Reloads complete candidate state. */
  load(encoded: Uint8Array): PayloadCarrier;
}

/** Returns whether a Media Type selects the initial fine-grained text capability. */
export function isQualificationFineGrainedMediaType(mediaType: string): boolean {
  const base = mediaType.split(";", 1)[0]?.trim().toLowerCase();
  return base === "text/plain" || base === "text/markdown";
}

/** Validates a UTF-16 offset against one native ECMAScript string. */
export function assertTextOffset(offset: number, text: string): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) {
    throw new RangeError("Text offset is outside the current native string.");
  }
}

/** Validates an ordered UTF-16 range against one native ECMAScript string. */
export function assertTextRange(start: number, end: number, text: string): void {
  assertTextOffset(start, text);
  assertTextOffset(end, text);
  if (start > end) {
    throw new RangeError("Text range start must not follow its end.");
  }
}
