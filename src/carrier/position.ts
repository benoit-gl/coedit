/** Three-way ordering result used by structural position comparators. */
export type StructuralPositionOrder = -1 | 0 | 1;

/** Carrier-facing codec for one allocator-private structural position. */
export interface StructuralPositionCodec<Position> {
  /** Encodes one validated position without exposing its representation to the carrier. */
  encode(position: Position): string;

  /** Decodes and validates one carrier value. */
  decode(encoded: string): Position;
}

/**
 * Engine-facing ordering operations for opaque structural positions.
 *
 * @remarks
 * `compare` must refine `comparePrimary`. When primary positions differ, both
 * comparators return the same ordering direction. Positions that compare equal
 * by `comparePrimary` can use allocator-private tie-breaking in `compare`, but
 * one primary-position equivalence class must remain contiguous in complete
 * comparator order. Collision normalization relies on this property.
 */
export interface StructuralPositionOrdering<Position> {
  /** Compares logical ordering locations before allocator-specific tie-breaking. */
  comparePrimary(left: Position, right: Position): StructuralPositionOrder;

  /** Compares complete positions in deterministic allocator order. */
  compare(left: Position, right: Position): StructuralPositionOrder;
}

/** Expected allocator rejection without exposing candidate-private representation. */
export interface StructuralPositionAllocationError {
  /** Stable candidate-defined failure kind. */
  readonly kind: string;
  /** Human-readable diagnostic detail. */
  readonly message: string;
}

/** Result of one allocator run request. */
export type StructuralPositionAllocationResult<Position> =
  | {
      /** Indicates successful position allocation. */
      readonly ok: true;
      /** Fresh positions in requested run order. */
      readonly value: readonly Position[];
    }
  | {
      /** Indicates an expected allocation rejection. */
      readonly ok: false;
      /** Stable allocation failure detail. */
      readonly error: StructuralPositionAllocationError;
    };

/** One ordered-run request made by the structural engine. */
export interface StructuralPositionAllocationRequest<
  Position,
  AllocationContext,
> {
  /** Existing lower open-interval bound, when one exists. */
  readonly lower?: Position;
  /** Existing upper open-interval bound, when one exists. */
  readonly upper?: Position;
  /** Number of fresh ordered positions to allocate. */
  readonly count: number;
  /** Opaque allocator-native identity or entropy for this allocation. */
  readonly context: AllocationContext;
}

/** Production boundary between structural semantics and position generation. */
export interface StructuralPositionAllocator<Position, AllocationContext>
  extends
    StructuralPositionCodec<Position>,
    StructuralPositionOrdering<Position> {
  /** Allocates one fresh ordered run strictly inside the requested open interval. */
  allocateRun(
    request: StructuralPositionAllocationRequest<Position, AllocationContext>,
  ): StructuralPositionAllocationResult<Position>;
}
