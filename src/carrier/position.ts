import { isCanonicalUuidV4 } from "../domain/ids.js";

const BASE = 65_536;
const MAX_PATH_LENGTH = 256;
const MAX_RUN_LENGTH = 50_000;

/** Atomic private structural position used by the flat Block carrier. */
export interface CarrierPosition {
  /** Dense lexicographic path. */
  readonly digits: readonly number[];
  /** UUID-v4 nonce for the allocation run. */
  readonly run: string;
  /** One-based member number inside the allocation run. */
  readonly member: number;
}

/** Stable classification for position-allocation failure. */
export type PositionErrorKind =
  | "InvalidPosition"
  | "InvalidBounds"
  | "InvalidNonce"
  | "InvalidCount"
  | "PathLimitExceeded";

/** Expected position-allocation failure. */
export interface PositionError {
  /** Stable machine-readable failure kind. */
  readonly kind: PositionErrorKind;
  /** Human-readable diagnostic detail. */
  readonly message: string;
}

/** Result of one position allocation. */
export type PositionResult =
  | { readonly ok: true; readonly value: readonly CarrierPosition[] }
  | { readonly ok: false; readonly error: PositionError };

/** Compares two positions in projected structural order. */
export function compareCarrierPositions(
  left: CarrierPosition,
  right: CarrierPosition,
): number {
  const pathOrder = compareDigits(left.digits, right.digits);
  if (pathOrder !== 0) {
    return pathOrder;
  }
  const runOrder = left.run.localeCompare(right.run);
  if (runOrder !== 0) {
    return runOrder;
  }
  return left.member - right.member;
}

/** Validates one encoded private carrier position. */
export function isValidCarrierPosition(position: CarrierPosition): boolean {
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

/**
 * Allocates one non-interleaving run strictly between optional projected bounds.
 *
 * @remarks
 * The run gets one jittered dense anchor. Each member appends one ordered suffix
 * digit to that anchor. Different anchors keep concurrent runs separate. An
 * exact concurrent anchor collision is detectable with {@link carrierRunAnchor}
 * and is handled by the structural normalization contract.
 */
export function allocateCarrierPositionRun(
  lower: CarrierPosition | undefined,
  upper: CarrierPosition | undefined,
  count: number,
  runNonce: string,
): PositionResult {
  if (!isCanonicalUuidV4(runNonce)) {
    return failure("InvalidNonce", "Position run nonce must be a canonical UUID-v4 value.");
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_RUN_LENGTH) {
    return failure(
      "InvalidCount",
      `A structural position run must contain 1-${MAX_RUN_LENGTH} members.`,
    );
  }
  if (
    (lower !== undefined && !isValidCarrierPosition(lower)) ||
    (upper !== undefined && !isValidCarrierPosition(upper))
  ) {
    return failure("InvalidPosition", "Position bounds must be valid carrier positions.");
  }
  if (
    lower !== undefined &&
    upper !== undefined &&
    compareCarrierPositions(lower, upper) >= 0
  ) {
    return failure("InvalidBounds", "Lower position must sort before upper position.");
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
      "No fresh path exists inside one exact path collision; normalize the collision first.",
    );
  }

  const anchor = allocateDigitsBetween(
    lowerDigits,
    upperDigits,
    runNonce,
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
    return failure("InvalidCount", "Structural run is too large for one anchor.");
  }
  const positions: CarrierPosition[] = [];
  for (let index = 1; index <= count; index += 1) {
    const suffix = stride * index;
    positions.push({
      digits: [...anchor, suffix],
      run: runNonce,
      member: index,
    });
  }
  return { ok: true, value: positions };
}

/** Returns the shared anchor used to detect exact concurrent run collisions. */
export function carrierRunAnchor(position: CarrierPosition): readonly number[] {
  return position.digits.slice(0, -1);
}

/** Returns true when two positions came from runs with the same anchor path. */
export function hasCarrierAnchorCollision(
  left: CarrierPosition,
  right: CarrierPosition,
): boolean {
  return (
    left.run !== right.run &&
    compareDigits(carrierRunAnchor(left), carrierRunAnchor(right)) === 0
  );
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
    lowerActive =
      lowerActive && lower !== undefined && depth < lower.length;
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

function failure(
  kind: PositionErrorKind,
  message: string,
): Extract<PositionResult, { readonly ok: false }> {
  return { ok: false, error: { kind, message } };
}
