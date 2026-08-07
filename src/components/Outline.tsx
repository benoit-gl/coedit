import { useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import { buildTree, type TreeNode } from "../domain/tree";
import type { DocumentNode } from "../domain/types";

interface OutlineProps {
  nodes: DocumentNode[];
  selectedId: string | null;
  readOnly: boolean;
  onSelect: (nodeId: string) => void;
  onAdd: (parentId: string | null) => void;
  onMove: (nodeId: string, parentId: string | null, index: number) => void;
  onDelete: (nodeId: string) => void;
}

interface RowProps extends Omit<OutlineProps, "nodes"> {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (nodeId: string) => void;
  siblings: TreeNode[];
}

function OutlineRow(props: RowProps) {
  const { node, depth, expanded, toggle, siblings, selectedId, readOnly, onSelect, onAdd, onMove, onDelete } = props;
  const isExpanded = expanded.has(node.id);
  const siblingIndex = siblings.findIndex((item) => item.id === node.id);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData("application/x-coedit-node");
    if (draggedId && draggedId !== node.id) onMove(draggedId, node.id, node.children.length);
  };

  return (
    <li>
      <div
        className={`outline-row ${selectedId === node.id ? "selected" : ""}`}
        style={{ paddingInlineStart: `${depth * 18 + 8}px` }}
        draggable={!readOnly}
        onDragStart={(event) => event.dataTransfer.setData("application/x-coedit-node", node.id)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <button className="disclosure" type="button" aria-label={isExpanded ? "Collapse" : "Expand"} onClick={() => toggle(node.id)} disabled={node.children.length === 0}>
          {node.children.length ? (isExpanded ? "▾" : "▸") : "·"}
        </button>
        <button className="outline-title" type="button" onClick={() => onSelect(node.id)}>{node.title}</button>
        <div className="row-actions">
          <button type="button" title="Move up" disabled={readOnly || siblingIndex === 0} onClick={() => onMove(node.id, node.parentId, siblingIndex - 1)}>↑</button>
          <button type="button" title="Move down" disabled={readOnly || siblingIndex === siblings.length - 1} onClick={() => onMove(node.id, node.parentId, siblingIndex + 1)}>↓</button>
          <button type="button" title="Add child" disabled={readOnly} onClick={() => onAdd(node.id)}>＋</button>
          <button type="button" title="Delete subtree" disabled={readOnly} onClick={() => onDelete(node.id)}>×</button>
        </div>
      </div>
      {isExpanded && node.children.length > 0 && (
        <ul>
          {node.children.map((child) => <OutlineRow key={child.id} {...props} node={child} depth={depth + 1} siblings={node.children} />)}
        </ul>
      )}
    </li>
  );
}

export function Outline(props: OutlineProps) {
  const tree = useMemo(() => buildTree(props.nodes), [props.nodes]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(props.nodes.map((node) => node.id)));
  const visible = useMemo(() => {
    const result: TreeNode[] = [];
    const visit = (nodes: TreeNode[]) => nodes.forEach((node) => {
      result.push(node);
      if (expanded.has(node.id)) visit(node.children);
    });
    visit(tree);
    return result;
  }, [expanded, tree]);
  const toggle = (nodeId: string) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
    return next;
  });
  const onKeyDown = (event: KeyboardEvent) => {
    if (!props.selectedId || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const index = visible.findIndex((node) => node.id === props.selectedId);
    if (event.key === "ArrowUp" && index > 0) props.onSelect(visible[index - 1].id);
    if (event.key === "ArrowDown" && index < visible.length - 1) props.onSelect(visible[index + 1].id);
    if (event.key === "ArrowRight") setExpanded((previous) => new Set(previous).add(props.selectedId!));
    if (event.key === "ArrowLeft") {
      if (expanded.has(props.selectedId)) toggle(props.selectedId);
      else {
        const selected = props.nodes.find((node) => node.id === props.selectedId);
        if (selected?.parentId) props.onSelect(selected.parentId);
      }
    }
    event.preventDefault();
  };

  return (
    <nav className="outline" aria-label="Document hierarchy" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="outline-heading">
        <span>Outline</span>
        <button type="button" onClick={() => props.onAdd(null)} disabled={props.readOnly}>＋ Root idea</button>
      </div>
      {tree.length === 0 ? <button className="empty-outline" type="button" onClick={() => props.onAdd(null)}>Create the first idea</button> : (
        <ul>{tree.map((node) => <OutlineRow key={node.id} {...props} node={node} depth={0} expanded={expanded} toggle={toggle} siblings={tree} />)}</ul>
      )}
      <p className="outline-help">Drag onto an idea to make it a child. Use ↑ and ↓ to reorder siblings.</p>
    </nav>
  );
}

