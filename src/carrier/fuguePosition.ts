import { Fugue, isFuguePosition, type FuguePosition } from "fugue";

import { isCanonicalUuidV4 } from "../domain/ids.js";
import type {
  StructuralPositionAllocationResult,
  StructuralPositionAllocator,
  StructuralPositionOrder,
} from "./position.js";

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
export const fuguePositionAllocator: StructuralPositionAllocator<
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
      return { ok: true, value: burst.nextMany(count) };
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

function deterministicRandomBytes(
  seed: string,
): (length: number) => Uint8Array {
  let state = seedHash(seed);
  return (length) => {
    const result = new Uint8Array(length);
    for (let index = 0; index < result.length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      result[index] = state & 0xff;
    }
    return result;
  };
}

function seedHash(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash === 0 ? 0x9e3779b9 : hash;
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
