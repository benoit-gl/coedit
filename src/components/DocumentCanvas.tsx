import { useMemo } from "react";
import type { DocumentNode } from "../domain/types";
import { projectVisibleNodes } from "../domain/visibleNodes";
import { NodeBlock } from "./NodeBlock";

export type DocumentCanvasWorkspaceKind = "live" | "historical";

export interface DocumentCanvasProps {
  nodes: readonly DocumentNode[];
  expandedNodeIds: ReadonlySet<string>;
  workspaceKind: DocumentCanvasWorkspaceKind;
  readOnly: true;
  label?: string;
}

/**
 * Read-only WP-7 canvas scaffold. It is deliberately not connected to the
 * reachable workspace until active-editor ownership and checkpoint barriers
 * are implemented at this component boundary.
 */
export function DocumentCanvas({
  nodes,
  expandedNodeIds,
  workspaceKind,
  label = workspaceKind === "historical" ? "Historical document" : "Document preview",
}: DocumentCanvasProps) {
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
        data-read-only="true"
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
      data-read-only="true"
    >
      <div className="document-canvas-page">
        {projection.blocks.length === 0 ? (
          <p className="document-canvas-empty">This document has no visible ideas.</p>
        ) : (
          <ol className="document-canvas-list">
            {projection.blocks.map((block) => (
              <NodeBlock key={block.node.id} block={block} readOnly />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
