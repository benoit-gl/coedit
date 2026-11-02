import { expect, test } from "vitest";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { measureMixedHistoryLifecycle } from "./historyLifecycle.js";

test.each([
  createYjsIntegratedDocumentCarrierFactory,
  createAutomergeIntegratedDocumentCarrierFactory,
])(
  "mixed histories retain exact detached material across lifecycle",
  (makeFactory) => {
    const factory = makeFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    );
    const result = measureMixedHistoryLifecycle(factory, 12, () =>
      performance.now(),
    );
    expect(result.effectCountBeforeRestore).toBe(12);
    expect(result.visibleTextUnits).toBe(8);
    expect(() => measureMixedHistoryLifecycle(factory, 3, () => 0)).toThrow(
      RangeError,
    );
  },
);
