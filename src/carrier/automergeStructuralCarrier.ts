import * as Automerge from "@automerge/automerge";

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

const ROOT_TOKEN = "__root__";

interface AutomergeStructuralEntry extends Record<string, unknown> {
  placement?: string;
  payload: Record<string, string>;
  liveness: Record<string, boolean>;
}

interface AutomergeStructuralState extends Record<string, unknown> {
  rootId: string;
  blocks: Record<string, AutomergeStructuralEntry>;
}

/** Automerge v3 candidate for the accepted flat structural carrier contract. */
export class AutomergeStructuralCarrier implements StructuralCarrier {
  public readonly candidate = "automerge" as const;

  private document: Automerge.Doc<AutomergeStructuralState>;

  /** Creates structural genesis or reloads one complete encoded state. */
  public constructor(rootId?: BlockId, encoded?: Uint8Array) {
    if (encoded !== undefined) {
      this.document = Automerge.load<AutomergeStructuralState>(encoded);
    } else if (rootId !== undefined) {
      this.document = Automerge.from<AutomergeStructuralState>({
        rootId,
        blocks: {
          [rootId]: {
            payload: {},
            liveness: { [ROOT_TOKEN]: true },
          },
        },
      });
    } else {
      throw new TypeError(
        "Structural carrier creation requires a root identity.",
      );
    }
    parseBlockId(this.document.rootId);
  }

  /** Applies one all-or-none Automerge structural change. */
  public applyChange(change: StructuralCarrierChange): void {
    const rootId = this.document.rootId;
    this.document = Automerge.change(this.document, (draft) => {
      for (const blockId of change.deletes ?? []) {
        if (blockId === rootId) {
          throw new TypeError(
            "The structural root cannot be moved or deleted.",
          );
        }
        const entry = requireDraftEntry(draft, blockId);
        for (const token of Object.keys(entry.liveness)) {
          if (entry.liveness[token] === true) {
            entry.liveness[token] = false;
          }
        }
      }
      for (const update of change.placements ?? []) {
        if (update.blockId === rootId) {
          throw new TypeError(
            "The structural root cannot be moved or deleted.",
          );
        }
        const entry = requireOrCreateDraftEntry(draft, update.blockId);
        entry.placement = encodeStructuralPlacement(update.placement);
        entry.liveness[update.liveToken] = true;
      }
      for (const update of change.payloads ?? []) {
        const entry = requireDraftEntry(draft, update.blockId);
        entry.payload[update.key] = update.value;
        entry.liveness[update.liveToken] = true;
      }
    });
  }

  /** Projects detached physical namespaces, including tombstones. */
  public snapshot(): StructuralCarrierSnapshot {
    const entries: StructuralCarrierEntrySnapshot[] = [];
    for (const [rawBlockId, entry] of Object.entries(this.document.blocks)) {
      const blockId = parseBlockId(rawBlockId);
      entries.push({
        blockId,
        ...(entry.placement === undefined
          ? {}
          : { placement: decodeStructuralPlacement(entry.placement) }),
        payload: structuredClone(entry.payload),
        live: Object.values(entry.liveness).some((value) => value === true),
      });
    }
    entries.sort((left, right) => left.blockId.localeCompare(right.blockId));
    return {
      rootId: parseBlockId(this.document.rootId),
      entries: structuredClone(entries),
    };
  }

  /** Saves complete Automerge structural state. */
  public encode(): Uint8Array {
    return Automerge.save(this.document);
  }

  /** Loads and merges structural state from another replica. */
  public mergeEncoded(encoded: Uint8Array): void {
    const remote = Automerge.load<AutomergeStructuralState>(encoded);
    if (remote.rootId !== this.document.rootId) {
      throw new TypeError("Structural replicas must share one root identity.");
    }
    this.document = Automerge.merge(this.document, remote);
  }
}

/** Factory for the common Automerge structural qualification suite. */
export const automergeStructuralCarrierFactory: StructuralCarrierFactory = {
  candidate: "automerge",
  create: (rootId) => new AutomergeStructuralCarrier(rootId),
  load: (encoded) => new AutomergeStructuralCarrier(undefined, encoded),
};

function requireDraftEntry(
  draft: Automerge.ChangeFn<AutomergeStructuralState> extends (
    value: infer Draft,
  ) => unknown
    ? Draft
    : never,
  blockId: BlockId,
): AutomergeStructuralEntry {
  const entry = draft.blocks[blockId];
  if (entry === undefined) {
    throw new TypeError(
      "Structural update requires an existing Block namespace.",
    );
  }
  return entry;
}

function requireOrCreateDraftEntry(
  draft: Automerge.ChangeFn<AutomergeStructuralState> extends (
    value: infer Draft,
  ) => unknown
    ? Draft
    : never,
  blockId: BlockId,
): AutomergeStructuralEntry {
  const existing = draft.blocks[blockId];
  if (existing !== undefined) {
    return existing;
  }
  draft.blocks[blockId] = { payload: {}, liveness: {} };
  return draft.blocks[blockId]!;
}
