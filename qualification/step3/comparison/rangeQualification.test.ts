import { expect, test } from "vitest";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { measureRangeQualification } from "./rangeQualification.js";

test.each([
  createYjsIntegratedDocumentCarrierFactory,
  createAutomergeIntegratedDocumentCarrierFactory,
])(
  "checks independently expected multi-member lifecycle and holder access",
  (makeFactory) => {
    const factory = makeFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    );
    const result = measureRangeQualification(
      factory,
      { holders: 3, members: 4, unrelatedBlocks: 2, priorMoves: 2 },
      () => 0,
    );
    expect(result).toMatchObject({
      holders: 3,
      members: 4,
      unrelatedBlocks: 2,
      priorMoves: 2,
      holderReadsDuringChanges: 0,
      positiveControlReads: 1,
      retainedTokens: 6,
    });
    expect(result.encodedBytes).toBeGreaterThan(0);
    expect(() =>
      measureRangeQualification(
        factory,
        { holders: 0, members: 1, unrelatedBlocks: 0, priorMoves: 0 },
        () => 0,
      ),
    ).toThrow(RangeError);
  },
);
