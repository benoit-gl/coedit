import * as Y from "yjs";

import type { BlockId } from "../../../src/domain/ids.js";
import type { StructuralPositionCodec } from "../../../src/carrier/position.js";
import { parseBlockId } from "../../../src/domain/ids.js";
import type {
  StructuralCarrier,
  StructuralCarrierChange,
  StructuralCarrierEntrySnapshot,
  StructuralCarrierFactory,
  StructuralCarrierSnapshot,
} from "./carrier.js";
import {
  decodeStructuralPlacement,
  encodeStructuralPlacement,
} from "../../../src/carrier/structuralCarrier.js";

const ROOT_ID_NAME = "rootId";
const BLOCKS_NAME = "blocks";
const PLACEMENT_KEY = "placement";
const PAYLOAD_KEY = "payload";
const LIVENESS_KEY = "liveness";
const ROOT_TOKEN = "__root__";
const ROOT_ID_BYTE_LENGTH = 36;
const ENVELOPE_SEPARATOR = 0;

/** Yjs v13 candidate for the accepted flat structural carrier contract. */
export class YjsStructuralCarrier<
  Position,
> implements StructuralCarrier<Position> {
  public readonly candidate = "yjs" as const;

  private readonly positionCodec: StructuralPositionCodec<Position>;
  private readonly document: Y.Doc;
  private readonly metadata: Y.Map<string>;
  private readonly blocks: Y.Map<Y.Map<unknown>>;

  /** Creates structural genesis or reloads one complete encoded state. */
  public constructor(
    positionCodec: StructuralPositionCodec<Position>,
    rootId?: BlockId,
    encoded?: Uint8Array,
  ) {
    this.positionCodec = positionCodec;
    this.document = new Y.Doc();
    this.metadata = this.document.getMap<string>(ROOT_ID_NAME);
    this.blocks = this.document.getMap<Y.Map<unknown>>(BLOCKS_NAME);
    if (encoded !== undefined) {
      const decoded = decodeYjsStructuralState(encoded);
      if (rootId !== undefined && decoded.rootId !== rootId) {
        throw new TypeError(
          "Structural replicas must share one root identity.",
        );
      }
      Y.applyUpdate(this.document, decoded.update);
      if (this.metadata.get(ROOT_ID_NAME) !== decoded.rootId) {
        throw new TypeError("Structural carrier root identity is invalid.");
      }
    }
    if (rootId !== undefined) {
      this.initializeRoot(rootId);
    }
    if (this.metadata.get(ROOT_ID_NAME) === undefined) {
      throw new TypeError("Structural carrier state has no root identity.");
    }
  }

  /** Applies one all-or-none structural carrier transaction. */
  public applyChange(change: StructuralCarrierChange<Position>): void {
    const prepared = this.prepareChange(change);
    this.document.transact(() => {
      for (const blockId of change.deletes ?? []) {
        this.retireObservedTokens(blockId);
      }
      for (const [index, update] of (
        change.normalizations ?? []
      ).entries()) {
        const entry = this.requireEntry(update.blockId);
        entry.set(PLACEMENT_KEY, prepared.normalizations[index]!);
      }
      for (const [index, update] of (change.placements ?? []).entries()) {
        const entry = this.requireOrCreateEntry(update.blockId);
        entry.set(PLACEMENT_KEY, prepared.placements[index]!);
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
  public snapshot(): StructuralCarrierSnapshot<Position> {
    const entries: StructuralCarrierEntrySnapshot<Position>[] = [];
    for (const [rawBlockId, entry] of this.blocks.entries()) {
      const blockId = parseBlockId(rawBlockId);
      const placementValue = entry.get(PLACEMENT_KEY);
      const placement =
        typeof placementValue === "string"
          ? decodeStructuralPlacement(placementValue, this.positionCodec)
          : undefined;
      const payload = Object.fromEntries(this.payload(entry).entries());
      const live = [...this.liveness(entry).values()].some(
        (value) => value === true,
      );
      entries.push({
        blockId,
        ...(placement === undefined ? {} : { placement }),
        payload,
        live,
      });
    }
    entries.sort((left, right) => left.blockId.localeCompare(right.blockId));
    return {
      rootId: parseBlockId(this.metadata.get(ROOT_ID_NAME)!),
      entries: structuredClone(entries),
    };
  }

  /** Encodes complete Yjs structural state with its immutable root identity. */
  public encode(): Uint8Array {
    return encodeYjsStructuralState(
      parseBlockId(this.metadata.get(ROOT_ID_NAME)!),
      Y.encodeStateAsUpdate(this.document),
    );
  }

  /** Merges one complete or incremental encoded Yjs state from the same root. */
  public mergeEncoded(encoded: Uint8Array): void {
    const currentRoot = parseBlockId(this.metadata.get(ROOT_ID_NAME)!);
    const decoded = decodeYjsStructuralState(encoded);
    if (decoded.rootId !== currentRoot) {
      throw new TypeError("Structural replicas must share one root identity.");
    }

    const staged = new Y.Doc();
    Y.applyUpdate(staged, Y.encodeStateAsUpdate(this.document));
    Y.applyUpdate(staged, decoded.update);
    if (
      staged.getMap<string>(ROOT_ID_NAME).get(ROOT_ID_NAME) !== currentRoot
    ) {
      throw new TypeError("Structural carrier root identity is invalid.");
    }

    Y.applyUpdate(this.document, decoded.update);
  }

  /**
   * Validates one complete change before the non-rollback Yjs transaction begins.
   *
   * @remarks
   * Every expected validation and position-codec failure is resolved before
   * mutation so a later operation cannot expose a partially applied change.
   */
  private prepareChange(change: StructuralCarrierChange<Position>): {
    readonly normalizations: readonly string[];
    readonly placements: readonly string[];
  } {
    for (const blockId of change.deletes ?? []) {
      this.assertNonRoot(blockId);
      this.liveness(this.requireEntry(blockId));
    }

    const normalizations = (change.normalizations ?? []).map((update) => {
      this.assertNonRoot(update.blockId);
      this.requireEntry(update.blockId);
      return encodeStructuralPlacement(update.placement, this.positionCodec);
    });

    const created = new Set<BlockId>();
    const placements = (change.placements ?? []).map((update) => {
      this.assertNonRoot(update.blockId);
      const existing = this.blocks.get(update.blockId);
      if (existing !== undefined) {
        this.liveness(existing);
      }
      const encodedPlacement = encodeStructuralPlacement(
        update.placement,
        this.positionCodec,
      );
      created.add(update.blockId);
      return encodedPlacement;
    });

    for (const update of change.payloads ?? []) {
      const existing = this.blocks.get(update.blockId);
      if (existing === undefined) {
        if (!created.has(update.blockId)) {
          throw new TypeError(
            "Structural update requires an existing Block namespace.",
          );
        }
        continue;
      }
      this.payload(existing);
      this.liveness(existing);
    }

    return { normalizations, placements };
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

/** Creates a Yjs structural carrier factory for one opaque position codec. */
export function createYjsStructuralCarrierFactory<Position>(
  positionCodec: StructuralPositionCodec<Position>,
): StructuralCarrierFactory<Position> {
  return {
    candidate: "yjs",
    create: (rootId) => new YjsStructuralCarrier(positionCodec, rootId),
    load: (encoded) =>
      new YjsStructuralCarrier(positionCodec, undefined, encoded),
  };
}

/*
 * Keep root identity outside the Yjs update so even an incremental update can be
 * rejected before it reaches the local document.
 */
function encodeYjsStructuralState(
  rootId: BlockId,
  update: Uint8Array,
): Uint8Array {
  const encoded = new Uint8Array(ROOT_ID_BYTE_LENGTH + 1 + update.length);
  for (let index = 0; index < ROOT_ID_BYTE_LENGTH; index += 1) {
    encoded[index] = rootId.charCodeAt(index);
  }
  encoded[ROOT_ID_BYTE_LENGTH] = ENVELOPE_SEPARATOR;
  encoded.set(update, ROOT_ID_BYTE_LENGTH + 1);
  return encoded;
}

function decodeYjsStructuralState(encoded: Uint8Array): {
  readonly rootId: BlockId;
  readonly update: Uint8Array;
} {
  if (
    encoded.length < ROOT_ID_BYTE_LENGTH + 1 ||
    encoded[ROOT_ID_BYTE_LENGTH] !== ENVELOPE_SEPARATOR
  ) {
    throw new TypeError("Yjs structural state envelope is invalid.");
  }
  let rawRootId = "";
  for (let index = 0; index < ROOT_ID_BYTE_LENGTH; index += 1) {
    rawRootId += String.fromCharCode(encoded[index]!);
  }
  return {
    rootId: parseBlockId(rawRootId),
    update: encoded.subarray(ROOT_ID_BYTE_LENGTH + 1),
  };
}
