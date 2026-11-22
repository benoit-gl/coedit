import * as Y from "yjs";

/** One untimed, pinned-native transaction observation; not a timing or eligibility result. */
export interface YjsRecordWorkObservation {
  /** Number of native client histories in the accepted document before the edit. */
  readonly retainedClients: number;
  /** Scalar records present before publication. */
  readonly priorRecords: number;
  /** Direct native client-store callback visits; excludes other vector traversals. */
  readonly clientStoreVisits: number;
  /** Bytes emitted by the public update listener during this one edit. */
  readonly updateBytes: number;
}

/**
 * Observes one public keyed append after a fixed number of records from independent authors.
 *
 * @remarks
 * This is an invasive Yjs 13.6.32 diagnostic. Mutations use public APIs; only the
 * per-instance native client-map iterator is temporarily wrapped, and restored
 * in finally. Setup, semantic verification and save/reopen are outside the
 * observation. Keys deliberately exercise the native scalar-marker primitive,
 * not a complete validated immutable-run command. Counts are a lower bound;
 * other native state-vector traversal, allocation and engine work are omitted.
 */
export function observeYjsRecordWork(
  retainedClients: number,
  priorRecords: number,
): YjsRecordWorkObservation {
  if (
    !Number.isSafeInteger(retainedClients) ||
    retainedClients < 1 ||
    !Number.isSafeInteger(priorRecords) ||
    priorRecords < retainedClients
  )
    throw new TypeError(
      "Record-work dimensions must be positive safe integers with records >= clients.",
    );
  const accepted = new Y.Doc();
  const records = accepted.getMap<boolean>("records");
  try {
    for (let client = 0; client < retainedClients; client++) {
      const author = client === 0 ? accepted : new Y.Doc();
      try {
        author.transact(() => {
          for (
            let record = client;
            record < priorRecords;
            record += retainedClients
          )
            author.getMap<boolean>("records").set(`record:${record}`, true);
        });
        if (author !== accepted)
          Y.applyUpdate(accepted, Y.encodeStateAsUpdate(author));
      } finally {
        if (author !== accepted) author.destroy();
      }
    }
    if (
      records.size !== priorRecords ||
      accepted.store.clients.size !== retainedClients
    )
      throw new Error("Native client collision or record setup mismatch.");
    const clients = accepted.store.clients;
    const original = Object.getOwnPropertyDescriptor(clients, "forEach");
    const iterate = clients.forEach.bind(clients);
    let clientStoreVisits = 0;
    let updateBytes = 0;
    const collect = (update: Uint8Array): void => {
      updateBytes += update.length;
    };
    accepted.on("update", collect);
    Object.defineProperty(clients, "forEach", {
      configurable: true,
      value: (
        callback: (value: unknown, key: number, map: unknown) => void,
        thisArg?: unknown,
      ): void => {
        iterate.call(clients, (value, key, map) => {
          clientStoreVisits++;
          callback.call(thisArg, value, key, map);
        });
      },
    });
    try {
      accepted.transact(() => records.set("observed-key", true));
    } finally {
      if (original) Object.defineProperty(clients, "forEach", original);
      else Reflect.deleteProperty(clients, "forEach");
      accepted.off("update", collect);
    }
    if (
      records.size !== priorRecords + 1 ||
      records.get("observed-key") !== true
    )
      throw new Error("Observed keyed append changed material unexpectedly.");
    const reopened = new Y.Doc();
    try {
      Y.applyUpdate(reopened, Y.encodeStateAsUpdate(accepted));
      if (
        reopened.getMap<boolean>("records").size !== priorRecords + 1 ||
        reopened.getMap<boolean>("records").get("observed-key") !== true
      )
        throw new Error("Observed keyed append did not survive reopen.");
    } finally {
      reopened.destroy();
    }
    return { retainedClients, priorRecords, clientStoreVisits, updateBytes };
  } finally {
    accepted.destroy();
  }
}
