import type { IntegratedDocumentChange } from "./carrier.js";

/** Restricts the experiment to payload-only, nonempty ordinary text batches. */
export function isOrdinaryTextChange<Position>(
  change: IntegratedDocumentChange<Position>,
): boolean {
  return (
    (change.placements?.length ?? 0) === 0 &&
    (change.inlineContents?.length ?? 0) === 0 &&
    (change.deleteBlockIds?.length ?? 0) === 0 &&
    (change.payloads?.length ?? 0) > 0 &&
    (change.payloads ?? []).every(
      (payload) =>
        payload.kind === "insert-text" || payload.kind === "delete-text",
    )
  );
}
