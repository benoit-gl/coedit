import { expect, test } from "vitest";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { measureMixedHistoryLifecycle } from "./historyLifecycle.js";

test.each([
  createYjsIntegratedDocumentCarrierFactory,
  createAutomergeIntegratedDocumentCarrierFactory,
])(
  "mixed histories retain exact detached material across lifecycle",
  (makeFactory) => {
    const factory = makeFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    );
    const result = measureMixedHistoryLifecycle(factory, 12, () =>
      performance.now(),
    );
    expect(result.effectCountBeforeRestore).toBe(12);
    expect(result.visibleTextUnits).toBe(8);
    expect(() => measureMixedHistoryLifecycle(factory, 3, () => 0)).toThrow(
      RangeError,
    );
  },
);

test("rejects a same-length corrupt post-restore edit", () => {
  const factory = createYjsIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
  );
  const corruptingFactory: typeof factory = {
    ...factory,
    load(encoded) {
      const carrier = factory.load(encoded);
      return new Proxy(carrier, {
        get(target, property) {
          if (property === "applyChange") {
            return (change: Parameters<typeof target.applyChange>[0]) => {
              if (change.context?.effectId === "post-restore") {
                target.applyChange({
                  ...change,
                  payloads: (change.payloads ?? []).map((payload) =>
                    payload.kind === "insert-text"
                      ? { ...payload, text: "?" }
                      : payload,
                  ),
                });
              } else target.applyChange(change);
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === "function"
            ? (value.bind(target) as unknown)
            : value;
        },
      });
    },
  };
  expect(() =>
    measureMixedHistoryLifecycle(corruptingFactory, 12, () => 0),
  ).toThrow("Post-restore edit or retained history differs");
});
