export type ContributorKind = "human" | "automation" | "ai" | "imported";
export type ExportFormat = "json" | "markdown";
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }

export interface Contributor {
  id: string;
  displayName: string;
  kind: ContributorKind;
  createdAt: string;
}

export interface WritingSession {
  id: string;
  contributorId: string;
  startedAt: string;
  endedAt: string | null;
  description: string | null;
}

export interface DocumentMetadata {
  id: string;
  title: string;
  formatVersion: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentNode {
  id: string;
  parentId: string | null;
  position: number;
  tags: string[];
  title: string;
  bodyHtml: string;
  yjsState: string;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DocumentState {
  document: DocumentMetadata;
  nodes: DocumentNode[];
  contributors: Contributor[];
  sessions: WritingSession[];
}

export interface DocumentView extends DocumentState {
  path: string | null;
  readOnly: boolean;
  recoveryWarning: string | null;
}

export type DocumentOperation =
  | {
      type: "createNode";
      node: Pick<DocumentNode, "id" | "title"> &
        Partial<Pick<DocumentNode, "parentId" | "tags" | "bodyHtml" | "yjsState" | "metadata">>;
      index?: number;
    }
  | {
      type: "updateNode";
      nodeId: string;
      changes: Partial<Pick<DocumentNode, "title" | "tags" | "metadata">>;
    }
  | {
      type: "updateBody";
      nodeId: string;
      bodyHtml: string;
      yjsUpdate: string;
      yjsState: string;
    }
  | {
      type: "moveNode";
      nodeId: string;
      parentId: string | null;
      index: number;
    }
  | { type: "softDeleteNode"; nodeId: string }
  | { type: "restoreNode"; nodeId: string }
  | { type: "renameDocument"; title: string };

export interface ContributionContext {
  contributorId: string;
  sessionId: string | null;
  groupId: string | null;
  message: string | null;
}

export interface Contribution {
  id: string;
  revision: number;
  contributorId: string;
  contributorName: string;
  contributorKind: ContributorKind;
  sessionId: string | null;
  groupId: string | null;
  timestamp: string;
  operationType: DocumentOperation["type"] | "createDocument" | "restoreRevision";
  affectedNodeIds: string[];
  payload: JsonValue;
  baseRevision: number;
  resultingHash: string;
  message: string | null;
}

export interface ContributionQuery {
  search?: string;
  nodeId?: string;
  contributorId?: string;
  beforeRevision?: number;
  limit?: number;
}

export interface ContributionPage {
  items: Contribution[];
  nextBeforeRevision: number | null;
  hasMore: boolean;
}

export interface RecoveryExport {
  format: "coedit-recovery";
  exportVersion: 2;
  exportedAt: string;
  hashAlgorithm: "coedit-document-state-v1";
  stateHash: string;
  state: DocumentState;
  history: {
    order: "revision-descending";
    complete: boolean;
  };
  contributions: Contribution[];
}

export interface ExportResult {
  path: string;
  bytesWritten: number;
}

export interface AiProviderMetadata {
  provider: string;
  model: string;
  endpoint: string;
}

export interface AiProposal {
  id: string;
  nodeId: string;
  prompt: string;
  proposedHtml: string;
  metadata: AiProviderMetadata;
}
