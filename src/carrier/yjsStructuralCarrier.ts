import * as Y from "yjs";

import type { BlockId } from "../domain/ids.js";
import { parseBlockId } from "../domain/ids.js";
import type {
  StructuralCarrier,
  StructuralCarrierChange,
  StructuralCarrierEntrySnapshot,
  StructuralCarrierFactory,
  StructuralCarrierSnapshot,
} from "./structuralCarrier.js";
import {
  decodeStructuralPlacement,
  encodeStructuralPlacement,
} from "./structuralCarrier.js";

const ROOT_ID_NAME = "rootId";
const BLOCKS_NAME = "blocks";
const PLACEMENT_KEY = "placement";
const PAYLOAD_KEY = "payload";
const LIVENESS_KEY = "liveness";
const ROOT_TOKEN = "__root__";

/** Yjs v13 candidate for the accepted flat structural carrier contract. */
export class YjsStructuralCarrier implements StructuralCarrier {
  public readonly candidate = "yjs" as const;

  private readonly document: Y.Doc;
  private readonly metadata: Y.Map<string>;
  private readonly blocks: Y.Map<Y.Map<unknown>>;

  /** Creates structural genesis or reloads one complete encoded state. */
  public constructor(rootId?: BlockId, encoded?: Uint8Array) {
    this.document = new Y.Doc();
    this.metadata = this.document.getMap<string>(ROOT_ID_NAME);
    this.blocks = this.document.getMap<Y.Map<unknown>>(BLOCKS_NAME);
    if (encoded !== undefined) {
      Y.applyUpdate(this.document, encoded);
    }
    if (rootId !== undefined) {
      this.initializeRoot(rootId);
    }
    if (this.metadata.get(ROOT_ID_NAME) === undefined) {
      throw new TypeError("Structural carrier state has no root identity.");
    }
  }

  /** Applies one all-or-none structural carrier transaction. */
  public applyChange(change: StructuralCarrierChange): void {
    this.document.transact(() => {
      for (const blockId of change.deletes ?? []) {
        this.retireObservedTokens(blockId);
      }
      for (const update of change.placements ?? []) {
        this.assertNonRoot(update.blockId);
        const entry = this.requireOrCreateEntry(update.blockId);
        entry.set(PLACEMENT_KEY, encodeStructuralPlacement(update.placement));
        this.liveness(entry).set(update.liveToken, true);
      }
      for (const update of change.payloads ?? []) {
        const entry = this.requireEntry(update.blockId);
        this.payload(entry).set(update.key, update.value);
        this.liveness(entry).set(update.liveToken, true);
      }
    });
  }

  /** Projects detached physical namespaces, including tombstones. */
  public snapshot(): StructuralCarrierSnapshot {
    const entries: StructuralCarrierEntrySnapshot[] = [];
    for (const [rawBlockId, entry] of this.blocks.entries()) {
      const blockId = parseBlockId(rawBlockId);
      const placementValue = entry.get(PLACEMENT_KEY);
      const placement =
        typeof placementValue === "string"
          ? decodeStructuralPlacement(placementValue)
          : undefined;
      const payload = Object.fromEntries(this.payload(entry).entries());
      const live = [...this.liveness(entry).values()].some(
        (value) => value === true,
      );
      entries.push({ blockId, placement, payload, live });
    }
    entries.sort((left, right) => left.blockId.localeCompare(right.blockId));
    return {
      rootId: parseBlockId(this.metadata.get(ROOT_ID_NAME)!),
      entries: structuredClone(entries),
    };
  }

  /** Encodes complete Yjs structural state. */
  public encode(): Uint8Array {
    return Y.encodeStateAsUpdate(this.document);
  }

  /** Merges one complete or incremental Yjs update. */
  public mergeEncoded(encoded: Uint8Array): void {
    Y.applyUpdate(this.document, encoded);
  }

  private initializeRoot(rootId: BlockId): void {
    this.document.transact(() => {
      const existingRoot = this.metadata.get(ROOT_ID_NAME);
      if (existingRoot !== undefined && existingRoot !== rootId) {
        throw new TypeError("Structural carrier root identity cannot change.");
      }
      this.metadata.set(ROOT_ID_NAME, rootId);
      const entry = this.requireOrCreateEntry(rootId);
      this.liveness(entry).set(ROOT_TOKEN, true);
    });
  }

  private retireObservedTokens(blockId: BlockId): void {
    this.assertNonRoot(blockId);
    const entry = this.requireEntry(blockId);
    const liveness = this.liveness(entry);
    for (const [token, live] of liveness.entries()) {
      if (live) {
        liveness.set(token, false);
      }
    }
  }

  private requireOrCreateEntry(blockId: BlockId): Y.Map<unknown> {
    const existing = this.blocks.get(blockId);
    if (existing !== undefined) {
      return existing;
    }
    const entry = new Y.Map<unknown>();
    const payload = new Y.Map<string>();
    const liveness = new Y.Map<boolean>();
    entry.set(PAYLOAD_KEY, payload);
    entry.set(LIVENESS_KEY, liveness);
    this.blocks.set(blockId, entry);
    return entry;
  }

  private requireEntry(blockId: BlockId): Y.Map<unknown> {
    const entry = this.blocks.get(blockId);
    if (entry === undefined) {
      throw new TypeError(
        "Structural update requires an existing Block namespace.",
      );
    }
    return entry;
  }

  private payload(entry: Y.Map<unknown>): Y.Map<string> {
    const value = entry.get(PAYLOAD_KEY);
    if (!(value instanceof Y.Map)) {
      throw new TypeError("Structural Block payload namespace is invalid.");
    }
    return value as Y.Map<string>;
  }

  private liveness(entry: Y.Map<unknown>): Y.Map<boolean> {
    const value = entry.get(LIVENESS_KEY);
    if (!(value instanceof Y.Map)) {
      throw new TypeError("Structural Block liveness namespace is invalid.");
    }
    return value as Y.Map<boolean>;
  }

  private assertNonRoot(blockId: BlockId): void {
    if (blockId === this.metadata.get(ROOT_ID_NAME)) {
      throw new TypeError("The structural root cannot be moved or deleted.");
    }
  }
}

/** Factory for the common Yjs structural qualification suite. */
export const yjsStructuralCarrierFactory: StructuralCarrierFactory = {
  candidate: "yjs",
  create: (rootId) => new YjsStructuralCarrier(rootId),
  load: (encoded) => new YjsStructuralCarrier(undefined, encoded),
};
