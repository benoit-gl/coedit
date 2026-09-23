import type {
  PayloadCarrier,
  QualificationOrigin,
  QualificationPayloadSnapshot,
} from "./carrier.js";
import { isQualificationFineGrainedMediaType } from "./carrier.js";

const REPRESENTATIVE_TEXT_PROFILE = "text/plain; charset=UTF-8";
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const utf8Encoder = new TextEncoder();

/**
 * Projects representative raw media without exposing carrier replication bytes.
 *
 * This Step 3 fixture proves a carrier-neutral coarse boundary only; it is not a
 * production codec or supported-profile decision.
 */
export function readQualificationRawMedia(carrier: PayloadCarrier): Uint8Array {
  const snapshot = carrier.snapshot();
  if (snapshot.kind === "opaque") {
    return snapshot.bytes.slice();
  }
  assertRepresentativeTextProfile(snapshot);
  const encoded = utf8Encoder.encode(snapshot.text);
  if (utf8Decoder.decode(encoded) !== snapshot.text) {
    throw new TypeError(
      "Representative test codec cannot encode this native string exactly.",
    );
  }
  return encoded;
}

/**
 * Replaces a qualification payload from representative raw media atomically.
 *
 * This Step 3 fixture proves error handling at the carrier-neutral boundary
 * without selecting the Step 4 processor or its representation profiles.
 */
export function replaceQualificationRawMedia(
  carrier: PayloadCarrier,
  mediaType: string,
  bytes: Uint8Array,
  origin: QualificationOrigin,
): void {
  if (!isQualificationFineGrainedMediaType(mediaType)) {
    carrier.replaceOpaque(mediaType, bytes, origin);
    return;
  }
  assertRepresentativeTextProfile({
    kind: "text",
    mediaType,
    text: "",
    spans: [],
  });
  let text: string;
  try {
    text = utf8Decoder.decode(bytes);
  } catch {
    throw new TypeError(
      "Representative test codec cannot decode the supplied bytes.",
    );
  }
  carrier.replaceText(mediaType, text, origin);
}

function assertRepresentativeTextProfile(
  snapshot: Extract<QualificationPayloadSnapshot, { readonly kind: "text" }>,
): void {
  if (snapshot.mediaType !== REPRESENTATIVE_TEXT_PROFILE) {
    throw new TypeError(
      "Representative test codec does not support this Media Type profile.",
    );
  }
}
