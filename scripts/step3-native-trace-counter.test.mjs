import { describe, expect, it } from "vitest";
import { createTraceCounter } from "./step3-native-trace-counter.mjs";

describe("native publication trace interval", () => {
  it("counts only bounded native calls and memory accesses", () => {
    const counter = createTraceCounter();
    for (const line of [
      '  1: ~wasm-function[9] "startup" {',
      "TRACE_BEGIN ordinary-4",
      '  1: ~wasm-function[7] "commit_impl" {',
      '  2:  wasm-function[7] "commit_impl" {',
      "liftoff func: 7: 0x001 load from 0x123",
      "liftoff func: 7: 0x002 store to 0x124",
      "other native output",
      "TRACE_END ordinary-4",
      "liftoff func: 9: load from 0x000",
    ])
      counter.consume(line);
    const result = counter.finish();
    expect(result).toMatchObject({
      complete: true,
      label: "ordinary-4",
      lines: 5,
      calls: 2,
      loads: 1,
      stores: 1,
      memoryEvents: 2,
    });
    expect(result.topMemoryFunctions).toEqual([
      { id: "7", name: "commit_impl", loads: 1, stores: 1 },
    ]);
    expect(result.selectedCallFunctions).toEqual([["7:commit_impl", 2]]);
  });

  it("keeps incomplete counts without certifying completion", () => {
    const counter = createTraceCounter();
    counter.consume("TRACE_BEGIN partial");
    counter.consume("  1: ~wasm-function[1] {");
    expect(counter.snapshot()).toMatchObject({ complete: false, calls: 1 });
    expect(() => counter.finish()).toThrow("incomplete");
    expect(() => createTraceCounter().finish()).toThrow("incomplete");
  });

  it("rejects mismatched, nested, and duplicate intervals", () => {
    const counter = createTraceCounter();
    expect(() => counter.consume("TRACE_END wrong")).toThrow("mismatched");
    counter.consume("TRACE_BEGIN first");
    expect(() => counter.consume("TRACE_BEGIN second")).toThrow("nested");
    expect(() => counter.consume("TRACE_END second")).toThrow("mismatched");
    counter.consume("TRACE_END first");
    expect(() => counter.consume("TRACE_BEGIN second")).toThrow("second");
    expect(() => counter.consume("TRACE_END first")).toThrow("mismatched");
  });
});
