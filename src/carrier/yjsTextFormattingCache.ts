import type * as Y from "yjs";

import { decodeMarkKey } from "./markCodec.js";

interface YTextDeltaOperation {
  readonly insert?: unknown;
  readonly delete?: number | undefined;
  readonly retain?: number | undefined;
  readonly attributes?: Readonly<Record<string, unknown>> | undefined;
}

interface FormattingRun {
  readonly length: number;
  readonly marks: Readonly<Record<string, true>>;
}

/** Derived Y.Text formatting-run cache used to avoid whole-text scans in local edit hot paths. */
export class YjsTextFormattingCache {
  private runs: FormattingRun[];

  /** Builds the derived cache once and then updates it from Y.Text deltas. */
  public constructor(text: Y.Text, originAttribute: string) {
    const initialDelta: unknown = text.toDelta();
    this.runs = runsFromDelta(parseYTextDelta(initialDelta), originAttribute);
    text.observe((event) => {
      const eventDelta: unknown = event.delta;
      this.runs = applyDeltaToRuns(
        this.runs,
        parseYTextDelta(eventDelta),
        originAttribute,
      );
    });
  }

  /** Returns formatting attributes that must apply to an insertion at one boundary. */
  public attributesAtInsertion(
    runtimeUtf16Offset: number,
  ): Readonly<Record<string, boolean>> {
    const length = totalLength(this.runs);
    if (
      !Number.isSafeInteger(runtimeUtf16Offset) ||
      runtimeUtf16Offset < 0 ||
      runtimeUtf16Offset > length
    ) {
      throw new RangeError("Carrier runtime UTF-16 offset is outside content.");
    }

    const left =
      runtimeUtf16Offset === 0
        ? new Set<string>()
        : markKeysAtOffset(this.runs, runtimeUtf16Offset - 1);
    const right =
      runtimeUtf16Offset === length
        ? new Set<string>()
        : markKeysAtOffset(this.runs, runtimeUtf16Offset);
    const result: Record<string, boolean> = {};

    for (const key of new Set([...left, ...right])) {
      const descriptor = decodeMarkKey(key);
      if (descriptor === undefined) {
        continue;
      }
      if (left.has(key) && right.has(key)) {
        result[key] = true;
        continue;
      }
      if (
        right.has(key) &&
        (descriptor.boundaryPolicy === "start" ||
          descriptor.boundaryPolicy === "both")
      ) {
        result[key] = true;
        continue;
      }
      if (
        left.has(key) &&
        (descriptor.boundaryPolicy === "end" ||
          descriptor.boundaryPolicy === "both")
      ) {
        result[key] = true;
      }
    }
    return result;
  }
}

function parseYTextDelta(value: unknown): readonly YTextDeltaOperation[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Yjs text delta must be an array.");
  }
  return value.map((raw): YTextDeltaOperation => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new TypeError("Yjs text delta operation must be an object.");
    }
    const record = raw as Readonly<Record<string, unknown>>;
    const operation: {
      insert?: unknown;
      delete?: number | undefined;
      retain?: number | undefined;
      attributes?: Readonly<Record<string, unknown>> | undefined;
    } = {};
    if ("insert" in record) {
      operation.insert = record.insert;
    }
    if (record.delete !== undefined) {
      if (
        !Number.isSafeInteger(record.delete) ||
        (record.delete as number) < 0
      ) {
        throw new TypeError("Yjs text delta delete length is invalid.");
      }
      operation.delete = record.delete as number;
    }
    if (record.retain !== undefined) {
      if (
        !Number.isSafeInteger(record.retain) ||
        (record.retain as number) < 0
      ) {
        throw new TypeError("Yjs text delta retain length is invalid.");
      }
      operation.retain = record.retain as number;
    }
    if (record.attributes !== undefined) {
      if (
        typeof record.attributes !== "object" ||
        record.attributes === null ||
        Array.isArray(record.attributes)
      ) {
        throw new TypeError("Yjs text delta attributes must be an object.");
      }
      operation.attributes = record.attributes as Readonly<
        Record<string, unknown>
      >;
    }
    return operation;
  });
}

function runsFromDelta(
  delta: readonly YTextDeltaOperation[],
  originAttribute: string,
): FormattingRun[] {
  const runs: FormattingRun[] = [];
  for (const operation of delta) {
    if (typeof operation.insert !== "string") {
      continue;
    }
    appendRun(
      runs,
      operation.insert.length,
      formattingAttributes(operation.attributes, originAttribute),
    );
  }
  return runs;
}

