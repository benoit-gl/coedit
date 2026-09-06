import { generateNKeysBetween } from "fractional-indexing";

import { isCanonicalUuidV4 } from "../domain/ids.js";
import type {
  StructuralPositionAllocationResult,
  StructuralPositionAllocator,
  StructuralPositionOrder,
} from "./position.js";

/** Opaque structural position produced by fractional-indexing v4. */
export interface FractionalIndexPosition {
  /** Fractional key whose raw string order is the primary structural order. */
  readonly key: string;
  /** UUID-v4 allocation identity used only to break primary-key collisions. */
  readonly run: string;
  /** One-based member number inside the allocation run. */
  readonly member: number;
}

/** Allocation identity consumed by the fractional-indexing qualification adapter. */
export interface FractionalIndexAllocationContext {
  /** UUID-v4 identity for one logical allocation run. */
  readonly runNonce: string;
}

/** Stable failures returned by the fractional-indexing qualification adapter. */
export type FractionalIndexPositionErrorKind =
  | "InvalidPosition"
  | "InvalidBounds"
  | "InvalidNonce"
  | "InvalidCount"
  | "CandidateFailure";

/** Established fractional-indexing candidate behind the production allocator boundary. */
export const fractionalIndexPositionAllocator: StructuralPositionAllocator<
  FractionalIndexPosition,
  FractionalIndexAllocationContext
> = {
  candidate: "fractional-indexing-v4",
  comparePrimary(left, right) {
    return compareRawStrings(left.key, right.key);
  },
  compare(left, right) {
    const primary = compareRawStrings(left.key, right.key);
    if (primary !== 0) {
      return primary;
    }
    const run = compareRawStrings(left.run, right.run);
    return run === 0 ? order(left.member - right.member) : run;
  },
  allocateRun(request) {
    const { lower, upper, count, context } = request;
    if (!isCanonicalUuidV4(context.runNonce)) {
      return failure(
        "InvalidNonce",
        "Fractional-index allocation identity must be a canonical UUID-v4 value.",
      );
    }
    if (!Number.isSafeInteger(count) || count < 1) {
      return failure(
        "InvalidCount",
        "Structural position run count must be a positive safe integer.",
      );
    }
    if (
      (lower !== undefined && !isValidFractionalIndexPosition(lower)) ||
      (upper !== undefined && !isValidFractionalIndexPosition(upper))
    ) {
      return failure(
        "InvalidPosition",
        "Fractional-index bounds must be valid candidate positions.",
      );
    }
    if (
      lower !== undefined &&
      upper !== undefined &&
      fractionalIndexPositionAllocator.compare(lower, upper) >= 0
    ) {
      return failure(
        "InvalidBounds",
        "Lower structural position must sort before upper structural position.",
      );
    }
    if (
      lower !== undefined &&
      upper !== undefined &&
      lower.key === upper.key
    ) {
      return failure(
        "InvalidBounds",
        "A fresh fractional key cannot be allocated inside one primary-key collision.",
      );
    }

    try {
      const keys = generateNKeysBetween(lower?.key ?? null, upper?.key ?? null, count);
      return {
        ok: true,
        value: keys.map((key, index) => ({
          key,
          run: context.runNonce,
          member: index + 1,
        })),
      };
    } catch (cause: unknown) {
      return failure(
        "CandidateFailure",
        cause instanceof Error
          ? `fractional-indexing rejected the allocation: ${cause.message}`
          : "fractional-indexing rejected the allocation.",
      );
    }
  },
  encode(position) {
    if (!isValidFractionalIndexPosition(position)) {
      throw new TypeError("Cannot encode an invalid fractional-index position.");
    }
    return JSON.stringify(position);
  },
  decode(encoded) {
    const parsed: unknown = JSON.parse(encoded);
    if (!isFractionalIndexPositionRecord(parsed)) {
      throw new TypeError("Fractional-index position encoding is invalid.");
    }
    if (!isValidFractionalIndexPosition(parsed)) {
      throw new TypeError("Fractional-index position encoding is invalid.");
    }
    return parsed;
  },
};

/** Validates one fractional-indexing qualification position. */
export function isValidFractionalIndexPosition(
  position: FractionalIndexPosition,
): boolean {
  return (
    position.key.length > 0 &&
    isCanonicalUuidV4(position.run) &&
    Number.isSafeInteger(position.member) &&
    position.member >= 1
  );
}

function isFractionalIndexPositionRecord(
  value: unknown,
): value is FractionalIndexPosition {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "key" in value &&
    typeof value.key === "string" &&
    "run" in value &&
    typeof value.run === "string" &&
    "member" in value &&
    typeof value.member === "number"
  );
}

function compareRawStrings(left: string, right: string): StructuralPositionOrder {
  return left < right ? -1 : left > right ? 1 : 0;
}

function order(value: number): StructuralPositionOrder {
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}

function failure(
  kind: FractionalIndexPositionErrorKind,
  message: string,
): Extract<
  StructuralPositionAllocationResult<FractionalIndexPosition>,
  { readonly ok: false }
> {
  return { ok: false, error: { kind, message } };
}
