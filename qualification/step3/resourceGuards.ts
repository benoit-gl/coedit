/** Step 3 implementation guard for one untrusted encoded carrier update or snapshot. */
export const selectedCarrierEncodedByteGuard = 16 * 1024 * 1024;

/** Resource-capacity error raised before an oversized carrier payload is decoded. */
export class CarrierResourceGuardError extends Error {
  public constructor() {
    super("Encoded carrier input exceeds the Step 3 resource guard.");
    this.name = "CarrierResourceGuardError";
  }
}

interface MergeableEncodedCarrier {
  /** Merges one encoded update or snapshot. */
  mergeEncoded(encoded: Uint8Array): void;
}

/** Rejects an oversized untrusted carrier payload before candidate decoding. */
export function assertCarrierInputWithinGuard(
  encoded: Uint8Array,
  maximumBytes = selectedCarrierEncodedByteGuard,
): void {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new TypeError("The carrier byte guard must be a positive integer.");
  }
  if (encoded.byteLength > maximumBytes) {
    throw new CarrierResourceGuardError();
  }
}

/** Loads an encoded carrier only after enforcing its hostile-input byte guard. */
export function loadGuardedCarrier<Carrier>(
  load: (encoded: Uint8Array) => Carrier,
  encoded: Uint8Array,
  maximumBytes = selectedCarrierEncodedByteGuard,
): Carrier {
  assertCarrierInputWithinGuard(encoded, maximumBytes);
  return load(encoded);
}

/** Merges an encoded carrier update only after enforcing its hostile-input byte guard. */
export function mergeGuardedCarrier(
  carrier: MergeableEncodedCarrier,
  encoded: Uint8Array,
  maximumBytes = selectedCarrierEncodedByteGuard,
): void {
  assertCarrierInputWithinGuard(encoded, maximumBytes);
  carrier.mergeEncoded(encoded);
}
