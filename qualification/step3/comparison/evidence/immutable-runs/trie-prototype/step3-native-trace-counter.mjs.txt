/** Streaming V8 diagnostic counter; no trace text is retained. */
/** Counts exactly one marked interval, retaining partial counts on failure. */
export function createTraceCounter() {
  let active = false;
  let label = null;
  let complete = false;
  let lines = 0;
  let loads = 0;
  let stores = 0;
  let calls = 0;
  const memory = new Map();
  const functions = new Map();
  const names = new Map();
  const top = (map, score) =>
    [...map]
      .sort((a, b) => score(b[1]) - score(a[1]) || a[0].localeCompare(b[0]))
      .slice(0, 20);
  return {
    consume(line) {
      const begin = /^TRACE_BEGIN (\S+)$/.exec(line);
      if (begin) {
        if (label !== null) throw new Error("second or nested TRACE_BEGIN");
        active = true;
        label = begin[1];
        return;
      }
      const end = /^TRACE_END (\S+)$/.exec(line);
      if (end) {
        if (!active || end[1] !== label)
          throw new Error("mismatched TRACE_END");
        active = false;
        complete = true;
        return;
      }
      if (!active) return;
      lines++;
      const event = /^liftoff\s+func:\s*(\d+):.*?\b(load from|store to)\b/.exec(
        line,
      );
      if (event) {
        const row = memory.get(event[1]) ?? { loads: 0, stores: 0 };
        if (event[2] === "load from") {
          loads++;
          row.loads++;
        } else {
          stores++;
          row.stores++;
        }
        memory.set(event[1], row);
      }
      const call =
        /^\s*\d+:\s+[~ ]*wasm-function\[(\d+)\](?:\s+"([^"]*)")?\s+\{/.exec(
          line,
        );
      if (call) {
        calls++;
        if (call[2]) names.set(call[1], call[2]);
        const key = call[2] ? `${call[1]}:${call[2]}` : call[1];
        functions.set(key, (functions.get(key) ?? 0) + 1);
      }
    },
    snapshot() {
      return {
        label,
        complete,
        lines,
        loads,
        stores,
        memoryEvents: loads + stores,
        calls,
        topMemoryFunctions: top(memory, (row) => row.loads + row.stores).map(
          ([id, row]) => ({ id, name: names.get(id) ?? null, ...row }),
        ),
        topCallFunctions: top(functions, (count) => count),
        selectedCallFunctions: [...functions]
          .filter(([key]) =>
            /apply_patches_impl|applyAndReturnPatches|commit_impl|Columns>::splice|make_current_patches|ProgressiveEncoder|materialize|hydrate|diff/.test(
              key,
            ),
          )
          .sort((a, b) => a[0].localeCompare(b[0])),
      };
    },
    finish() {
      if (!complete) throw new Error("missing or incomplete trace interval");
      return this.snapshot();
    },
  };
}
