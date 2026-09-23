/** Candidate names used by Step 3 payload qualification. */
export type PayloadCarrierCandidate = "yjs" | "automerge";

/** Origin categories used by carrier qualification fixtures. */
export type QualificationOriginKind =
  "human" | "imported" | "automation" | "ai" | "unknown";

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
  createText(mediaType: string, origin: QualificationOrigin): PayloadCarrier;

  /** Reloads complete candidate state. */
  load(encoded: Uint8Array): PayloadCarrier;
}

interface ParsedQualificationMediaType {
  readonly type: string;
  readonly subtype: string;
  readonly parameters: ReadonlyMap<string, string>;
}

/** Returns whether a Media Type selects the initial fine-grained text capability. */
export function isQualificationFineGrainedMediaType(
  mediaType: string,
): boolean {
  const parsed = parseQualificationMediaType(mediaType);
  return (
    (parsed.type === "text" && parsed.subtype === "plain") ||
    (parsed.type === "text" && parsed.subtype === "markdown")
  );
}

/** Validates a UTF-16 offset against one native ECMAScript string. */
export function assertTextOffset(offset: number, text: string): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) {
    throw new RangeError("Text offset is outside the current native string.");
  }
}

/** Validates an ordered UTF-16 range against one native ECMAScript string. */
export function assertTextRange(
  start: number,
  end: number,
  text: string,
): void {
  assertTextOffset(start, text);
  assertTextOffset(end, text);
  if (start > end) {
    throw new RangeError("Text range start must not follow its end.");
  }
}

function parseQualificationMediaType(
  mediaType: string,
): ParsedQualificationMediaType {
  let index = 0;
  const type = readRestrictedName(
    mediaType,
    () => index,
    (value) => {
      index = value;
    },
  );
  expect(mediaType, index, "/");
  index += 1;
  const subtype = readRestrictedName(
    mediaType,
    () => index,
    (value) => {
      index = value;
    },
  );
  const parameters = new Map<string, string>();

  while (index < mediaType.length) {
    consumeOptionalWhitespace(
      mediaType,
      () => index,
      (value) => {
        index = value;
      },
    );
    expect(mediaType, index, ";");
    index += 1;
    consumeOptionalWhitespace(
      mediaType,
      () => index,
      (value) => {
        index = value;
      },
    );
    const name = readRestrictedName(
      mediaType,
      () => index,
      (value) => {
        index = value;
      },
    ).toLowerCase();
    expect(mediaType, index, "=");
    index += 1;
    const value = readParameterValue(
      mediaType,
      () => index,
      (nextIndex) => {
        index = nextIndex;
      },
    );
    if (parameters.has(name)) {
      throw new TypeError("Media Type parameter names must be unique.");
    }
    parameters.set(name, value);
  }

  return {
    type: type.toLowerCase(),
    subtype: subtype.toLowerCase(),
    parameters,
  };
}

function readRestrictedName(
  source: string,
  getIndex: () => number,
  setIndex: (index: number) => void,
): string {
  const start = getIndex();
  let index = start;
  if (!isAsciiAlphanumeric(source[index])) {
    throw new TypeError(
      "Media Type names must use RFC 6838 restricted-name syntax.",
    );
  }
  index += 1;
  while (index < source.length && isRestrictedNameCharacter(source[index])) {
    index += 1;
  }
  if (index - start > 127) {
    throw new TypeError("Media Type names exceed the RFC 6838 length limit.");
  }
  setIndex(index);
  return source.slice(start, index);
}

function readParameterValue(
  source: string,
  getIndex: () => number,
  setIndex: (index: number) => void,
): string {
  let index = getIndex();
  const start = index;
  if (source[index] === '"') {
    index += 1;
    while (index < source.length && source[index] !== '"') {
      const code = source.charCodeAt(index);
      if (source[index] === "\\") {
        index += 1;
        if (!isQuotedPairCharacter(source.charCodeAt(index))) {
          throw new TypeError("Media Type quoted-string escape is invalid.");
        }
      } else if (!isQuotedTextCharacter(code)) {
        throw new TypeError("Media Type quoted-string is invalid.");
      }
      index += 1;
    }
    if (source[index] !== '"') {
      throw new TypeError("Media Type quoted-string is unterminated.");
    }
    index += 1;
  } else {
    while (index < source.length && isTokenCharacter(source[index])) {
      index += 1;
    }
    if (index === start) {
      throw new TypeError("Media Type parameter value is invalid.");
    }
  }
  setIndex(index);
  return source.slice(start, index);
}

function consumeOptionalWhitespace(
  source: string,
  getIndex: () => number,
  setIndex: (index: number) => void,
): void {
  let index = getIndex();
  while (source[index] === " " || source[index] === "\t") {
    index += 1;
  }
  setIndex(index);
}

function expect(source: string, index: number, expected: string): void {
  if (source[index] !== expected) {
    throw new TypeError(
      `Media Type must contain '${expected}' in the required position.`,
    );
  }
}

function isAsciiAlphanumeric(value: string | undefined): boolean {
  return value !== undefined && /^[A-Za-z0-9]$/u.test(value);
}

function isRestrictedNameCharacter(value: string | undefined): boolean {
  return value !== undefined && /^[A-Za-z0-9!#$&^_.+-]$/u.test(value);
}

function isTokenCharacter(value: string | undefined): boolean {
  return value !== undefined && /^[!#$%&'*+\-.^_`|~A-Za-z0-9]$/u.test(value);
}

function isQuotedTextCharacter(code: number): boolean {
  return (
    code === 9 ||
    code === 32 ||
    code === 33 ||
    (code >= 35 && code <= 91) ||
    (code >= 93 && code <= 126) ||
    (code >= 128 && code <= 255)
  );
}

function isQuotedPairCharacter(code: number): boolean {
  return (
    code === 9 ||
    code === 32 ||
    (code >= 33 && code <= 126) ||
    (code >= 128 && code <= 255)
  );
}
