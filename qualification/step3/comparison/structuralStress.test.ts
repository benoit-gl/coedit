import { expect, test } from "vitest";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { measureStructuralStress } from "./structuralStress.js";

test.each([
  createYjsIntegratedDocumentCarrierFactory,
  createAutomergeIntegratedDocumentCarrierFactory,
])(
  "verifies integrated structural stress and independent projection",
  (makeFactory) => {
    const factory = makeFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    );
    const result = measureStructuralStress(
      factory,
      { siblings: 4, subtree: 3, depth: 3, repeatedMoves: 2 },
      () => 0,
    );
    expect(result.atomicRefusal).toBe(true);
    expect(result.repeatedMoveMs).toEqual([0, 0]);
    expect(() =>
      measureStructuralStress(
        factory,
        { siblings: 2, subtree: 3, depth: 3, repeatedMoves: 2 },
        () => 0,
      ),
    ).toThrow(RangeError);
  },
);
