import type { DocumentNode, DocumentOperation, DocumentState } from "./types";
import { normalizeTags } from "./tags";
import { cloneJson } from "./json";

export interface TreeNode extends DocumentNode {
  children: TreeNode[];
}

export function buildTree(nodes: DocumentNode[]): TreeNode[] {
  const active = nodes.filter((node) => node.deletedAt === null);
  const byId = new Map<string, TreeNode>();
  for (const node of active) byId.set(node.id, { ...node, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (items: TreeNode[]) => {
    items.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

function descendantIds(nodes: DocumentNode[], nodeId: string): Set<string> {
  const result = new Set<string>();
  const visit = (parentId: string) => {
    for (const node of nodes) {
      if (node.parentId === parentId && !result.has(node.id)) {
        result.add(node.id);
        visit(node.id);
      }
    }
  };
  visit(nodeId);
  return result;
}

export function assertValidTree(nodes: DocumentNode[]): void {
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) throw new Error("The document contains duplicate node identifiers.");

  for (const node of nodes) {
    if (node.parentId === node.id) throw new Error("A node cannot be its own parent.");
    if (node.parentId !== null && !ids.has(node.parentId)) {
      throw new Error(`Node ${node.id} refers to a missing parent.`);
    }
    const ancestors = new Set<string>([node.id]);
    let parentId = node.parentId;
    while (parentId !== null) {
      if (ancestors.has(parentId)) throw new Error("The hierarchy contains a cycle.");
      ancestors.add(parentId);
      parentId = nodes.find((candidate) => candidate.id === parentId)?.parentId ?? null;
    }
  }
}

function normalizeSiblingPositions(nodes: DocumentNode[], parentId: string | null): void {
  nodes
    .filter((node) => node.parentId === parentId && node.deletedAt === null)
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .forEach((node, position) => {
      node.position = position;
    });
}

export function affectedNodeIds(operation: DocumentOperation): string[] {
  switch (operation.type) {
    case "createNode":
      return [operation.node.id];
    case "renameDocument":
      return [];
    default:
      return [operation.nodeId];
  }
}

export function applyOperation(state: DocumentState, operation: DocumentOperation, now: string): DocumentState {
  const next = cloneJson(state);
  const findNode = (id: string) => {
    const node = next.nodes.find((candidate) => candidate.id === id);
    if (!node) throw new Error(`Node ${id} does not exist.`);
    return node;
  };

  switch (operation.type) {
    case "createNode": {
      if (next.nodes.some((node) => node.id === operation.node.id)) throw new Error("Node identifier already exists.");
      if (operation.node.parentId) findNode(operation.node.parentId);
      const siblings = next.nodes.filter(
        (node) => node.parentId === (operation.node.parentId ?? null) && node.deletedAt === null,
      );
      const index = Math.max(0, Math.min(operation.index ?? siblings.length, siblings.length));
      for (const sibling of siblings) if (sibling.position >= index) sibling.position += 1;
      next.nodes.push({
        id: operation.node.id,
        parentId: operation.node.parentId ?? null,
        position: index,
        tags: normalizeTags(operation.node.tags ?? []),
        title: operation.node.title.trim() || "Untitled idea",
        bodyHtml: operation.node.bodyHtml ?? "",
        yjsState: operation.node.yjsState ?? "",
        metadata: operation.node.metadata ?? {},
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      normalizeSiblingPositions(next.nodes, operation.node.parentId ?? null);
      break;
    }
    case "updateNode": {
      const node = findNode(operation.nodeId);
      if (operation.changes.title !== undefined) node.title = operation.changes.title.trim() || "Untitled idea";
      if (operation.changes.tags !== undefined) node.tags = normalizeTags(operation.changes.tags);
      if (operation.changes.metadata !== undefined) node.metadata = operation.changes.metadata;
      node.updatedAt = now;
      break;
    }
    case "updateBody": {
      const node = findNode(operation.nodeId);
      node.bodyHtml = operation.bodyHtml;
      node.yjsState = operation.yjsState;
      node.updatedAt = now;
      break;
    }
    case "moveNode": {
      const node = findNode(operation.nodeId);
      if (operation.parentId !== null) findNode(operation.parentId);
      if (descendantIds(next.nodes, node.id).has(operation.parentId ?? "")) {
        throw new Error("A node cannot be moved into one of its descendants.");
      }
      const oldParentId = node.parentId;
      node.parentId = operation.parentId;
      node.position = Math.max(0, operation.index);
      node.updatedAt = now;
      for (const sibling of next.nodes) {
        if (sibling.id !== node.id && sibling.parentId === operation.parentId && sibling.position >= node.position) {
          sibling.position += 1;
        }
      }
      normalizeSiblingPositions(next.nodes, oldParentId);
      normalizeSiblingPositions(next.nodes, operation.parentId);
      break;
    }
    case "softDeleteNode": {
      const node = findNode(operation.nodeId);
      node.deletedAt = now;
      node.updatedAt = now;
      for (const descendantId of descendantIds(next.nodes, node.id)) {
        const descendant = findNode(descendantId);
        descendant.deletedAt = now;
        descendant.updatedAt = now;
      }
      normalizeSiblingPositions(next.nodes, node.parentId);
      break;
    }
    case "restoreNode": {
      const node = findNode(operation.nodeId);
      node.deletedAt = null;
      node.updatedAt = now;
      let parentId = node.parentId;
      while (parentId) {
        const parent = findNode(parentId);
        parent.deletedAt = null;
        parent.updatedAt = now;
        parentId = parent.parentId;
      }
      normalizeSiblingPositions(next.nodes, node.parentId);
      break;
    }
    case "renameDocument":
      next.document.title = operation.title.trim() || "Untitled document";
      break;
  }

  next.document.updatedAt = now;
  assertValidTree(next.nodes);
  return next;
}
