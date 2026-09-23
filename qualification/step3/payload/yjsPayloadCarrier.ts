import * as Y from "yjs";

import type {
  PayloadCarrier,
  PayloadCarrierFactory,
  QualificationOrigin,
  QualificationPayloadSnapshot,
  QualificationTextSpan,
} from "./carrier.js";
import {
  assertTextOffset,
  assertTextRange,
  isQualificationFineGrainedMediaType,
} from "./carrier.js";

const ROOT = "payload-root";
const CURRENT_PAYLOAD = "current";
const ORIGIN_ATTRIBUTE = "coedit:origin";

/** Yjs v13 payload adapter used only by Step 3 qualification. */
export class YjsPayloadCarrier implements PayloadCarrier {
  public readonly candidate = "yjs" as const;

  private readonly document: Y.Doc;
  private readonly root: Y.Map<unknown>;

  /** Creates an adapter from fresh or encoded candidate state. */
  public constructor(encoded?: Uint8Array) {
    this.document = new Y.Doc();
    this.root = this.document.getMap(ROOT);
    if (encoded !== undefined) {
      Y.applyUpdate(this.document, encoded);
    }
  }

  /** Projects the current detached payload value. */
  public snapshot(): QualificationPayloadSnapshot {
    const payload = this.currentPayload();
    const kind = payload.get("kind");
    const mediaType = payload.get("mediaType");
    if (
      (kind !== "text" && kind !== "opaque") ||
      typeof mediaType !== "string"
    ) {
      throw new TypeError("Yjs qualification payload metadata is incomplete.");
    }

    if (kind === "opaque") {
      const stored = payload.get("bytes");
      const origin = parseOrigin(payload.get("origin"));
      if (!(stored instanceof Uint8Array)) {
        throw new TypeError("Yjs opaque payload bytes are invalid.");
      }
      return {
        kind,
        mediaType,
        bytes: stored.slice(),
        origin,
      };
    }

    const spans: QualificationTextSpan[] = [];
    let projectedText = "";
    const text = this.currentText(payload);
    const delta = text.toDelta() as readonly {
      readonly insert?: unknown;
      readonly attributes?: Readonly<Record<string, unknown>>;
    }[];
    for (const operation of delta) {
      if (typeof operation.insert !== "string") {
        throw new TypeError(
          "Yjs qualification text must contain only strings.",
        );
      }
      projectedText += operation.insert;
      const origin = parseOrigin(operation.attributes?.[ORIGIN_ATTRIBUTE]);
      const previous = spans.at(-1);
      if (previous !== undefined && previous.origin.id === origin.id) {
        spans[spans.length - 1] = {
          text: previous.text + operation.insert,
          origin: previous.origin,
        };
      } else if (operation.insert.length > 0) {
        spans.push({ text: operation.insert, origin });
      }
    }
    return { kind, mediaType, text: projectedText, spans };
  }

  /** Inserts protected-origin text into the current text payload. */
  public insertText(
    offset: number,
    inserted: string,
    origin: QualificationOrigin,
  ): void {
    const snapshot = this.snapshot();
    if (snapshot.kind !== "text") {
      throw new TypeError(
        "Fine-grained text operations require a text payload.",
      );
    }
    assertTextOffset(offset, snapshot.text);
    if (inserted.length === 0) {
      return;
    }
    this.document.transact(() => {
      this.currentText().insert(offset, inserted, {
        [ORIGIN_ATTRIBUTE]: JSON.stringify(origin),
      });
    });
  }

  /** Deletes one UTF-16 range from the current text payload. */
  public deleteText(start: number, end: number): void {
    const snapshot = this.snapshot();
    if (snapshot.kind !== "text") {
      throw new TypeError(
        "Fine-grained text operations require a text payload.",
      );
    }
    assertTextRange(start, end, snapshot.text);
    if (start !== end) {
      this.currentText().delete(start, end - start);
    }
  }

  /** Atomically installs a fresh shared text payload. */
  public replaceText(
    mediaType: string,
    text: string,
    origin: QualificationOrigin,
  ): void {
    if (!isQualificationFineGrainedMediaType(mediaType)) {
      throw new TypeError(
        "Qualification text replacement requires an allowlisted Media Type.",
      );
    }
    this.document.transact(() => {
      const payload = new Y.Map<unknown>();
      const payloadText = new Y.Text();
      payload.set("kind", "text");
      payload.set("mediaType", mediaType);
      if (text.length > 0) {
        payloadText.insert(0, text, {
          [ORIGIN_ATTRIBUTE]: JSON.stringify(origin),
        });
      }
      payload.set("text", payloadText);
      this.root.set(CURRENT_PAYLOAD, payload);
    });
  }

  /** Atomically installs a fresh shared opaque payload. */
  public replaceOpaque(
    mediaType: string,
    bytes: Uint8Array,
    origin: QualificationOrigin,
  ): void {
    if (isQualificationFineGrainedMediaType(mediaType)) {
      throw new TypeError(
        "Allowlisted Media Types must use the text qualification path.",
      );
    }
    this.document.transact(() => {
      const payload = new Y.Map<unknown>();
      payload.set("kind", "opaque");
      payload.set("mediaType", mediaType);
      payload.set("bytes", bytes.slice());
      payload.set("origin", JSON.stringify(origin));
      this.root.set(CURRENT_PAYLOAD, payload);
    });
  }

  /** Encodes this replica for reload or collaboration. */
  public encode(): Uint8Array {
    return Y.encodeStateAsUpdate(this.document);
  }

  /** Applies encoded state from another replica. */
  public mergeEncoded(encoded: Uint8Array): void {
    Y.applyUpdate(this.document, encoded);
  }

  private currentPayload(): Y.Map<unknown> {
    const payload = this.root.get(CURRENT_PAYLOAD);
    if (!(payload instanceof Y.Map)) {
      throw new TypeError("Yjs qualification payload is incomplete.");
    }
    return payload;
  }

  private currentText(payload = this.currentPayload()): Y.Text {
    const text = payload.get("text");
    if (!(text instanceof Y.Text)) {
      throw new TypeError("Yjs qualification text payload is incomplete.");
    }
    return text;
  }
}

/** Factory for the Yjs payload qualification adapter. */
export const yjsPayloadCarrierFactory: PayloadCarrierFactory = {
  candidate: "yjs",
  createText(mediaType, origin) {
    const carrier = new YjsPayloadCarrier();
    carrier.replaceText(mediaType, "", origin);
    return carrier;
  },
  load(encoded) {
    return new YjsPayloadCarrier(encoded);
  },
};

function parseOrigin(value: unknown): QualificationOrigin {
  if (typeof value !== "string") {
    throw new TypeError(
      "Qualification text or opaque payload is missing Origin.",
    );
  }
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("id" in parsed) ||
    typeof parsed.id !== "string" ||
    !("kind" in parsed) ||
    (parsed.kind !== "human" &&
      parsed.kind !== "imported" &&
      parsed.kind !== "automation" &&
      parsed.kind !== "ai" &&
      parsed.kind !== "unknown")
  ) {
    throw new TypeError("Qualification Origin is invalid.");
  }
  return { id: parsed.id, kind: parsed.kind };
}
