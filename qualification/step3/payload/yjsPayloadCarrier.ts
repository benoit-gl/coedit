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

const META = "payload-meta";
const TEXT = "payload-text";
const ORIGIN_ATTRIBUTE = "coedit:origin";

/** Yjs v13 payload adapter used only by Step 3 qualification. */
export class YjsPayloadCarrier implements PayloadCarrier {
  public readonly candidate = "yjs" as const;

  private readonly document: Y.Doc;
  private readonly meta: Y.Map<unknown>;
  private readonly text: Y.Text;

  /** Creates an adapter from fresh or encoded candidate state. */
  public constructor(encoded?: Uint8Array) {
    this.document = new Y.Doc();
    this.meta = this.document.getMap(META);
    this.text = this.document.getText(TEXT);
    if (encoded !== undefined) {
      Y.applyUpdate(this.document, encoded);
    }
  }

  /** {@inheritDoc PayloadCarrier.snapshot} */
  public snapshot(): QualificationPayloadSnapshot {
    const kind = this.meta.get("kind");
    const mediaType = this.meta.get("mediaType");
    if (
      (kind !== "text" && kind !== "opaque") ||
      typeof mediaType !== "string"
    ) {
      throw new TypeError("Yjs qualification payload metadata is incomplete.");
    }

    if (kind === "opaque") {
      const stored = this.meta.get("bytes");
      const origin = parseOrigin(this.meta.get("origin"));
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
    const delta = this.text.toDelta() as readonly {
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

  /** {@inheritDoc PayloadCarrier.insertText} */
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
      this.text.insert(offset, inserted, {
        [ORIGIN_ATTRIBUTE]: JSON.stringify(origin),
      });
    });
  }

  /** {@inheritDoc PayloadCarrier.deleteText} */
  public deleteText(start: number, end: number): void {
    const snapshot = this.snapshot();
    if (snapshot.kind !== "text") {
      throw new TypeError(
        "Fine-grained text operations require a text payload.",
      );
    }
    assertTextRange(start, end, snapshot.text);
    if (start !== end) {
      this.text.delete(start, end - start);
    }
  }

  /** {@inheritDoc PayloadCarrier.replaceText} */
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
      if (this.text.length > 0) {
        this.text.delete(0, this.text.length);
      }
      this.meta.set("kind", "text");
      this.meta.set("mediaType", mediaType);
      this.meta.delete("bytes");
      this.meta.delete("origin");
      if (text.length > 0) {
        this.text.insert(0, text, {
          [ORIGIN_ATTRIBUTE]: JSON.stringify(origin),
        });
      }
    });
  }

  /** {@inheritDoc PayloadCarrier.replaceOpaque} */
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
      if (this.text.length > 0) {
        this.text.delete(0, this.text.length);
      }
      this.meta.set("kind", "opaque");
      this.meta.set("mediaType", mediaType);
      this.meta.set("bytes", bytes.slice());
      this.meta.set("origin", JSON.stringify(origin));
    });
  }

  /** {@inheritDoc PayloadCarrier.encode} */
  public encode(): Uint8Array {
    return Y.encodeStateAsUpdate(this.document);
  }

  /** {@inheritDoc PayloadCarrier.mergeEncoded} */
  public mergeEncoded(encoded: Uint8Array): void {
    Y.applyUpdate(this.document, encoded);
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
