import type { DocumentState } from "./types";
import { canonicalJson, cloneJsonObject, compareJsonStrings } from "./json";

export const DOCUMENT_HASH_ALGORITHM = "coedit-document-state-v1" as const;

export function toDocumentState(state: DocumentState): DocumentState {
  return {
    document: {
      id: state.document.id,
      title: state.document.title,
      formatVersion: state.document.formatVersion,
      revision: state.document.revision,
      createdAt: state.document.createdAt,
      updatedAt: state.document.updatedAt,
    },
    nodes: state.nodes.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      position: node.position,
      kind: node.kind,
      title: node.title,
      summary: node.summary,
      contentHtml: node.contentHtml,
      yjsState: node.yjsState,
      metadata: cloneJsonObject(node.metadata),
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      deletedAt: node.deletedAt,
    })),
    contributors: state.contributors.map((contributor) => ({
      id: contributor.id,
      displayName: contributor.displayName,
      kind: contributor.kind,
      createdAt: contributor.createdAt,
    })),
    sessions: state.sessions.map((session) => ({
      id: session.id,
      contributorId: session.contributorId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      description: session.description,
    })),
  };
}

export function canonicalDocumentJson(state: DocumentState): string {
  const projected = toDocumentState(state);
  return canonicalJson({
    ...projected,
    nodes: [...projected.nodes].sort((left, right) => compareJsonStrings(left.id, right.id)),
    contributors: [...projected.contributors].sort((left, right) => compareJsonStrings(left.id, right.id)),
    sessions: [...projected.sessions].sort((left, right) => compareJsonStrings(left.id, right.id)),
  });
}

export async function hashDocument(state: DocumentState): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalDocumentJson(state));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
