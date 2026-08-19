import { describe, expect, it } from "vitest";
import type { DocumentNode, DocumentView } from "../domain/types";
import type { MaterializedRevision } from "../persistence/gateway";
import {
  displayedDocumentView,
  contextWorkspaceNode,
  historicalWorkspace,
  liveProjectionFor,
  liveWorkspace,
  releaseWorkspaceEditor,
  selectWorkspaceNode,
} from "./workspaceProjection";

function node(id: string, title: string, deletedAt: string | null = null): DocumentNode {
  return {
    id,
    parentId: null,
    position: 0,
    tags: [],
    title,
    bodyHtml: "",
    yjsState: "",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt,
  };
}

function view(revision: number, nodes: DocumentNode[]): DocumentView {
  return {
    path: null,
    readOnly: false,
    recoveryWarning: null,
    document: {
      id: "document",
      title: "Draft",
      formatVersion: 1,
      revision,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    nodes,
    contributors: [],
    sessions: [],
  };
}

function materialized(revision: number, nodes: DocumentNode[]): MaterializedRevision {
  const current = view(revision, nodes);
  return {
    revision,
    state: {
      document: current.document,
      nodes: current.nodes,
      contributors: current.contributors,
      sessions: current.sessions,
    },
    stateHash: "hash",
    hashVerification: "verified",
  };
}

describe("workspace projection", () => {
  it("retains live state while projecting a detached historical revision read-only", () => {
    const live = liveWorkspace(view(4, [node("live", "Live")]), "live");
    const historical = historicalWorkspace(live, materialized(1, [node("old", "Old")]));

    expect(historical).toMatchObject({
      kind: "historical",
      currentRevision: 4,
      editorOwnerNodeId: null,
      displayed: { selectedNodeId: "old" },
      retainedLive: {
        live: { selectedNodeId: "live" },
        resumeEditorNodeId: "live",
      },
    });
    expect(displayedDocumentView(historical)).toMatchObject({
      readOnly: true,
      document: { revision: 1 },
      nodes: [{ id: "old", title: "Old" }],
    });

    const returned = liveProjectionFor(historical);
    expect(returned).toMatchObject({
      kind: "live",
      displayed: { selectedNodeId: "live", view: { document: { revision: 4 } } },
      editorOwnerNodeId: "live",
    });
  });

  it("keeps historical selection separate and reuses the original retained live wrapper", () => {
    const live = liveWorkspace(view(5, [node("first", "First"), node("second", "Second")]), "first");
    const firstHistory = historicalWorkspace(live, materialized(1, [node("first", "Earlier first")]));
    const selectedHistory = selectWorkspaceNode(firstHistory, "first");
    const secondHistory = historicalWorkspace(
      selectedHistory,
      materialized(2, [node("second", "Earlier second")]),
    );

    expect(secondHistory).toMatchObject({
      kind: "historical",
      currentRevision: 5,
      displayed: { selectedNodeId: "second" },
      retainedLive: { live: { selectedNodeId: "first" }, resumeEditorNodeId: "first" },
    });
    expect(liveProjectionFor(secondHistory).displayed.selectedNodeId).toBe("first");
  });

  it("updates canvas context independently and releases only live editor ownership", () => {
    const live = liveWorkspace(
      view(2, [node("first", "First"), node("second", "Second")]),
      "first",
    );
    const contextual = contextWorkspaceNode(live, "second");
    expect(contextual).toMatchObject({
      displayed: { selectedNodeId: "second" },
      editorOwnerNodeId: "first",
    });

    const released = releaseWorkspaceEditor(contextual as Extract<typeof contextual, { kind: "live" }>, "second");
    expect(released).toMatchObject({
      displayed: { selectedNodeId: "second" },
      editorOwnerNodeId: null,
    });
  });
});
