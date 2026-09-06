import { isCanonicalUuidV4 } from "../domain/ids.js";

const BASE = 65_536;
const MAX_PATH_LENGTH = 256;
const MAX_RUN_LENGTH = 50_000;

/** Three-way ordering result used by structural position comparators. */
export type StructuralPositionOrder = -1 | 0 | 1;

/** Carrier-facing codec for one allocator-private structural position. */
export interface StructuralPositionCodec<Position> {
  /** Encodes one validated position without exposing its representation to the carrier. */
  encode(position: Position): string;

  /** Decodes and validates one carrier value. */
  decode(encoded: string): Position;
}

/** Engine-facing ordering operations for opaque structural positions. */
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
  /** Candidate name used in qualification evidence. */
  readonly candidate: string;

  /** Allocates one fresh ordered run strictly inside the requested open interval. */
  allocateRun(
    request: StructuralPositionAllocationRequest<Position, AllocationContext>,
  ): StructuralPositionAllocationResult<Position>;
}

/** Private position representation for the local dense-order qualification candidate. */
export interface LocalDensePosition {
  /** Dense lexicographic path. */
  readonly digits: readonly number[];
  /** UUID-v4 nonce for the allocation run. */
  readonly run: string;
  /** One-based member number inside the allocation run. */
  readonly member: number;
}

/** Opaque allocation context consumed by the local dense-order candidate. */
export interface LocalDenseAllocationContext {
  /** UUID-v4 nonce that makes one allocation run distinct. */
  readonly runNonce: string;
}

/** Stable local dense-order allocation failure kinds. */
export type LocalDensePositionErrorKind =
  | "InvalidPosition"
  | "InvalidBounds"
  | "InvalidNonce"
  | "InvalidCount"
  | "PathLimitExceeded";

/** Local dense-order candidate used for Step 3 qualification, not yet selected for production. */
export const localDensePositionAllocator: StructuralPositionAllocator<
  LocalDensePosition,
  LocalDenseAllocationContext
> = {
  candidate: "local-dense-v1",
  comparePrimary(left, right) {
    return order(compareDigits(left.digits, right.digits));
  },
  compare(left, right) {
    const pathOrder = compareDigits(left.digits, right.digits);
    if (pathOrder !== 0) {
      return order(pathOrder);
    }
    const runOrder = left.run.localeCompare(right.run);
    if (runOrder !== 0) {
      return order(runOrder);
    }
    return order(left.member - right.member);
  },
  allocateRun(request) {
    return allocateLocalDenseRun(request);
  },
  encode(position) {
    if (!isValidLocalDensePosition(position)) {
      throw new TypeError("Cannot encode an invalid local dense position.");
    }
    return JSON.stringify(position);
  },
  decode(encoded) {
    const parsed: unknown = JSON.parse(encoded);
    if (!isLocalDensePositionRecord(parsed)) {
      throw new TypeError("Local dense position encoding is invalid.");
    }
    const position: LocalDensePosition = {
      digits: parsed.digits,
      run: parsed.run,
      member: parsed.member,
    };
    if (!isValidLocalDensePosition(position)) {
      throw new TypeError("Local dense position encoding is invalid.");
    }
    return position;
  },
};

/** Validates one local dense-order candidate position. */
export function isValidLocalDensePosition(
  position: LocalDensePosition,
): boolean {
  return (
    position.digits.length > 0 &&
    position.digits.length <= MAX_PATH_LENGTH &&
    position.digits[position.digits.length - 1] !== 0 &&
    position.digits.every(
      (digit) => Number.isSafeInteger(digit) && digit >= 0 && digit < BASE,
    ) &&
    isCanonicalUuidV4(position.run) &&
    Number.isSafeInteger(position.member) &&
    position.member >= 0 &&
    position.member <= MAX_RUN_LENGTH
  );
}

/** Returns the local candidate anchor for candidate-specific qualification only. */
export function localDenseRunAnchor(
  position: LocalDensePosition,
): readonly number[] {
  return position.digits.slice(0, -1);
}

/** Detects a local candidate anchor collision for candidate-specific qualification only. */
export function hasLocalDenseAnchorCollision(
  left: LocalDensePosition,
  right: LocalDensePosition,
): boolean {
  return (
    left.run !== right.run &&
    compareDigits(localDenseRunAnchor(left), localDenseRunAnchor(right)) === 0
  );
}

