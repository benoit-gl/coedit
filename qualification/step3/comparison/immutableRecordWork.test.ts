import { describe, expect, it } from "vitest";
import { observeYjsRecordWork } from "./immutableRecordWork.js";

describe("Yjs 13.6.32 immutable-record native entry gate", () => {
  it("visits the full retained client frontier during one fixed-size warm append", () => {
    const rows = [1, 8, 32, 128].map((clients) =>
      observeYjsRecordWork(clients, 128),
    );
    expect(rows.map((row) => row.priorRecords)).toEqual([128, 128, 128, 128]);
    // Three installed-native getStateVector passes, not a product timing/capacity limit.
    expect(rows.map((row) => row.clientStoreVisits)).toEqual([3, 24, 96, 384]);
    expect(rows.every((row) => row.updateBytes > 0)).toBe(true);
  });

  it("distinguishes retained client growth from record-count growth under one author", () => {
    const rows = [1, 128, 1024].map((records) =>
      observeYjsRecordWork(1, records),
    );
    expect(rows.map((row) => row.clientStoreVisits)).toEqual([3, 3, 3]);
    expect(() => observeYjsRecordWork(0, 128)).toThrow(TypeError);
  });
});
