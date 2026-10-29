import { expect, test } from "vitest";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { runExtendedMeasurements } from "./extendedMeasurements.js";

test("extended paired workloads execute their invariants", () => {
  const factories = [
    createYjsIntegratedDocumentCarrierFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    ),
    createAutomergeIntegratedDocumentCarrierFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    ),
  ];
  const rows: string[] = [];
  runExtendedMeasurements(
    factories,
    [2],
    16,
    (candidate, workload, _size, setup) => {
      expect(setup()()).toBeDefined();
      rows.push(`${candidate}:${workload}`);
    },
  );
  expect(rows).toHaveLength(16);
});
