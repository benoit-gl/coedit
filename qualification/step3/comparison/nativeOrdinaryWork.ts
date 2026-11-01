import automergePackage from "../../../node_modules/@automerge/automerge/package.json";
import yjsPackage from "../../../node_modules/yjs/package.json";
import * as Y from "yjs";
import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";

const uuid = (n: number): string =>
  `a1000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const root = parseBlockId(uuid(1));
const target = parseInlineContentId(uuid(2));
const origin = { id: "native-work", kind: "human" } as const;

function observe(unrelatedCount: number, historyEdits: number) {
  const factory = createAutomergeIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
    { ordinaryEditVariant: "incremental" },
  );
  const carrier = factory.create(root);
  const ids = Array.from({ length: unrelatedCount }, (_, i) =>
    parseInlineContentId(uuid(i + 3)),
  );
  carrier.applyChange({
    inlineContents: [target, ...ids].map((inlineContentId) => ({
      inlineContentId,
      blockId: root,
    })),
    payloads: [target, ...ids].map((inlineContentId) => ({
      kind: "replace-text" as const,
      inlineContentId,
      mediaType: "text/plain",
      text: "ab",
      origin,
    })),
    context: { actorId: "native-work", effectId: "seed" },
  });
  for (let i = 0; i < historyEdits; i++) {
    carrier.applyChange({
      payloads: [
        i % 2 === 0
          ? {
              kind: "insert-text",
              inlineContentId: target,
              offset: 1,
              text: "x",
              origin,
            }
          : { kind: "delete-text", inlineContentId: target, start: 1, end: 2 },
      ],
      context: { actorId: "native-work", effectId: `history-${i}` },
    });
  }
  if (!carrier.prepareOrdinaryText())
    throw new Error("Incremental target proof was not established.");
  const revision = carrier.readOrdinaryTextRange(target, 0, 0)?.revision;
  if (revision === undefined)
    throw new Error("Incremental target is unavailable.");
  const copies: { keys: number; targetKey: boolean; unrelatedKeys: number }[] =
    [];
  const original = Object.assign;
  Object.assign = new Proxy(original, {
    apply(fn, thisArg: unknown, args: unknown[]) {
      for (const value of args.slice(1)) {
        if (typeof value !== "object" || value === null) continue;
        const keys = Object.keys(value);
        copies.push({
          keys: keys.length,
          targetKey: keys.includes(target),
          unrelatedKeys: ids.filter((id) => keys.includes(id)).length,
        });
      }
      const result: unknown = Reflect.apply(fn, thisArg, args);
      return result;
    },
  });
  try {
    carrier.applyOrdinaryChange(
      {
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: target,
            offset: 1,
            text: "X",
            origin,
          },
        ],
        context: { actorId: "native-work", effectId: "observed" },
      },
      revision,
    );
  } finally {
    Object.assign = original;
  }
  const payload = carrier.snapshot().payloads.get(target);
  if (payload?.kind !== "text" || payload.text !== "aXb")
    throw new Error("Native observation changed the expected semantic result.");
  return { unrelatedCount, historyEdits, copies };
}

function observeYjs(fragmentCount: number, offset: number) {
  const document = new Y.Doc();
  const text = document.getText("text");
  const segmentLength = 1024 / fragmentCount;
  document.transact(() => {
    for (let i = 0; i < fragmentCount; i++) {
      text.insert(i * segmentLength, "a".repeat(segmentLength), {
        "coedit:origin": JSON.stringify({ id: `origin-${i}`, kind: "human" }),
      });
    }
  });
  const items: NonNullable<typeof text._start>[] = [];
  for (let item = text._start; item !== null; item = item.right)
    items.push(item);
  let rightReads = 0;
  const visited = new Set<NonNullable<typeof text._start>>();
  const restore: (() => void)[] = [];
  try {
    for (const item of items) {
      const descriptor = Object.getOwnPropertyDescriptor(item, "right");
      if (!descriptor || !("value" in descriptor) || !descriptor.configurable)
        throw new Error("Unsupported Yjs Item.right descriptor.");
      let current = item.right;
      Object.defineProperty(item, "right", {
        configurable: true,
        enumerable: descriptor.enumerable ?? false,
        get() {
          rightReads++;
          visited.add(item);
          return current;
        },
        set(value: typeof current) {
          current = value;
        },
      });
      restore.push(() =>
        Object.defineProperty(item, "right", { ...descriptor, value: current }),
      );
    }
    text.insert(offset, "X", { "coedit:origin": JSON.stringify(origin) });
  } finally {
    for (const reset of restore) reset();
  }
  const expected = "a".repeat(offset) + "X" + "a".repeat(1024 - offset);
  if (text.toJSON() !== expected)
    throw new Error("Yjs observed text mismatch.");
  const reopened = new Y.Doc();
  Y.applyUpdate(reopened, Y.encodeStateAsUpdate(document));
  if (reopened.getText("text").toJSON() !== expected)
    throw new Error("Yjs observed text did not survive reload.");
  reopened.destroy();
  document.destroy();
  return {
    fragmentCount,
    offset,
    existingItems: items.length,
    rightReads,
    uniqueItemsRead: visited.size,
  };
}

/**
 * Observes installed native publication work in a bounded, untimed fixture.
 *
 * @remarks
 * The temporary Object.assign proxy observes shallow-copy source keys in the
 * synchronous Automerge path; it is restored even if publication fails. It does
 * not observe WASM traversal, JS engine copying, or all possible native work.
 */
export function runNativeOrdinaryWork(): Record<string, unknown> {
  return {
    versions: {
      automerge: automergePackage.version,
      yjs: yjsPackage.version,
    },
    method:
      "Integrated incremental attributed insertion; Object.assign source keys observed synchronously, setup and verification excluded; no timings.",
    automerge: [0, 20, 100].flatMap((count) =>
      [0, 100].map((history) => observe(count, history)),
    ),
    yjs: {
      source:
        "node_modules/yjs/src/types/YText.js: findPosition, findNextPosition and insert",
      observation:
        "Attributed insertion passes !attributes as useSearchMarker; the path starts at the target text's first item and advances to the offset. Fragmentation and deleted items can increase target-local traversal.",
      method:
        "A private, version-specific descriptor probe counts right-link reads on preexisting items during a single attributed Y.Text insertion; original descriptors and current links are restored before text and encoded-reload verification. Counts include search and cleanup; newly created items are not instrumented. Setup and verification are excluded, and no timing is measured.",
      rows: [1, 32, 256, 1024].flatMap((fragments) =>
        [0, 512, 1024].map((offset) => observeYjs(fragments, offset)),
      ),
      limitation:
        "The probe is invasive and version-specific; it does not instrument newly created items, all native work, JS engine costs, or unrelated payloads.",
    },
    limitations: [
      "Object.assign instrumentation itself enumerates keys and adds work; observations are not timings.",
      "Copied keys identify matching InlineContent IDs, not map identity or recursively copied content.",
      "History edits also grow native history, liveness tokens, and attributed effects; their costs are not isolated.",
      "The observation does not cover all native traversal, allocation, browser behavior, or other versions.",
    ],
  };
}
