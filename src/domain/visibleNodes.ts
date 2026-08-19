import { compareJsonStrings } from "./json";
import { assertValidTree } from "./tree";
import type { DocumentNode } from "./types";

export interface VisibleNodeBlock {
  readonly node: Readonly<DocumentNode>;
  readonly depth: number;
  readonly hasActiveChildren: boolean;
  readonly expanded: boolean;
  readonly visibleIndex: number;
  readonly previousVisibleNodeId: string | null;
  readonly nextVisibleNodeId: string | null;
}

interface ProjectedNodeBlock {
  node: DocumentNode;
  depth: number;
  hasActiveChildren: boolean;
  expanded: boolean;
}

function compareSiblings(left: DocumentNode, right: DocumentNode): number {
  if (left.position < right.position) return -1;
  if (left.position > right.position) return 1;
  return compareJsonStrings(left.id, right.id);
}

/**
 * Projects the persisted flat node collection into immutable visible canvas
 * order. The source nodes are retained by identity and are never modified.
 */
export function projectVisibleNodes(
  nodes: readonly DocumentNode[],
  expandedNodeIds: ReadonlySet<string>,
): readonly Readonly<VisibleNodeBlock>[] {
  // Validate imported/stored structure before filtering, then validate the
  // active subset so an active child of a deleted parent cannot become a root.
  assertValidTree(nodes);
  const activeNodes = nodes.filter((node) => node.deletedAt === null);
  assertValidTree(activeNodes);

  const childrenByParent = new Map<string | null, DocumentNode[]>();
  for (const node of activeNodes) {
    const siblings = childrenByParent.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenByParent.set(node.parentId, [node]);
  }
  for (const siblings of childrenByParent.values()) siblings.sort(compareSiblings);

  const projected: ProjectedNodeBlock[] = [];
  const roots = childrenByParent.get(null) ?? [];
  const stack: Array<{ node: DocumentNode; depth: number }> = [];
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    stack.push({ node: roots[index], depth: 0 });
  }

  while (stack.length > 0) {
    const current = stack.pop()!;
    const children = childrenByParent.get(current.node.id) ?? [];
    const hasActiveChildren = children.length > 0;
    const expanded = hasActiveChildren && expandedNodeIds.has(current.node.id);
    projected.push({
      node: current.node,
      depth: current.depth,
      hasActiveChildren,
      expanded,
    });
    if (!expanded) continue;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], depth: current.depth + 1 });
    }
  }

  if (projected.length > activeNodes.length) {
    throw new Error("Visible-node projection emitted more nodes than the active hierarchy contains.");
  }

  const result = projected.map((block, visibleIndex, visible) => Object.freeze({
    ...block,
    visibleIndex,
    previousVisibleNodeId: visible[visibleIndex - 1]?.node.id ?? null,
    nextVisibleNodeId: visible[visibleIndex + 1]?.node.id ?? null,
  }));
  return Object.freeze(result);
}
