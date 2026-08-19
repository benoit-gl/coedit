import { useMemo } from "react";
import type { BodyCheckpointCommitRequest } from "../application/bodyCheckpoint";
import type { RegisterDraftParticipant } from "../application/draftTransition";
import type { DocumentNode } from "../domain/types";
import { projectVisibleNodes } from "../domain/visibleNodes";
import type { BodyCheckpointPolicy } from "../editor/bodyCheckpointPolicy";
import { NodeBlock } from "./NodeBlock";

export type DocumentCanvasWorkspaceKind = "live" | "historical";

interface DocumentCanvasBaseProps {
  nodes: readonly DocumentNode[];
  expandedNodeIds: ReadonlySet<string>;
  workspaceKind: DocumentCanvasWorkspaceKind;
  label?: string;
}

interface ReadOnlyDocumentCanvasProps extends DocumentCanvasBaseProps {
  readOnly: true;
}

interface EditableDocumentCanvasProps extends DocumentCanvasBaseProps {
  workspaceKind: "live";
  readOnly: false;
  editorOwnerNodeId: string | null;
  onRequestEditorOwner: (nodeId: string) => Promise<boolean>;
  onCommitBody: (checkpoint: BodyCheckpointCommitRequest) => Promise<void>;
  registerDraftParticipant: RegisterDraftParticipant;
  checkpointPolicy?: BodyCheckpointPolicy;
}

export type DocumentCanvasProps = ReadOnlyDocumentCanvasProps | EditableDocumentCanvasProps;

/**
 * Continuous document projection. Historical canvases are entirely static;
 * live canvases mount no more than the controller-designated editor owner.
 */
export function DocumentCanvas(props: DocumentCanvasProps) {
  const { nodes, expandedNodeIds, workspaceKind } = props;
  const label = props.label
    ?? (workspaceKind === "historical" ? "Historical document" : "Document preview");
  const editable = props.readOnly ? null : props;
  const projection = useMemo(() => {
    try {
      return { kind: "ready" as const, blocks: projectVisibleNodes(nodes, expandedNodeIds) };
    } catch {
      return { kind: "invalid" as const };
    }
  }, [expandedNodeIds, nodes]);

  if (projection.kind === "invalid") {
    return (
      <section
        className="document-canvas document-canvas-error"
        aria-label={label}
        data-workspace-kind={workspaceKind}
        data-read-only={String(props.readOnly)}
        role="alert"
      >
        <h2>Document unavailable</h2>
        <p>The document hierarchy is invalid and cannot be displayed safely.</p>
      </section>
    );
  }

  return (
    <section
      className="document-canvas"
      aria-label={label}
      data-workspace-kind={workspaceKind}
      data-read-only={String(props.readOnly)}
      data-editor-owner-node-id={editable?.editorOwnerNodeId ?? undefined}
    >
      <div className="document-canvas-page">
        {projection.blocks.length === 0 ? (
          <p className="document-canvas-empty">This document has no visible ideas.</p>
        ) : (
          <ol className="document-canvas-list">
            {projection.blocks.map((block) => (
              editable ? (
                <NodeBlock
                  key={block.node.id}
                  block={block}
                  readOnly={false}
                  editorOwner={editable.editorOwnerNodeId === block.node.id}
                  onRequestEditorOwner={editable.onRequestEditorOwner}
                  onCommitBody={editable.onCommitBody}
                  registerDraftParticipant={editable.registerDraftParticipant}
                  checkpointPolicy={editable.checkpointPolicy}
                />
              ) : (
                <NodeBlock key={block.node.id} block={block} readOnly />
              )
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
