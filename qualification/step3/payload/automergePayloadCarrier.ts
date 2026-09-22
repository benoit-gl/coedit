import * as Automerge from "@automerge/automerge";

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

const ORIGIN_MARK = "__coedit_origin";
const TEXT_PATH = ["payload", "text"] as const;

interface TextPayloadState extends Record<string, unknown> {
  kind: "text";
  mediaType: string;
  text: string;
}

interface OpaquePayloadState extends Record<string, unknown> {
  kind: "opaque";
  mediaType: string;
  bytes: number[];
  origin: string;
}

interface AutomergePayloadState extends Record<string, unknown> {
  payload: TextPayloadState | OpaquePayloadState;
}


/** Automerge v3 payload adapter used only by Step 3 qualification. */
export class AutomergePayloadCarrier implements PayloadCarrier {
  public readonly candidate = "automerge" as const;

  private document: Automerge.Doc<AutomergePayloadState>;

  /** Creates an adapter from fresh or encoded candidate state. */
  public constructor(encoded?: Uint8Array) {
    this.document =
      encoded === undefined
        ? Automerge.from<AutomergePayloadState>({
            payload: {
              kind: "text",
              mediaType: "text/plain",
              text: "",
            },
          })
        : Automerge.load<AutomergePayloadState>(encoded);
  }

  /** {@inheritDoc PayloadCarrier.snapshot} */
  public snapshot(): QualificationPayloadSnapshot {
    const payload = this.document.payload;
    if (payload.kind === "opaque") {
      return {
        kind: "opaque",
        mediaType: payload.mediaType,
        bytes: Uint8Array.from(payload.bytes),
        origin: parseOrigin(payload.origin),
      };
    }

    const spans: QualificationTextSpan[] = [];
    const originMarks = Automerge.marks(this.document, [...TEXT_PATH])
      .filter(
        (mark) => mark.name === ORIGIN_MARK && typeof mark.value === "string",
      )
      .sort((left, right) => left.start - right.start || left.end - right.end);
    let offset = 0;
    for (const mark of originMarks) {
      if (mark.start !== offset || typeof mark.value !== "string") {
        throw new TypeError(
          "Automerge qualification Origin projection has a gap.",
        );
      }
      const text = payload.text.slice(mark.start, mark.end);
      if (text.length > 0) {
        spans.push({ text, origin: parseOrigin(mark.value) });
      }
      offset = mark.end;
    }
    if (offset !== payload.text.length) {
      throw new TypeError("Automerge qualification text is missing Origin.");
    }
    return {
      kind: "text",
      mediaType: payload.mediaType,
      text: payload.text,
      spans,
    };
  }

  /** {@inheritDoc PayloadCarrier.insertText} */
  public insertText(
    offset: number,
    text: string,
    origin: QualificationOrigin,
  ): void {
    const snapshot = this.snapshot();
    if (snapshot.kind !== "text") {
      throw new TypeError(
        "Fine-grained text operations require a text payload.",
      );
    }
    assertTextOffset(offset, snapshot.text);
    if (text.length === 0) {
      return;
    }
    this.document = Automerge.change(this.document, (draft) => {
      Automerge.splice(draft, [...TEXT_PATH], offset, 0, text);
      Automerge.mark(
        draft,
        [...TEXT_PATH],
        { start: offset, end: offset + text.length, expand: "none" },
        ORIGIN_MARK,
        JSON.stringify(origin),
      );
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
    if (start === end) {
      return;
    }
    this.document = Automerge.change(this.document, (draft) => {
      Automerge.splice(draft, [...TEXT_PATH], start, end - start);
    });
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
    this.document = Automerge.change(this.document, (draft) => {
      draft.payload = { kind: "text", mediaType, text: "" };
      if (text.length > 0) {
        Automerge.splice(draft, [...TEXT_PATH], 0, 0, text);
        Automerge.mark(
          draft,
          [...TEXT_PATH],
          { start: 0, end: text.length, expand: "none" },
          ORIGIN_MARK,
          JSON.stringify(origin),
        );
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
    this.document = Automerge.change(this.document, (draft) => {
      draft.payload = {
        kind: "opaque",
        mediaType,
        bytes: [...bytes],
        origin: JSON.stringify(origin),
      };
    });
  }

  /** {@inheritDoc PayloadCarrier.encode} */
  public encode(): Uint8Array {
    return Automerge.save(this.document);
  }

  /** {@inheritDoc PayloadCarrier.mergeEncoded} */
  public mergeEncoded(encoded: Uint8Array): void {
    this.document = Automerge.merge(
      this.document,
      Automerge.load<AutomergePayloadState>(encoded),
    );
  }
}

/** Factory for the Automerge payload qualification adapter. */
export const automergePayloadCarrierFactory: PayloadCarrierFactory = {
  candidate: "automerge",
  createText(mediaType, origin) {
    const carrier = new AutomergePayloadCarrier();
    carrier.replaceText(mediaType, "", origin);
    return carrier;
  },
  load(encoded) {
    return new AutomergePayloadCarrier(encoded);
  },
};

function parseOrigin(value: string): QualificationOrigin {
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
