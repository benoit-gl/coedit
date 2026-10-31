import { describe, expect, it } from "vitest";
import {
  parseEditorTraversal,
  parseNodeEditorTraversal,
} from "./step3-editor-traversal.mjs";

const records = ["yjs", "automerge"].flatMap((candidate) =>
  ["snapshot", "targeted"].flatMap((variant) =>
    [0, 4].map((count) => ({
      candidate,
      userAgent: "fixture browser",
      variant,
      unrelatedBlocks: count,
      unrelatedPayloads: count,
      decoderCalls: 0,
      snapshots: [],
    })),
  ),
);
const output = (rows) =>
  rows
    .map((row) => `STEP3_EDITOR_TRAVERSAL_JSON=${JSON.stringify(row)}`)
    .join("\n");

describe("browser traversal evidence collection", () => {
  it("accepts all fixture combinations including a scan-free observation", () => {
    expect(parseEditorTraversal(output(records))).toEqual(records);
  });
  it("rejects missing, duplicate and malformed records", () => {
    expect(() => parseEditorTraversal(output(records.slice(1)))).toThrow(
      /incomplete/u,
    );
    expect(() =>
      parseEditorTraversal(output([...records, records[0]])),
    ).toThrow(/duplicate/u);
    expect(() =>
      parseEditorTraversal(
        output([
          {
            ...records[0],
            snapshots: [{ phase: "read", payloads: 99, placements: 0 }],
          },
          ...records.slice(1),
        ]),
      ),
    ).toThrow(/Invalid/u);
  });
});

describe("Node editor and position evidence collection", () => {
  const nodeRecords = records.map((record) => ({
    candidate: record.candidate,
    variant: record.variant,
    unrelatedBlocks: record.unrelatedBlocks,
    decoderCalls: record.decoderCalls,
    snapshots: record.snapshots,
  }));
  const nodeOutput = (editor, resolution) =>
    [
      ...editor.map(
        (row) => `STEP3_SEMANTIC_EDITOR_TRAVERSAL_JSON=${JSON.stringify(row)}`,
      ),
      ...resolution.map(
        (row) =>
          `STEP3_POSITION_RESOLUTION_TRAVERSAL_JSON=${JSON.stringify(row)}`,
      ),
    ].join("\n");
  it("collects every pair and accepts empty observations", () => {
    expect(
      parseNodeEditorTraversal(nodeOutput(nodeRecords, nodeRecords)),
    ).toEqual({ editor: nodeRecords, resolution: nodeRecords });
  });
  it("rejects missing or duplicate records and malformed snapshots", () => {
    expect(() =>
      parseNodeEditorTraversal(nodeOutput(nodeRecords, nodeRecords.slice(1))),
    ).toThrow(/incomplete/u);
    expect(() =>
      parseNodeEditorTraversal(
        nodeOutput([...nodeRecords, nodeRecords[0]], nodeRecords),
      ),
    ).toThrow(/duplicate/u);
    const bad = [
      {
        ...nodeRecords[0],
        snapshots: [{ phase: "position", placements: 10, payloads: 1 }],
      },
      ...nodeRecords.slice(1),
    ];
    expect(() =>
      parseNodeEditorTraversal(nodeOutput(bad, nodeRecords)),
    ).toThrow(/Invalid/u);
  });
});
