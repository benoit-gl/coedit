import { useCallback, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { BodyCheckpointCommitRequest } from "../application/bodyCheckpoint";
import type { RegisterDraftParticipant } from "../application/draftTransition";
import { compareJsonStrings } from "../domain/json";
import type { DocumentNode } from "../domain/types";
import { projectVisibleNodes } from "../domain/visibleNodes";
import type { BodyCheckpointPolicy } from "../editor/bodyCheckpointPolicy";
import { NodeBlock, type NodeBlockCommand } from "./NodeBlock";
import type { NodeMetadataChanges } from "./NodeMetadataFields";

export type DocumentCanvasWorkspaceKind = "live" | "historical";

interface DocumentCanvasBaseProps {
  nodes: readonly DocumentNode[];
  expandedNodeIds: ReadonlySet<string>;
  workspaceKind: DocumentCanvasWorkspaceKind;
  contextNodeId?: string | null;
  label?: string;
  onExpandedNodeIdsChange?: (expandedNodeIds: ReadonlySet<string>) => void;
  onSetContextNode?: (nodeId: string) => void;
}

interface ReadOnlyDocumentCanvasProps extends DocumentCanvasBaseProps {
  readOnly: true;
}

interface EditableDocumentCanvasProps extends DocumentCanvasBaseProps {
  workspaceKind: "live";
  readOnly: false;
  disabled: boolean;
  editorOwnerNodeId: string | null;
  editorGeneration: number;
  tagSuggestions: string[];
  onRequestEditorOwner: (nodeId: string) => Promise<boolean>;
  onReleaseEditorOwner: (preferredContextNodeId?: string) => Promise<boolean>;
  onCommitMetadata: (nodeId: string, changes: NodeMetadataChanges) => Promise<void>;
  onCommitBody: (checkpoint: BodyCheckpointCommitRequest) => Promise<void>;
  onCreateNode: (parentId: string | null, index?: number) => Promise<string | null>;
  onMoveNode: (nodeId: string, parentId: string | null, index: number) => Promise<boolean>;
  onDeleteNode: (nodeId: string) => Promise<boolean>;
  registerDraftParticipant: RegisterDraftParticipant;
  checkpointPolicy?: BodyCheckpointPolicy;
}

export type DocumentCanvasProps = ReadOnlyDocumentCanvasProps | EditableDocumentCanvasProps;

type FocusTarget = { nodeId: string; control: "title" | "handle" | "disclosure" };

function compareSiblings(left: DocumentNode, right: DocumentNode): number {
  if (left.position !== right.position) return left.position - right.position;
  return compareJsonStrings(left.id, right.id);
}

function activeNodes(nodes: readonly DocumentNode[]): DocumentNode[] {
  return nodes.filter((node) => node.deletedAt === null);
}

function descendantIds(nodes: readonly DocumentNode[], parentId: string): Set<string> {
  const result = new Set<string>();
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.deletedAt !== null || node.parentId === null) continue;
    const existing = children.get(node.parentId);
    if (existing) existing.push(node.id);
    else children.set(node.parentId, [node.id]);
  }
  const pending = [...(children.get(parentId) ?? [])];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return result;
}

