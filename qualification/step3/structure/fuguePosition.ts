import { Fugue, isFuguePosition, type FuguePosition } from "fugue";

import { isCanonicalUuidV4 } from "../../../src/domain/index.js";
import type {
  StructuralPositionAllocationResult,
  StructuralPositionOrder,
} from "../../../src/carrier/index.js";
import type { QualificationPositionAllocator } from "./carrier.js";

const FUGUE_RANDOM_WARMUP_ROUNDS = 16;

/** Opaque Fugue structural position used by Step 3 qualification. */
export type FugueStructuralPosition = FuguePosition;

/** Allocation identity consumed by the Fugue qualification adapter. */
export interface FugueAllocationContext {
  /** UUID-v4 identity that deterministically seeds one allocation run. */
  readonly runNonce: string;
}

/** Stable failures returned by the Fugue qualification adapter. */
type FuguePositionErrorKind =
  | "InvalidPosition"
  | "InvalidBounds"
  | "InvalidNonce"
  | "InvalidCount"
  | "CandidateFailure";

/** Established Fugue candidate behind the production allocator boundary. */
export const fuguePositionAllocator: QualificationPositionAllocator<
  FugueStructuralPosition,
  FugueAllocationContext
> = {
  candidate: "fugue-v3",
  comparePrimary(left, right) {
    return compareRawStrings(left, right);
  },
  compare(left, right) {
    return compareRawStrings(left, right);
  },
  allocateRun(request) {
    const { lower, upper, count, context } = request;
    if (!isCanonicalUuidV4(context.runNonce)) {
      return failure(
        "InvalidNonce",
        "Fugue allocation identity must be a canonical UUID-v4 value.",
      );
    }
    if (!Number.isSafeInteger(count) || count < 1) {
      return failure(
        "InvalidCount",
        "Structural position run count must be a positive safe integer.",
      );
    }
    if (
      (lower !== undefined && !isFuguePosition(lower)) ||
      (upper !== undefined && !isFuguePosition(upper))
    ) {
      return failure(
        "InvalidPosition",
        "Fugue bounds must be valid positions.",
      );
    }
    if (
      lower !== undefined &&
      upper !== undefined &&
      compareRawStrings(lower, upper) >= 0
    ) {
      return failure(
        "InvalidBounds",
        "Lower structural position must sort before upper structural position.",
      );
    }

    try {
      const fugue = new Fugue({
        randomBytes: deterministicRandomBytes(context.runNonce),
        allowInsecureRandom: true,
      });
      const burst = fugue.startBurst(lower ?? null, upper ?? null);
      const value: FugueStructuralPosition[] = [];
      for (let index = 0; index < count; index += 1) {
        value.push(burst.next());
      }
      return { ok: true, value };
    } catch (cause: unknown) {
      return failure(
        "CandidateFailure",
        cause instanceof Error
          ? `Fugue rejected the allocation: ${cause.message}`
          : "Fugue rejected the allocation.",
      );
    }
  },
  encode(position) {
    if (!isFuguePosition(position)) {
      throw new TypeError("Cannot encode an invalid Fugue position.");
    }
    return position;
  },
  decode(encoded) {
    if (!isFuguePosition(encoded)) {
      throw new TypeError("Fugue position encoding is invalid.");
    }
    return encoded;
  },
};

/*
 * Preserve all UUID bits in deterministic qualification state. Reducing the run
 * identity to a 32-bit seed would create artificial aliases that Fugue's normal
 * random source does not impose. Warm up xoshiro128** so adjacent UUID values
 * do not expose correlated seed words in Fugue's first random draw.
 */
function deterministicRandomBytes(
  seed: string,
): (length: number) => Uint8Array {
  let [state0, state1, state2, state3] = uuidSeedWords(seed);

  const nextWord = (): number => {
    const multiplied = Math.imul(state1, 5) >>> 0;
    const rotated = rotateLeft(multiplied, 7);
    const result = Math.imul(rotated, 9) >>> 0;
    const shifted = (state1 << 9) >>> 0;

    state2 = (state2 ^ state0) >>> 0;
    state3 = (state3 ^ state1) >>> 0;
    state1 = (state1 ^ state2) >>> 0;
    state0 = (state0 ^ state3) >>> 0;
    state2 = (state2 ^ shifted) >>> 0;
    state3 = rotateLeft(state3, 11);

    return result;
  };

  for (let index = 0; index < FUGUE_RANDOM_WARMUP_ROUNDS; index += 1) {
    nextWord();
  }

  return (length) => {
    const result = new Uint8Array(length);
    let offset = 0;
    while (offset < result.length) {
      let word = nextWord();
      for (let index = 0; index < 4 && offset < result.length; index += 1) {
        result[offset] = word & 0xff;
        word >>>= 8;
        offset += 1;
      }
    }
    return result;
  };
}

function uuidSeedWords(
  seed: string,
): readonly [number, number, number, number] {
  const hex = seed.replaceAll("-", "");
  return [
    Number.parseInt(hex.slice(0, 8), 16),
    Number.parseInt(hex.slice(8, 16), 16),
    Number.parseInt(hex.slice(16, 24), 16),
    Number.parseInt(hex.slice(24, 32), 16),
  ];
}

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function compareRawStrings(
  left: string,
  right: string,
): StructuralPositionOrder {
  return left < right ? -1 : left > right ? 1 : 0;
}

function failure(
  kind: FuguePositionErrorKind,
  message: string,
): Extract<
  StructuralPositionAllocationResult<FugueStructuralPosition>,
  { readonly ok: false }
> {
  return { ok: false, error: { kind, message } };
}
