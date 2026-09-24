import { Fugue, isFuguePosition, type FuguePosition } from "fugue";

import { isCanonicalUuidV4 } from "../../../src/domain/ids.js";
import type {
  StructuralPositionAllocationResult,
  StructuralPositionOrder,
} from "../../../src/carrier/position.js";
import type { QualificationPositionAllocator } from "./carrier.js";

const UINT64_MASK = (1n << 64n) - 1n;

/** Opaque Fugue structural position used by Step 3 qualification. */
export type FugueStructuralPosition = FuguePosition;

/** Allocation identity consumed by the Fugue qualification adapter. */
export interface FugueAllocationContext {
  /** UUID-v4 identity that deterministically seeds one allocation run. */
  readonly runNonce: string;
}

/** Stable failures returned by the Fugue qualification adapter. */
export type FuguePositionErrorKind =
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
 * random source does not impose.
 */
function deterministicRandomBytes(
  seed: string,
): (length: number) => Uint8Array {
  let [state0, state1] = uuidSeedWords(seed);
  return (length) => {
    const result = new Uint8Array(length);
    let offset = 0;
    while (offset < result.length) {
      let left = state0;
      const right = state1;
      state0 = right;
      left ^= (left << 23n) & UINT64_MASK;
      left ^= left >> 17n;
      left ^= right;
      left ^= right >> 26n;
      state1 = left & UINT64_MASK;

      let word = (state1 + right) & UINT64_MASK;
      for (let index = 0; index < 8 && offset < result.length; index += 1) {
        result[offset] = Number(word & 0xffn);
        word >>= 8n;
        offset += 1;
      }
    }
    return result;
  };
}

function uuidSeedWords(seed: string): readonly [bigint, bigint] {
  const hex = seed.replaceAll("-", "");
  let first = 0n;
  let second = 0n;
  for (let index = 0; index < 16; index += 1) {
    const byte = BigInt(
      Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
    );
    if (index < 8) {
      first = (first << 8n) | byte;
    } else {
      second = (second << 8n) | byte;
    }
  }
  return [first, second];
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
