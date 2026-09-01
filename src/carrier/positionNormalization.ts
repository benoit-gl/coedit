import type { CarrierPosition, PositionError } from "./position.js";
import {
  allocateCarrierPositionRun,
  compareCarrierPositions,
  isValidCarrierPosition,
} from "./position.js";

/** One replicated placement rewrite required to open an exact collision gap. */
export interface PositionNormalizationUpdate {
  /** Index in the pre-normalization projected order. */
  readonly index: number;
  /** Fresh position that preserves the previous projected order. */
  readonly position: CarrierPosition;
}

/** Successful exact-position collision normalization plan. */
export interface PositionNormalizationPlan {
  /** Minimum later part of the collision run that must move. */
  readonly updates: readonly PositionNormalizationUpdate[];
  /** Existing lower bound retained by normalization. */
  readonly insertionLower: CarrierPosition;
  /** Fresh first moved position that becomes the insertion upper bound. */
  readonly insertionUpper: CarrierPosition;
}

/** Expected collision-normalization failure. */
export interface PositionNormalizationError {
  /** Stable machine-readable failure kind. */
  readonly kind:
    "InvalidOrder" | "InvalidIndex" | "NoCollision" | "AllocationFailed";
  /** Human-readable failure detail. */
  readonly message: string;
  /** Underlying allocator error when allocation failed. */
  readonly allocationError?: PositionError;
}

/** Result of planning one replicated exact-position collision normalization. */
export type PositionNormalizationResult =
  | {
      /** Indicates successful normalization planning. */
      readonly ok: true;
      /** Replicated placement rewrites and resulting insertion bounds. */
      readonly value: PositionNormalizationPlan;
    }
  | {
      /** Indicates an expected normalization rejection. */
      readonly ok: false;
      /** Stable normalization failure detail. */
      readonly error: PositionNormalizationError;
    };

/**
 * Plans the minimum later-run rewrite needed to insert inside an exact path collision.
 *
 * @remarks
 * `insertionIndex` identifies the later existing item. The item immediately before it
 * remains in place. Every consecutive later item with the same primary path receives
 * a fresh ordered position between the retained lower item and the next distinct path.
 */
export function planExactPositionCollisionNormalization(
  ordered: readonly CarrierPosition[],
  insertionIndex: number,
  runNonce: string,
): PositionNormalizationResult {
  if (
    !Number.isSafeInteger(insertionIndex) ||
    insertionIndex < 1 ||
    insertionIndex >= ordered.length
  ) {
    return failure(
      "InvalidIndex",
      "Collision insertion index is outside an internal boundary.",
    );
  }
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    if (current === undefined || !isValidCarrierPosition(current)) {
      return failure(
        "InvalidOrder",
        "Collision normalization requires valid positions.",
      );
    }
    const previous = ordered[index - 1];
    if (
      previous !== undefined &&
      compareCarrierPositions(previous, current) > 0
    ) {
      return failure(
        "InvalidOrder",
        "Collision normalization input must already be sorted.",
      );
    }
  }

  const lower = ordered[insertionIndex - 1]!;
  const firstLater = ordered[insertionIndex]!;
  if (!samePrimaryPath(lower, firstLater)) {
    return failure(
      "NoCollision",
      "Requested insertion boundary is not an exact path collision.",
    );
  }

  let end = insertionIndex + 1;
  while (end < ordered.length && samePrimaryPath(lower, ordered[end]!)) {
    end += 1;
  }
  const upper = ordered[end];
  const movedCount = end - insertionIndex;
  const allocation = allocateCarrierPositionRun(
    lower,
    upper,
    movedCount,
    runNonce,
  );
  if (!allocation.ok) {
    return {
      ok: false,
      error: {
        kind: "AllocationFailed",
        message:
          "Could not allocate replacement positions for the collision run.",
        allocationError: allocation.error,
      },
    };
  }

  const updates = allocation.value.map((position, offset) => ({
    index: insertionIndex + offset,
    position,
  }));
  return {
    ok: true,
    value: {
      updates,
      insertionLower: lower,
      insertionUpper: allocation.value[0]!,
    },
  };
}

function samePrimaryPath(
  left: CarrierPosition,
  right: CarrierPosition,
): boolean {
  return (
    left.digits.length === right.digits.length &&
    left.digits.every((digit, index) => digit === right.digits[index])
  );
}

function failure(
  kind: PositionNormalizationError["kind"],
  message: string,
): Extract<PositionNormalizationResult, { readonly ok: false }> {
  return { ok: false, error: { kind, message } };
}
