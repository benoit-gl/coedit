import type { IntegratedDocumentCarrier } from "./carrier.js";
import { createProbeRange } from "./rangeProbe.js";
import type { ProbeMember, ProbeRange } from "./rangeProbe.js";

/**
 * Builds retained-Range scaling inputs without registering Range holders.
 *
 * @remarks
 * Merge 6 provides these reusable construction fixtures. Step 8 measures
 * them under one recorded candidate-comparison profile.
 */
export function buildRetainedRangeScalingFixture<Position>(
  carrier: IntegratedDocumentCarrier<Position>,
  token: string,
  member: ProbeMember,
  count: number,
): readonly ProbeRange[] {
  if (!Number.isSafeInteger(count) || count < 1)
    throw new RangeError("Retained Range fixture count is invalid.");
  return Array.from({ length: count }, () =>
    createProbeRange(carrier, token, "span", [member]),
  );
}
