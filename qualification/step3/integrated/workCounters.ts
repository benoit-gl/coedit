import type { QualificationPayloadSnapshot } from "../payload/carrier.js";
import type { QualificationWorkCounters } from "./carrier.js";

/** Record a qualification-visible payload projection after it succeeds. */
export function recordPayload(
  counters: QualificationWorkCounters | undefined,
  id: string,
  payload: QualificationPayloadSnapshot,
): QualificationPayloadSnapshot {
  if (counters) {
    counters.payloads[id] = (counters.payloads[id] ?? 0) + 1;
    if (payload.kind === "text") {
      counters.textUnits[id] =
        (counters.textUnits[id] ?? 0) + payload.text.length;
      counters.textSpans[id] =
        (counters.textSpans[id] ?? 0) + payload.spans.length;
    }
    if (payload.kind === "opaque")
      counters.opaqueBytes[id] =
        (counters.opaqueBytes[id] ?? 0) + payload.bytes.length;
  }
  return payload;
}

/** Count token values materialized by a qualification-visible liveness check. */
export function recordTokens(
  counters: QualificationWorkCounters | undefined,
  id: string,
  count: number,
): void {
  if (counters)
    counters.livenessTokens[id] = (counters.livenessTokens[id] ?? 0) + count;
}