function allocateLocalDenseRun(
  request: StructuralPositionAllocationRequest<
    LocalDensePosition,
    LocalDenseAllocationContext
  >,
): StructuralPositionAllocationResult<LocalDensePosition> {
  const { lower, upper, count, context } = request;
  if (!isCanonicalUuidV4(context.runNonce)) {
    return failure(
      "InvalidNonce",
      "Position run nonce must be a canonical UUID-v4 value.",
    );
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_RUN_LENGTH) {
    return failure(
      "InvalidCount",
      `A structural position run must contain 1-${MAX_RUN_LENGTH} members.`,
    );
  }
  if (
    (lower !== undefined && !isValidLocalDensePosition(lower)) ||
    (upper !== undefined && !isValidLocalDensePosition(upper))
  ) {
    return failure(
      "InvalidPosition",
      "Position bounds must be valid local dense positions.",
    );
  }
  if (
    lower !== undefined &&
    upper !== undefined &&
    localDensePositionAllocator.compare(lower, upper) >= 0
  ) {
    return failure(
      "InvalidBounds",
      "Lower position must sort before upper position.",
    );
  }

  const lowerDigits = lower?.digits;
  const upperDigits = upper?.digits;
  if (
    lower !== undefined &&
    upper !== undefined &&
    compareDigits(lowerDigits ?? [], upperDigits ?? []) === 0
  ) {
    return failure(
      "InvalidBounds",
      "No fresh path exists inside one primary-position collision; normalize the collision first.",
    );
  }

  const anchor = allocateDigitsBetween(
    lowerDigits,
    upperDigits,
    context.runNonce,
    0,
  );
  if (anchor === undefined || anchor.length >= MAX_PATH_LENGTH) {
    return failure(
      "PathLimitExceeded",
      "Structural position path exceeded the qualification safety limit.",
    );
  }

  const stride = Math.floor(BASE / (count + 1));
  if (stride < 1) {
    return failure(
      "InvalidCount",
      "Structural run is too large for one anchor.",
    );
  }
  const positions: LocalDensePosition[] = [];
  for (let index = 1; index <= count; index += 1) {
    const suffix = stride * index;
    positions.push({
      digits: [...anchor, suffix],
      run: context.runNonce,
      member: index,
    });
  }
  return { ok: true, value: positions };
}

function allocateDigitsBetween(
  lower: readonly number[] | undefined,
  upper: readonly number[] | undefined,
  nonce: string,
  nonceOffset: number,
): number[] | undefined {
  const prefix: number[] = [];
  let depth = 0;
  let lowerActive = lower !== undefined;
  let upperActive = upper !== undefined;

  while (prefix.length < MAX_PATH_LENGTH - 1) {
    const lowerDigit =
      lowerActive && lower !== undefined && depth < lower.length
        ? (lower[depth] ?? 0)
        : 0;
    const upperDigit =
      upperActive && upper !== undefined && depth < upper.length
        ? (upper[depth] ?? BASE)
        : BASE;

    if (lowerDigit === upperDigit) {
      prefix.push(lowerDigit);
      depth += 1;
      lowerActive = lowerActive && lower !== undefined && depth < lower.length;
      upperActive = upperActive && upper !== undefined && depth < upper.length;
      continue;
    }

    if (upperDigit - lowerDigit > 1) {
      const available = upperDigit - lowerDigit - 1;
      const jitter = hashNonce(nonce, nonceOffset + depth) % available;
      prefix.push(lowerDigit + 1 + jitter);
      return prefix;
    }

    prefix.push(lowerDigit);
    depth += 1;
    upperActive = false;
    lowerActive = lowerActive && lower !== undefined && depth < lower.length;
  }

  return undefined;
}

function compareDigits(
  left: readonly number[],
  right: readonly number[],
): number {
  const common = Math.min(left.length, right.length);
  for (let index = 0; index < common; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}

function hashNonce(nonce: string, salt: number): number {
  let hash = (2_166_136_261 ^ salt) >>> 0;
  for (let index = 0; index < nonce.length; index += 1) {
    hash ^= nonce.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
}

function order(value: number): StructuralPositionOrder {
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}

function isLocalDensePositionRecord(value: unknown): value is {
  readonly digits: readonly number[];
  readonly run: string;
  readonly member: number;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "digits" in value &&
    Array.isArray(value.digits) &&
    "run" in value &&
    typeof value.run === "string" &&
    "member" in value &&
    typeof value.member === "number"
  );
}

function failure(
  kind: LocalDensePositionErrorKind,
  message: string,
): Extract<
  StructuralPositionAllocationResult<LocalDensePosition>,
  { readonly ok: false }
> {
  return { ok: false, error: { kind, message } };
}
