const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;
const INTERNAL_WHITESPACE_PATTERN = /\s+/gu;
const MAX_TAGS = 20;
const MAX_CODE_POINTS = 64;
const MAX_UTF8_BYTES = 256;

/** A normalized, duplicate-free set of tags with stable display spelling. */
export type TagSet = readonly string[];

/** Describes why a tag set could not be normalized. */
export interface TagValidationError {
  /** Stable error kind for tag validation. */
  readonly kind: "InvalidTags";
  /** Human-readable validation detail. */
  readonly message: string;
}

/** Result of tag normalization. */
export type TagNormalizationResult =
  | { readonly ok: true; readonly value: TagSet }
  | { readonly ok: false; readonly error: TagValidationError };

/**
 * Normalizes tags for either Block or InlineContent ownership.
 *
 * @remarks
 * Identity is case-insensitive. The first normalized spelling wins. Empty
 * values are removed. Control characters and values beyond the documented
 * scalar, byte, or per-owner limits are rejected.
 */
export function normalizeTags(values: readonly string[]): TagNormalizationResult {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const nfkc = value.normalize("NFKC");
    if (CONTROL_CHARACTER_PATTERN.test(nfkc)) {
      return invalid("Tags cannot contain Unicode control characters.");
    }

    const candidate = nfkc.trim().replace(INTERNAL_WHITESPACE_PATTERN, " ");
    if (candidate.length === 0) {
      continue;
    }
    if ([...candidate].length > MAX_CODE_POINTS) {
      return invalid(`A tag cannot exceed ${MAX_CODE_POINTS} Unicode code points.`);
    }
    if (utf8ByteLength(candidate) > MAX_UTF8_BYTES) {
      return invalid(`A tag cannot exceed ${MAX_UTF8_BYTES} UTF-8 bytes.`);
    }

    const identity = candidate.toLowerCase();
    if (!seen.has(identity)) {
      seen.add(identity);
      normalized.push(candidate);
      if (normalized.length > MAX_TAGS) {
        return invalid(`An owner cannot have more than ${MAX_TAGS} tags.`);
      }
    }
  }

  return { ok: true, value: normalized };
}

function invalid(message: string): TagNormalizationResult {
  return { ok: false, error: { kind: "InvalidTags", message } };
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
}