/** Continuous live or historical document projection with one explicit editor owner. */
export function DocumentCanvas(props: DocumentCanvasProps) {
  const { nodes, expandedNodeIds, workspaceKind } = props;
  const label = props.label
    ?? (workspaceKind === "historical" ? "Historical document" : "Document");
  const editable = props.readOnly ? null : props;
  const canvasRef = useRef<HTMLElement>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const projection = useMemo(() => {
    try {
      return { kind: "ready" as const, blocks: projectVisibleNodes(nodes, expandedNodeIds) };
    } catch {
      return { kind: "invalid" as const };
    }
  }, [expandedNodeIds, nodes]);

  const nodesById = useMemo(
    () => new Map(activeNodes(nodes).map((node) => [node.id, node])),
    [nodes],
  );
  const siblingsByParent = useMemo(() => {
    const result = new Map<string | null, DocumentNode[]>();
    for (const node of activeNodes(nodes)) {
      const siblings = result.get(node.parentId);
      if (siblings) siblings.push(node);
      else result.set(node.parentId, [node]);
    }
    for (const siblings of result.values()) siblings.sort(compareSiblings);
    return result;
  }, [nodes]);

  const focusControl = useCallback((target: FocusTarget) => {
    const block = [...(canvasRef.current?.querySelectorAll<HTMLElement>(".node-block") ?? [])]
      .find((candidate) => candidate.dataset.nodeId === target.nodeId);
    block?.querySelector<HTMLElement>(`[data-node-control="${target.control}"]`)?.focus();
  }, []);
  useLayoutEffect(() => {
    if (!focusTarget) return;
    focusControl(focusTarget);
    setFocusTarget(null);
  }, [focusControl, focusTarget, nodes, expandedNodeIds]);

  const updateExpanded = useCallback((update: (next: Set<string>) => void) => {
    const next = new Set(expandedNodeIds);
    update(next);
    props.onExpandedNodeIdsChange?.(next);
  }, [expandedNodeIds, props]);

  const setContext = useCallback((nodeId: string) => {
    props.onSetContextNode?.(nodeId);
  }, [props]);

  const runCommand = useCallback(async (nodeId: string, command: NodeBlockCommand) => {
    if (projection.kind !== "ready") return;
    const block = projection.blocks.find((candidate) => candidate.node.id === nodeId);
    const node = nodesById.get(nodeId);
    if (!block || !node) return;
    const visible = projection.blocks;
    const siblingList = siblingsByParent.get(node.parentId) ?? [];
    const siblingIndex = siblingList.findIndex((candidate) => candidate.id === nodeId);
    const parent = node.parentId ? nodesById.get(node.parentId) : undefined;

    if (command === "focusPrevious" || command === "focusNext") {
      const targetId = command === "focusPrevious" ? block.previousVisibleNodeId : block.nextVisibleNodeId;
      if (targetId) {
        setContext(targetId);
        focusControl({ nodeId: targetId, control: editable ? "handle" : "disclosure" });
      }
      return;
    }
    if (command === "focusParent" && parent) {
      setContext(parent.id);
      focusControl({ nodeId: parent.id, control: "disclosure" });
      return;
    }
    if (command === "focusFirstChild") {
      const childId = block.nextVisibleNodeId;
      if (childId && nodesById.get(childId)?.parentId === nodeId) {
        setContext(childId);
        focusControl({ nodeId: childId, control: editable ? "handle" : "disclosure" });
      }
      return;
    }
    if (command === "toggle") {
      if (!block.hasActiveChildren) return;
      if (block.expanded) {
        const descendants = descendantIds(nodes, nodeId);
        if (editable?.editorOwnerNodeId && descendants.has(editable.editorOwnerNodeId)) {
          const released = await editable.onReleaseEditorOwner(nodeId);
          if (!released) {
            focusControl({ nodeId, control: "disclosure" });
            return;
          }
        }
        if (props.contextNodeId && descendants.has(props.contextNodeId)) setContext(nodeId);
        updateExpanded((next) => next.delete(nodeId));
        setFocusTarget({ nodeId, control: "disclosure" });
        setAnnouncement(`Collapsed ${node.title || "Untitled idea"}.`);
      } else {
        updateExpanded((next) => next.add(nodeId));
        setAnnouncement(`Expanded ${node.title || "Untitled idea"}.`);
      }
      return;
    }
    if (!editable || editable.disabled) return;

    if (command === "createSibling" || command === "createChild") {
      const asChild = command === "createChild";
      const parentId = asChild ? nodeId : node.parentId;
      const index = asChild
        ? (siblingsByParent.get(nodeId)?.length ?? 0)
        : siblingIndex + 1;
      const createdId = await editable.onCreateNode(parentId, index);
      if (!createdId) return;
      if (asChild) updateExpanded((next) => next.add(nodeId));
      setFocusTarget({ nodeId: createdId, control: "title" });
      setAnnouncement(asChild ? "Child idea created." : "Idea created below.");
      return;
    }

    let move: { parentId: string | null; index: number; message: string } | null = null;
    if (command === "moveUp" && siblingIndex > 0) {
      move = { parentId: node.parentId, index: siblingIndex - 1, message: "Idea moved up." };
    } else if (command === "moveDown" && siblingIndex >= 0 && siblingIndex < siblingList.length - 1) {
      // moveNode inserts before normalization while the source still occupies
      // its old slot, so moving down crosses the following sibling at +2.
      move = { parentId: node.parentId, index: siblingIndex + 2, message: "Idea moved down." };
    } else if (command === "indent" && siblingIndex > 0) {
      const previousSibling = siblingList[siblingIndex - 1];
      move = {
        parentId: previousSibling.id,
        index: siblingsByParent.get(previousSibling.id)?.length ?? 0,
        message: `Idea indented under ${previousSibling.title || "Untitled idea"}.`,
      };
    } else if (command === "outdent" && parent) {
      const parentSiblings = siblingsByParent.get(parent.parentId) ?? [];
      const parentIndex = parentSiblings.findIndex((candidate) => candidate.id === parent.id);
      move = { parentId: parent.parentId, index: parentIndex + 1, message: "Idea outdented." };
    }
    if (move) {
      const moved = await editable.onMoveNode(nodeId, move.parentId, move.index);
      if (!moved) return;
      if (move.parentId) updateExpanded((next) => next.add(move!.parentId!));
      setFocusTarget({ nodeId, control: "handle" });
      setAnnouncement(move.message);
      return;
    }

    if (command === "delete") {
      const descendants = descendantIds(nodes, nodeId);
      const nextVisible = visible.slice(block.visibleIndex + 1)
        .find((candidate) => !descendants.has(candidate.node.id));
      const previousVisible = [...visible.slice(0, block.visibleIndex)].reverse()
        .find((candidate) => !descendants.has(candidate.node.id));
      const fallbackId = nextVisible?.node.id ?? previousVisible?.node.id ?? node.parentId;
      const deleted = await editable.onDeleteNode(nodeId);
      if (!deleted) return;
      if (fallbackId) {
        setContext(fallbackId);
        setFocusTarget({ nodeId: fallbackId, control: "handle" });
      }
      setAnnouncement(`Deleted ${node.title || "Untitled idea"} and its sub-ideas.`);
    }
  }, [editable, focusControl, nodes, nodesById, projection, props.contextNodeId, setContext, siblingsByParent, updateExpanded]);

  const startDrag = useCallback((nodeId: string, event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-coedit-node", nodeId);
  }, []);
  const dropInto = useCallback(async (targetId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editable || editable.disabled) return;
    const draggedId = event.dataTransfer.getData("application/x-coedit-node");
    if (!draggedId || draggedId === targetId) return;
    const moved = await editable.onMoveNode(
      draggedId,
      targetId,
      siblingsByParent.get(targetId)?.length ?? 0,
    );
    if (!moved) return;
    updateExpanded((next) => next.add(targetId));
    setContext(draggedId);
    setFocusTarget({ nodeId: draggedId, control: "handle" });
    setAnnouncement("Idea moved into its new parent.");
  }, [editable, setContext, siblingsByParent, updateExpanded]);

  if (projection.kind === "invalid") {
    return (
      <section className="document-canvas document-canvas-error" aria-label={label}
        data-workspace-kind={workspaceKind} data-read-only={String(props.readOnly)} role="alert">
        <h2>Document unavailable</h2>
        <p>The document hierarchy is invalid and cannot be displayed safely.</p>
      </section>
    );
  }

  return (
    <section
      ref={canvasRef}
      className="document-canvas"
      aria-label={label}
      data-workspace-kind={workspaceKind}
      data-read-only={String(props.readOnly)}
      data-editor-owner-node-id={editable?.editorOwnerNodeId ?? undefined}
    >
      <div className="document-canvas-page">
        {projection.blocks.length === 0 ? (
          <div className="document-canvas-empty">
            <p>This document has no visible ideas.</p>
            {editable && (
              <button
                type="button"
                className="primary"
                disabled={editable.disabled}
                onClick={async () => {
                  const id = await editable.onCreateNode(null, 0);
                  if (id) setFocusTarget({ nodeId: id, control: "title" });
                }}
              >Create the first idea</button>
            )}
          </div>
        ) : (
          <ol className="document-canvas-list">
            {projection.blocks.map((block) => {
              const siblings = siblingsByParent.get(block.node.parentId) ?? [];
              const siblingIndex = siblings.findIndex((node) => node.id === block.node.id);
              const common = {
                block,
                contextNodeId: props.contextNodeId ?? null,
                onSetContext: setContext,
                onCommand: (nodeId: string, command: NodeBlockCommand) => { void runCommand(nodeId, command); },
              };
              return editable ? (
                <NodeBlock
                  key={block.node.id}
                  {...common}
                  readOnly={false}
                  disabled={editable.disabled}
                  editorOwner={editable.editorOwnerNodeId === block.node.id}
                  editorGeneration={editable.editorGeneration}
                  siblingPosition={siblingIndex + 1}
                  siblingCount={siblings.length}
                  canIndent={siblingIndex > 0}
                  canOutdent={block.node.parentId !== null}
                  tagSuggestions={editable.tagSuggestions}
                  onCommitMetadata={editable.onCommitMetadata}
                  onRequestEditorOwner={editable.onRequestEditorOwner}
                  onCommitBody={editable.onCommitBody}
                  onDragStart={startDrag}
                  onDropInto={(nodeId, event) => { void dropInto(nodeId, event); }}
                  registerDraftParticipant={editable.registerDraftParticipant}
                  checkpointPolicy={editable.checkpointPolicy}
                />
              ) : <NodeBlock key={block.node.id} {...common} readOnly />;
            })}
          </ol>
        )}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
    </section>
  );
}