function applyDeltaToRuns(
  previousRuns: readonly FormattingRun[],
  delta: readonly YTextDeltaOperation[],
  originAttribute: string,
): FormattingRun[] {
  const nextRuns: FormattingRun[] = [];
  const cursor = new RunCursor(previousRuns);

  for (const operation of delta) {
    if (typeof operation.retain === "number") {
      const retained = cursor.take(operation.retain);
      const updates = formattingAttributeUpdates(
        operation.attributes,
        originAttribute,
      );
      for (const run of retained) {
        appendRun(
          nextRuns,
          run.length,
          applyAttributeUpdates(run.marks, updates),
        );
      }
      continue;
    }
    if (typeof operation.delete === "number") {
      cursor.take(operation.delete);
      continue;
    }
    if (typeof operation.insert === "string") {
      appendRun(
        nextRuns,
        operation.insert.length,
        formattingAttributes(operation.attributes, originAttribute),
      );
    }
  }

  for (const run of cursor.takeRemaining()) {
    appendRun(nextRuns, run.length, run.marks);
  }
  return nextRuns;
}

class RunCursor {
  private runIndex = 0;
  private offsetInRun = 0;

  public constructor(private readonly runs: readonly FormattingRun[]) {}

  public take(length: number): FormattingRun[] {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RangeError("Yjs text delta length is invalid.");
    }
    const result: FormattingRun[] = [];
    let remaining = length;
    while (remaining > 0) {
      const run = this.runs[this.runIndex];
      if (run === undefined) {
        throw new RangeError("Yjs text delta exceeds the cached text length.");
      }
      const available = run.length - this.offsetInRun;
      const taken = Math.min(available, remaining);
      appendRun(result, taken, run.marks);
      this.offsetInRun += taken;
      remaining -= taken;
      if (this.offsetInRun === run.length) {
        this.runIndex += 1;
        this.offsetInRun = 0;
      }
    }
    return result;
  }

  public takeRemaining(): FormattingRun[] {
    const result: FormattingRun[] = [];
    const current = this.runs[this.runIndex];
    if (current !== undefined && this.offsetInRun < current.length) {
      appendRun(result, current.length - this.offsetInRun, current.marks);
      this.runIndex += 1;
      this.offsetInRun = 0;
    }
    while (this.runIndex < this.runs.length) {
      const run = this.runs[this.runIndex];
      if (run !== undefined) {
        appendRun(result, run.length, run.marks);
      }
      this.runIndex += 1;
    }
    return result;
  }
}

function formattingAttributes(
  attributes: Readonly<Record<string, unknown>> | undefined,
  originAttribute: string,
): Readonly<Record<string, true>> {
  const marks: Record<string, true> = {};
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (
      key !== originAttribute &&
      value === true &&
      decodeMarkKey(key) !== undefined
    ) {
      marks[key] = true;
    }
  }
  return marks;
}

function formattingAttributeUpdates(
  attributes: Readonly<Record<string, unknown>> | undefined,
  originAttribute: string,
): Readonly<Record<string, boolean | null>> {
  const updates: Record<string, boolean | null> = {};
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (key === originAttribute || decodeMarkKey(key) === undefined) {
      continue;
    }
    if (value === true || value === null) {
      updates[key] = value;
    }
  }
  return updates;
}

function applyAttributeUpdates(
  marks: Readonly<Record<string, true>>,
  updates: Readonly<Record<string, boolean | null>>,
): Readonly<Record<string, true>> {
  if (Object.keys(updates).length === 0) {
    return marks;
  }
  const result: Record<string, true> = { ...marks };
  for (const [key, value] of Object.entries(updates)) {
    if (value === true) {
      result[key] = true;
    } else {
      delete result[key];
    }
  }
  return result;
}

function markKeysAtOffset(
  runs: readonly FormattingRun[],
  runtimeUtf16Offset: number,
): Set<string> {
  let current = 0;
  for (const run of runs) {
    const end = current + run.length;
    if (runtimeUtf16Offset < end) {
      return new Set(Object.keys(run.marks));
    }
    current = end;
  }
  throw new RangeError("Carrier runtime UTF-16 offset is outside content.");
}

function appendRun(
  runs: FormattingRun[],
  length: number,
  marks: Readonly<Record<string, true>>,
): void {
  if (length === 0) {
    return;
  }
  const previous = runs.at(-1);
  if (previous !== undefined && sameMarks(previous.marks, marks)) {
    runs[runs.length - 1] = { length: previous.length + length, marks };
    return;
  }
  runs.push({ length, marks: { ...marks } });
}

function sameMarks(
  left: Readonly<Record<string, true>>,
  right: Readonly<Record<string, true>>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => right[key] === true)
  );
}

function totalLength(runs: readonly FormattingRun[]): number {
  return runs.reduce((total, run) => total + run.length, 0);
}
