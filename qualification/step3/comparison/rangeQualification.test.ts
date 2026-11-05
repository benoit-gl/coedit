import { expect, test } from "vitest";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import {
  measureRangeQualification,
  runRangeDriverWithoutHolderScan,
} from "./rangeQualification.js";

test("the driver guard rejects a deliberately scanning driver", () => {
  const unrelatedHolders = [{ id: "unrelated" }];
  expect(runRangeDriverWithoutHolderScan(unrelatedHolders, () => 7)).toBe(7);
  expect(() =>
    runRangeDriverWithoutHolderScan(unrelatedHolders, (holders) => {
      for (const holder of holders) void holder;
    }),
  ).toThrow("Edit or move accessed external holders.");
});

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
      capturedStatesBeforeEncode: 6,
      capturedStatesTotal: 8,
      crossingSplitSpanCount: 2,
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

test.each([
  createYjsIntegratedDocumentCarrierFactory,
  createAutomergeIntegratedDocumentCarrierFactory,
])(
  "tracks extra retained move lineage and split descendants",
  (makeFactory) => {
    const factory = makeFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    );
    const result = measureRangeQualification(
      factory,
      {
        holders: 3,
        members: 2,
        unrelatedBlocks: 0,
        priorMoves: 0,
        extraLineageEdges: 8,
      },
      () => 0,
    );
    expect(result).toMatchObject({
      extraLineageEdges: 8,
      capturedStatesBeforeEncode: 14,
      capturedStatesTotal: 16,
      crossingSplitSpanCount: 2,
      retainedMovesAndCaptureMs: 0,
      retainedLineageResolveMs: 0,
      deleteResolveMs: 0,
      replacementResolveMs: 0,
    });
    expect(result.retainedBaselineBytes).toBeGreaterThan(0);
    expect(result.retainedAfterMovesBytes).toBeGreaterThan(0);
    expect(result.externalLineageJsonBytes).toBeGreaterThan(0);
  },
);
