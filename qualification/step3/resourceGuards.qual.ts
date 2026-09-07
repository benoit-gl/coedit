import { describe, expect, it } from "vitest";

import { automergeContentCarrierFactory } from "../../src/carrier/automergeContentCarrier.js";
import type { ContentCarrierFactory } from "../../src/carrier/contentCarrier.js";
import { yjsContentCarrierFactory } from "../../src/carrier/yjsContentCarrier.js";
import {
  CarrierResourceGuardError,
  assertCarrierInputWithinGuard,
  loadGuardedCarrier,
  mergeGuardedCarrier,
  selectedCarrierEncodedByteGuard,
} from "./resourceGuards.js";

const factories: readonly ContentCarrierFactory[] = [
  yjsContentCarrierFactory,
  automergeContentCarrierFactory,
];

describe("Step 3 carrier hostile-input guards", () => {
  it("accepts the selected byte boundary and rejects the next byte", () => {
    expect(() =>
      assertCarrierInputWithinGuard(
        new Uint8Array(selectedCarrierEncodedByteGuard),
      ),
    ).not.toThrow();
    expect(() =>
      assertCarrierInputWithinGuard(
        new Uint8Array(selectedCarrierEncodedByteGuard + 1),
      ),
    ).toThrow(CarrierResourceGuardError);
  });

  for (const factory of factories) {
    it(`${factory.candidate} rejects oversized load and merge before mutation`, () => {
      const carrier = factory.create();
      const before = carrier.snapshot();
      const oversized = new Uint8Array(2);

      expect(() =>
        loadGuardedCarrier((encoded) => factory.load(encoded), oversized, 1),
      ).toThrow(CarrierResourceGuardError);
      expect(() => mergeGuardedCarrier(carrier, oversized, 1)).toThrow(
        CarrierResourceGuardError,
      );
      expect(carrier.snapshot()).toEqual(before);
    });
  }
});
