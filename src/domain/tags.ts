const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;
const INTERNAL_WHITESPACE_PATTERN = /\s+/gu;
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
  | {
      /** Indicates successful normalization. */
      readonly ok: true;
      /** Normalized duplicate-free tags. */
      readonly value: TagSet;
    }
  | {
      /** Indicates that tag validation failed. */
      readonly ok: false;
      /** Validation failure detail. */
      readonly error: TagValidationError;
    };

/**
 * Normalizes tags for either Block or InlineContent ownership.
 *
 * @remarks
 * Identity is case-insensitive. The first normalized spelling wins. Empty
 * values are removed. Control characters are rejected.
 */
export function normalizeTags(
  values: readonly string[],
): TagNormalizationResult {
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
    const identity = candidate.toLowerCase();
    if (!seen.has(identity)) {
      seen.add(identity);
      normalized.push(candidate);
    }
  }

  return { ok: true, value: normalized };
}

function invalid(message: string): TagNormalizationResult {
  return { ok: false, error: { kind: "InvalidTags", message } };
}
