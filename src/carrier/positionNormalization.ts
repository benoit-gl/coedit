import type {
  StructuralPositionAllocationError,
  StructuralPositionAllocator,
} from "./position.js";

/** One replicated placement rewrite required to open a primary-position collision gap. */
export interface PositionNormalizationUpdate<Position> {
  /** Index in the pre-normalization projected order. */
  readonly index: number;
  /** Fresh position that preserves the previous projected order. */
  readonly position: Position;
}

/** Successful primary-position collision normalization plan. */
export interface PositionNormalizationPlan<Position> {
  /** Minimum later part of the collision run that must move. */
  readonly updates: readonly PositionNormalizationUpdate<Position>[];
  /** Existing lower bound retained by normalization. */
  readonly insertionLower: Position;
  /** Fresh first moved position that becomes the insertion upper bound. */
  readonly insertionUpper: Position;
}

/** Expected collision-normalization failure. */
export interface PositionNormalizationError {
  /** Stable machine-readable failure kind. */
  readonly kind:
    "InvalidOrder" | "InvalidIndex" | "NoCollision" | "AllocationFailed";
  /** Human-readable failure detail. */
  readonly message: string;
  /** Underlying allocator error when allocation failed. */
  readonly allocationError?: StructuralPositionAllocationError;
}

/** Result of planning one replicated primary-position collision normalization. */
export type PositionNormalizationResult<Position> =
  | {
      /** Indicates successful normalization planning. */
      readonly ok: true;
      /** Replicated placement rewrites and resulting insertion bounds. */
      readonly value: PositionNormalizationPlan<Position>;
    }
  | {
      /** Indicates an expected normalization rejection. */
      readonly ok: false;
      /** Stable normalization failure detail. */
      readonly error: PositionNormalizationError;
    };

/**
 * Plans the minimum later-run rewrite needed to insert inside a primary collision.
 *
 * @remarks
 * `insertionIndex` identifies the later existing item. The item immediately before it
 * remains in place. Every consecutive later item at the same primary position receives
 * a fresh ordered position between the retained lower item and the next distinct primary
 * position. The structural algorithm uses only the allocator abstraction and never
 * inspects the candidate-private position representation.
 */
export function planPositionCollisionNormalization<Position, AllocationContext>(
  allocator: StructuralPositionAllocator<Position, AllocationContext>,
  ordered: readonly Position[],
  insertionIndex: number,
  allocationContext: AllocationContext,
): PositionNormalizationResult<Position> {
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
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (allocator.compare(previous, current) > 0) {
      return failure(
        "InvalidOrder",
        "Collision normalization input must already be sorted.",
      );
    }
  }

  const lower = ordered[insertionIndex - 1]!;
  const firstLater = ordered[insertionIndex]!;
  if (allocator.comparePrimary(lower, firstLater) !== 0) {
    return failure(
      "NoCollision",
      "Requested insertion boundary is not a primary-position collision.",
    );
  }

  let end = insertionIndex + 1;
  while (
    end < ordered.length &&
    allocator.comparePrimary(lower, ordered[end]!) === 0
  ) {
    end += 1;
  }
  const upper = ordered[end];
  const movedCount = end - insertionIndex;
  const allocation = allocator.allocateRun({
    lower,
    ...(upper === undefined ? {} : { upper }),
    count: movedCount,
    context: allocationContext,
  });
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

function failure(
  kind: PositionNormalizationError["kind"],
  message: string,
): Extract<PositionNormalizationResult<never>, { readonly ok: false }> {
  return { ok: false, error: { kind, message } };
}
