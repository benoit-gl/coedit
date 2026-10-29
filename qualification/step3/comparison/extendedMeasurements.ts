import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { buildRetainedRangeScalingFixture } from "../integrated/rangeScaling.js";
import { resolveProbeRange } from "../integrated/rangeProbe.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";
import type { IntegratedDocumentCarrierFactory } from "../integrated/carrier.js";

/** The caller times only the returned operation; setup is outside the interval. */
export type ExtendedBench = (
  candidate: string,
  workload: string,
  size: number,
  setup: () => () => Record<string, unknown>,
) => void;

const uuid = (n: number) =>
  `70000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const root = parseBlockId(uuid(1));
const block = parseBlockId(uuid(4));
const textId = parseInlineContentId(uuid(2));
const opaqueId = parseInlineContentId(uuid(3));
const origin = { id: "benchmark-author", kind: "human" } as const;

/**
 * Register paired headless measurements. Each timed closure includes its stated
 * operation and invariant checks, but excludes fixture creation. It does not
 * include encoding unless the workload says so. Retained holders are private
 * probe values, not registered product Range objects.
 */
export function runExtendedMeasurements(
  factories: readonly IntegratedDocumentCarrierFactory<LocalDensePosition>[],
  holderCounts: readonly number[],
  sourceLength: number,
  bench: ExtendedBench,
): void {
  if (
    !Number.isSafeInteger(sourceLength) ||
    sourceLength < 5 ||
    holderCounts.some((n) => !Number.isSafeInteger(n) || n < 1)
  )
    throw new RangeError("Invalid Range measurement profile.");
  const allocated = localDensePositionAllocator.allocateRun({
    count: 1,
    context: { runNonce: uuid(99) },
  });
  if (!allocated.ok) throw new Error("Position allocation failed.");
  const position = allocated.value[0];
  if (!position) throw new Error("Position missing.");
  for (const factory of factories) {
    const seed = () => {
      const carrier = factory.create(root);
      carrier.applyChange({
        inlineContents: [{ inlineContentId: textId, blockId: root }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: textId,
            mediaType: "text/plain",
            text: "a".repeat(sourceLength),
            origin,
          },
        ],
      });
      return carrier;
    };
    bench(factory.candidate, "atomic-structure-multiple-payloads", 2, () => {
      const carrier = seed();
      return () => {
        carrier.applyChange({
          placements: [{ blockId: block, placement: { position, depth: 1 } }],
          inlineContents: [{ inlineContentId: opaqueId, blockId: block }],
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: textId,
              offset: 1,
              text: "x",
              origin,
            },
            {
              kind: "replace-opaque",
              inlineContentId: opaqueId,
              mediaType: "application/example",
              bytes: new Uint8Array([1, 2, 3]),
              origin,
            },
          ],
          context: { actorId: "bench", effectId: "atomic" },
        });
        const snapshot = carrier.snapshot();
        const text = snapshot.payloads.get(textId),
          opaque = snapshot.payloads.get(opaqueId);
        if (
          !snapshot.blockLiveness.get(block) ||
          snapshot.inlineContentOwners.get(opaqueId) !== block ||
          text?.kind !== "text" ||
          text.text.length !== sourceLength + 1 ||
          opaque?.kind !== "opaque" ||
          opaque.bytes.length !== 3 ||
          carrier.effects().size !== 1
        )
          throw new Error("Atomic projection differs.");
        return { payloads: 2, effects: carrier.effects().size };
      };
    });
    // Only applyChange is timed. The unrelated contents are created during setup;
    // compare scaling rather than interpreting this as browser feedback latency.
    for (const count of [1, 10, 100]) {
      bench(
        factory.candidate,
        "edit-publication-unrelated-contents",
        count,
        () => {
          const carrier = seed();
          for (let i = 0; i < count; i++) {
            const unrelatedId = parseInlineContentId(uuid(1000 + i));
            carrier.applyChange({
              inlineContents: [{ inlineContentId: unrelatedId, blockId: root }],
              payloads: [
                {
                  kind: "replace-text",
                  inlineContentId: unrelatedId,
                  mediaType: "text/plain",
                  text: "unrelated fixture text",
                  origin,
                },
              ],
            });
          }
          return () => {
            carrier.applyChange({
              payloads: [
                {
                  kind: "insert-text",
                  inlineContentId: textId,
                  offset: 1,
                  text: "x",
                  origin,
                },
              ],
            });
            return {
              unrelatedInlineContents: count,
              interval: "applyChange only; no projection or encoding",
            };
          };
        },
      );
    }
    for (const count of holderCounts) {
      const setup = () => {
        const carrier = seed();
        const token = carrier.captureHistoricalState();
        const member = {
          blockId: root,
          inlineContentId: textId,
          start: 2,
          end: 5,
        };
        return { carrier, token, member };
      };
      bench(factory.candidate, "range-construction", count, () => {
        const { carrier, token, member } = setup();
        return () => ({
          holders: buildRetainedRangeScalingFixture(
            carrier,
            token,
            member,
            count,
          ).length,
        });
      });
      bench(factory.candidate, "range-lazy-resolve-one", count, () => {
        const { carrier, token, member } = setup();
        const holders = buildRetainedRangeScalingFixture(
          carrier,
          token,
          member,
          count,
        );
        return () => {
          const result = resolveProbeRange(
            carrier,
            holders[count - 1]!,
            token,
            [],
          );
          if (result.length !== 1 || result[0]?.text !== "aaa")
            throw new Error("Range resolution differs.");
          return { holders: holders.length, resolved: result.length };
        };
      });
      bench(factory.candidate, "edit-with-retained-range-probes", count, () => {
        const { carrier, token, member } = setup();
        const holders = buildRetainedRangeScalingFixture(
          carrier,
          token,
          member,
          count,
        );
        return () => {
          carrier.applyChange({
            payloads: [
              {
                kind: "insert-text",
                inlineContentId: textId,
                offset: 1,
                text: "x",
                origin,
              },
            ],
          });
          const text = carrier.snapshot().payloads.get(textId);
          if (
            text?.kind !== "text" ||
            text.text.length !== sourceLength + 1 ||
            holders.length !== count
          )
            throw new Error("Edit projection differs.");
          return { holders: holders.length };
        };
      });
    }
    bench(
      factory.candidate,
      "reload-and-native-lifecycle",
      sourceLength,
      () => {
        const carrier = seed();
        const token = carrier.captureHistoricalState();
        carrier.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: textId,
              offset: 1,
              text: "x",
              origin,
            },
          ],
        });
        return () => {
          const lifecycle = carrier.nativeLifecycle();
          const encoded = carrier.encode();
          const reloaded = factory.load(encoded);
          const live = reloaded.snapshot().payloads.get(textId);
          const historical = reloaded
            .materializeHistoricalState(token)
            .payloads.get(textId);
          if (
            live?.kind !== "text" ||
            live.text.length !== sourceLength + 1 ||
            historical?.kind !== "text" ||
            historical.text.length !== sourceLength
          )
            throw new Error("Reloaded lifecycle projection differs.");
          return { lifecycle, encodedBytes: encoded.length };
        };
      },
    );
  }
}
