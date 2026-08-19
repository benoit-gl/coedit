import type { DocumentNode, DocumentState, DocumentView } from "../domain/types";
import type { MaterializedRevision } from "../persistence/gateway";

export interface LiveWorkspaceContext {
  view: DocumentView;
  selectedNodeId: string | null;
}

export interface RetainedLiveWorkspaceContext {
  live: LiveWorkspaceContext;
  resumeEditorNodeId: string | null;
}

export interface HistoricalWorkspaceContext {
  materialized: MaterializedRevision;
  selectedNodeId: string | null;
}

export type WorkspaceProjection =
  | {
      kind: "live";
      displayed: LiveWorkspaceContext;
      editorOwnerNodeId: string | null;
    }
  | {
      kind: "historical";
      displayed: HistoricalWorkspaceContext;
      retainedLive: RetainedLiveWorkspaceContext;
      currentRevision: number;
      editorOwnerNodeId: null;
    };

export type RevisionRequestState =
  | { kind: "idle" }
  | {
      kind: "loading";
      requestedRevision: number;
      requestId: number;
      origin: WorkspaceProjection;
    };

export class WorkspaceMutationUnavailableError extends Error {
  constructor() {
    super("Document changes are unavailable outside the live workspace.");
    this.name = "WorkspaceMutationUnavailableError";
  }
}

function activeNode(nodes: DocumentNode[], nodeId: string | null): DocumentNode | undefined {
  if (!nodeId) return undefined;
  return nodes.find((node) => node.id === nodeId && node.deletedAt === null);
}

export function selectedNodeForState(state: DocumentState, preferredId: string | null): string | null {
  return activeNode(state.nodes, preferredId)?.id
    ?? state.nodes.find((node) => node.deletedAt === null)?.id
    ?? null;
}

export function liveWorkspace(
  view: DocumentView,
  preferredSelectedNodeId: string | null,
  preferredEditorOwnerNodeId?: string | null,
): WorkspaceProjection {
  const selectedNodeId = selectedNodeForState(view, preferredSelectedNodeId);
  const editorOwnerNodeId = preferredEditorOwnerNodeId === undefined
    ? selectedNodeId
    : activeNode(view.nodes, preferredEditorOwnerNodeId)?.id ?? null;
  return {
    kind: "live",
    displayed: { view, selectedNodeId },
    editorOwnerNodeId,
  };
}

export function historicalWorkspace(
  origin: WorkspaceProjection,
  materialized: MaterializedRevision,
): WorkspaceProjection {
  const retainedLive = origin.kind === "live"
    ? {
        live: origin.displayed,
        resumeEditorNodeId: origin.editorOwnerNodeId,
      }
    : origin.retainedLive;
  const preferredSelectedNodeId = origin.displayed.selectedNodeId;

  return {
    kind: "historical",
    displayed: {
      materialized,
      selectedNodeId: selectedNodeForState(materialized.state, preferredSelectedNodeId),
    },
    retainedLive,
    currentRevision: retainedLive.live.view.document.revision,
    editorOwnerNodeId: null,
  };
}

export function liveProjectionFor(workspace: WorkspaceProjection): WorkspaceProjection & { kind: "live" } {
  if (workspace.kind === "live") return workspace;
  return liveWorkspace(
    workspace.retainedLive.live.view,
    workspace.retainedLive.live.selectedNodeId,
    workspace.retainedLive.resumeEditorNodeId,
  ) as WorkspaceProjection & { kind: "live" };
}

export function liveContextFor(workspace: WorkspaceProjection): LiveWorkspaceContext {
  return workspace.kind === "live" ? workspace.displayed : workspace.retainedLive.live;
}

export function displayedSelectedNodeId(workspace: WorkspaceProjection): string | null {
  return workspace.displayed.selectedNodeId;
}

export function displayedDocumentView(workspace: WorkspaceProjection): DocumentView {
  if (workspace.kind === "live") return workspace.displayed.view;
  return {
    ...workspace.displayed.materialized.state,
    path: workspace.retainedLive.live.view.path,
    readOnly: true,
    recoveryWarning: workspace.retainedLive.live.view.recoveryWarning,
  };
}

export function selectWorkspaceNode(workspace: WorkspaceProjection, nodeId: string): WorkspaceProjection {
  if (workspace.kind === "live") {
    return {
      ...workspace,
      displayed: { ...workspace.displayed, selectedNodeId: nodeId },
      editorOwnerNodeId: nodeId,
    };
  }
  return {
    ...workspace,
    displayed: { ...workspace.displayed, selectedNodeId: nodeId },
  };
}

/** Updates canvas/navigation context without claiming live editor ownership. */
export function contextWorkspaceNode(
  workspace: WorkspaceProjection,
  nodeId: string,
): WorkspaceProjection {
  return workspace.kind === "live"
    ? { ...workspace, displayed: { ...workspace.displayed, selectedNodeId: nodeId } }
    : { ...workspace, displayed: { ...workspace.displayed, selectedNodeId: nodeId } };
}

/** Releases the live editor after its registered participant has drained. */
export function releaseWorkspaceEditor(
  workspace: WorkspaceProjection & { kind: "live" },
  preferredContextNodeId: string | null = workspace.displayed.selectedNodeId,
): WorkspaceProjection & { kind: "live" } {
  return {
    ...workspace,
    displayed: {
      ...workspace.displayed,
      selectedNodeId: selectedNodeForState(workspace.displayed.view, preferredContextNodeId),
    },
    editorOwnerNodeId: null,
  };
}
