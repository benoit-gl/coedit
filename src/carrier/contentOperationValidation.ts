import type { OriginRecord } from "../domain/content.js";
import { isCanonicalUuidV4 } from "../domain/ids.js";
import type { ContentCarrierOperation } from "./contentCarrier.js";
import { encodeMarkKey } from "./markCodec.js";

/** Validates one ordered candidate-runtime content batch without mutation. */
export function validateContentCarrierOperations(
  operations: readonly ContentCarrierOperation[],
  initialRuntimeUtf16Length: number,
  existingOrigins: Iterable<readonly [string, string]>,
): void {
  let length = initialRuntimeUtf16Length;
  const origins = new Map(existingOrigins);

  for (const operation of operations) {
    switch (operation.kind) {
      case "insertText":
        assertRuntimeUtf16Offset(operation.runtimeUtf16Offset, length);
        if (
          operation.text.length === 0 ||
          operation.text.includes("\n") ||
          operation.text.includes("\r")
        ) {
          throw new TypeError(
            "Inserted visible text must be non-empty and contain no hard break.",
          );
        }
        validateOrigin(operation.origin, origins);
        length += operation.text.length;
        break;
      case "insertHardBreak":
        assertRuntimeUtf16Offset(operation.runtimeUtf16Offset, length);
        validateOrigin(operation.origin, origins);
        length += 1;
        break;
      case "deleteRange":
        assertRuntimeUtf16Range(
          operation.startRuntimeUtf16Offset,
          operation.endRuntimeUtf16Offset,
          length,
        );
        length -=
          operation.endRuntimeUtf16Offset - operation.startRuntimeUtf16Offset;
        break;
      case "addMark":
        assertRuntimeUtf16Range(
          operation.startRuntimeUtf16Offset,
          operation.endRuntimeUtf16Offset,
          length,
        );
        if (
          operation.startRuntimeUtf16Offset === operation.endRuntimeUtf16Offset
        ) {
          throw new RangeError("A formatting mark must cover visible content.");
        }
        encodeMarkKey(operation.mark);
        break;
      case "removeMark":
        assertRuntimeUtf16Range(
          operation.startRuntimeUtf16Offset,
          operation.endRuntimeUtf16Offset,
          length,
        );
        encodeMarkKey(operation.mark);
        break;
    }
  }
}

/** Validates one candidate-runtime UTF-16 boundary. */
export function assertRuntimeUtf16Offset(offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > length) {
    throw new RangeError("Carrier runtime UTF-16 offset is outside content.");
  }
}

/** Validates one candidate-runtime UTF-16 range. */
export function assertRuntimeUtf16Range(
  start: number,
  end: number,
  length: number,
): void {
  assertRuntimeUtf16Offset(start, length);
  assertRuntimeUtf16Offset(end, length);
  if (end < start) {
    throw new RangeError("Carrier range end must not precede its start.");
  }
}

function validateOrigin(
  origin: OriginRecord,
  origins: Map<string, string>,
): void {
  if (
    !isCanonicalUuidV4(origin.id) ||
    !isCanonicalUuidV4(origin.agentId) ||
    !isCanonicalUuidV4(origin.createdBy)
  ) {
    throw new TypeError("Origin records require canonical UUID-v4 IDs.");
  }
  const serialized = JSON.stringify(origin);
  const existing = origins.get(origin.id);
  if (existing !== undefined && existing !== serialized) {
    throw new TypeError("An OriginId cannot identify conflicting attribution.");
  }
  origins.set(origin.id, serialized);
}
