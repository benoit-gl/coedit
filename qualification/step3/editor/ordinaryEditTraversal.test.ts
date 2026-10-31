import { describe, expect, it, vi } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { QualificationTextEditor, readEditorText } from "./semanticText.js";

const root = parseBlockId("87000000-0000-4000-8000-000000000001");
const target = parseInlineContentId("87000000-0000-4000-8000-000000000002");
const origin = { id: "traversal-origin", kind: "human" as const };
const blockId = (i: number) =>
  parseBlockId(`87000001-0000-4000-8000-${String(i).padStart(12, "0")}`);
const contentId = (i: number) =>
  parseInlineContentId(
    `87000002-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );

for (const createFactory of [
  createYjsIntegratedDocumentCarrierFactory,
  createAutomergeIntegratedDocumentCarrierFactory,
]) {
  for (const variant of ["snapshot", "targeted"] as const) {
    describe(`${createFactory.name} ${variant} ordinary editor work`, () => {
      it.each([0, 4])(
        "observes snapshots with %i unrelated Blocks and payloads",
        (count) => {
          let decoderCalls = 0;
          const codec = {
            ...localDensePositionAllocator,
            decode(encoded: string) {
              decoderCalls++;
              return localDensePositionAllocator.decode(encoded);
            },
          };
          const factory = createFactory(codec, localDensePositionAllocator, {
            ordinaryEditVariant: variant,
            purePositionDecoder: true,
          });
          const carrier = factory.create(root);
          carrier.applyChange({
            placements: Array.from({ length: count }, (_, i) => ({
              blockId: blockId(i + 1),
              placement: {
                depth: 1,
                position: { digits: [i + 1], run: root, member: i + 1 },
              },
            })),
            inlineContents: [
              { inlineContentId: target, blockId: root },
              ...Array.from({ length: count }, (_, i) => ({
                inlineContentId: contentId(i + 1),
                blockId: blockId(i + 1),
              })),
            ],
            payloads: [
              {
                kind: "replace-text",
                inlineContentId: target,
                mediaType: "text/plain",
                text: "abc",
                origin,
              },
              ...Array.from({ length: count }, (_, i) =>
                i % 2 === 0
                  ? {
                      kind: "replace-text" as const,
                      inlineContentId: contentId(i + 1),
                      mediaType: "text/plain",
                      text: "unrelated",
                      origin,
                    }
                  : {
                      kind: "replace-opaque" as const,
                      inlineContentId: contentId(i + 1),
                      mediaType: "application/octet-stream",
                      bytes: Uint8Array.of(1, 2),
                      origin,
                    },
              ),
            ],
          });
          const editor = new QualificationTextEditor(carrier, target);
          const originalSnapshot = carrier.snapshot.bind(carrier);
          const observations: {
            phase: string;
            payloads: number;
            placements: number;
          }[] = [];
          let phase = "editor";
          vi.spyOn(carrier, "snapshot").mockImplementation(() => {
            const snapshot = originalSnapshot();
            observations.push({
              phase,
              payloads: snapshot.payloads.size,
              placements: snapshot.placements.size,
            });
            return snapshot;
          });
          const apply = carrier.applyChange.bind(carrier);
          vi.spyOn(carrier, "applyChange").mockImplementation((change) => {
            phase = "publish";
            try {
              apply(change);
            } finally {
              phase = "editor";
            }
          });
          const createPosition = carrier.createStableTextPosition.bind(carrier);
          vi.spyOn(carrier, "createStableTextPosition").mockImplementation(
            (...args) => {
              phase = "position";
              try {
                return createPosition(...args);
              } finally {
                phase = "editor";
              }
            },
          );
          decoderCalls = 0;
          editor.replaceSelection(1, 1, "X", origin, {
            actorId: "traversal",
            effectId: "insert",
          });
          const editDecoderCalls = decoderCalls;
          expect(
            observations.every(
              (o) => o.payloads === count + 1 && o.placements === count,
            ),
          ).toBe(true);
          console.info(
            "STEP3_SEMANTIC_EDITOR_TRAVERSAL_JSON=" +
              JSON.stringify({
                candidate: carrier.candidate,
                variant,
                unrelatedBlocks: count,
                decoderCalls: editDecoderCalls,
                snapshots: observations,
              }),
          );
          expect(readEditorText(carrier, target).text).toBe("aXbc");
          const position = carrier.createStableTextPosition(target, 1, "after");
          observations.length = 0;
          expect(carrier.resolveStableTextPosition(position)).toBe(1);
          expect(
            observations.every(
              (o) => o.payloads === count + 1 && o.placements === count,
            ),
          ).toBe(true);
          console.info(
            "STEP3_POSITION_RESOLUTION_TRAVERSAL_JSON=" +
              JSON.stringify({
                candidate: carrier.candidate,
                variant,
                unrelatedBlocks: count,
                snapshots: observations,
              }),
          );
        },
      );
    });
  }
}
