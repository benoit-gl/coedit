import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { newId } from "../domain/ids";
import type {
  Contribution,
  ContributionContext,
  ContributionQuery,
  Contributor,
  DocumentNode,
  DocumentOperation,
  DocumentView,
  ExportFormat,
} from "../domain/types";
import type { DocumentFileDialogs } from "../persistence/fileDialogs";
import type { DocumentGateway, RevisionQueryCapability } from "../persistence/gateway";
import { DEFAULT_CONTRIBUTION_PAGE_SIZE } from "../persistence/gateway";
import type { BodyCheckpointCommitRequest } from "./bodyCheckpoint";
import {
  DraftTransitionCoordinator,
  type DraftParticipant,
  type RegisterDraftParticipant,
} from "./draftTransition";
import { SerializedTaskQueue } from "./serializedTaskQueue";
import {
  displayedDocumentView,
  displayedSelectedNodeId,
  contextWorkspaceNode,
  historicalWorkspace,
  liveContextFor,
  liveProjectionFor,
  liveWorkspace,
  selectWorkspaceNode,
  releaseWorkspaceEditor,
  WorkspaceMutationUnavailableError,
  type RevisionRequestState,
  type WorkspaceProjection,
} from "./workspaceProjection";

export type HistoryQuery = Pick<ContributionQuery, "search" | "nodeId" | "contributorId">;

interface UseDocumentControllerOptions {
  documentGateway: DocumentGateway;
  revisionQueryCapability: RevisionQueryCapability;
  fileDialogs?: DocumentFileDialogs;
  profile: Contributor;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizedHistoryQuery(query: HistoryQuery): HistoryQuery {
  return {
    ...(query.search?.trim() ? { search: query.search.trim() } : {}),
    ...(query.nodeId ? { nodeId: query.nodeId } : {}),
    ...(query.contributorId ? { contributorId: query.contributorId } : {}),
  };
}

function sameHistoryQuery(left: HistoryQuery, right: HistoryQuery): boolean {
  return left.search === right.search
    && left.nodeId === right.nodeId
    && left.contributorId === right.contributorId;
}

export function useDocumentController({
  documentGateway,
  revisionQueryCapability,
  fileDialogs,
  profile,
}: UseDocumentControllerOptions) {
  const [workspaceProjection, setWorkspaceProjectionState] = useState<WorkspaceProjection | null>(null);
  const [revisionRequestState, setRevisionRequestStateValue] = useState<RevisionRequestState>({ kind: "idle" });
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [historyOpen, setHistoryOpenState] = useState(false);
  const [historyQueryState, setHistoryQueryState] = useState<HistoryQuery>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyStale, setHistoryStale] = useState(false);
  const [busyCount, setBusyCount] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [status, setStatus] = useState("Offline and ready");

  const [mutationQueue] = useState(() => new SerializedTaskQueue());
  const [draftTransitions] = useState(() => new DraftTransitionCoordinator());
  const [sessionId] = useState(() => newId());
  const workspaceProjectionRef = useRef<WorkspaceProjection | null>(null);
  const revisionRequestStateRef = useRef<RevisionRequestState>({ kind: "idle" });
  const revisionRequestId = useRef(0);
  const contributorRef = useRef(profile);
  const workspaceEpoch = useRef(0);
  const historyRequest = useRef(0);
  const historyOpenRef = useRef(false);
  const historyQuery = useRef<HistoryQuery>({});
  const historyCursor = useRef<number | null>(null);
  const historyLoadingRef = useRef(false);

  const view = useMemo(
    () => workspaceProjection ? displayedDocumentView(workspaceProjection) : null,
    [workspaceProjection],
  );
  const liveView = workspaceProjection ? liveContextFor(workspaceProjection).view : null;
  const selectedId = workspaceProjection ? displayedSelectedNodeId(workspaceProjection) : null;
  const contributor = useMemo(
    () => liveView?.contributors.find((item) => item.id === profile.id) ?? liveView?.contributors[0] ?? profile,
    [liveView, profile],
  );
  useLayoutEffect(() => { contributorRef.current = contributor; }, [contributor]);

  const context = useCallback((message: string, groupId: string | null = null): ContributionContext => ({
    contributorId: contributorRef.current.id,
    sessionId,
    groupId,
    message,
  }), [sessionId]);

  const setWorkspaceProjection = useCallback((next: WorkspaceProjection | null) => {
    workspaceProjectionRef.current = next;
    setWorkspaceProjectionState(next);
  }, []);

  const setRevisionRequestState = useCallback((next: RevisionRequestState) => {
    revisionRequestStateRef.current = next;
    setRevisionRequestStateValue(next);
  }, []);

  const invalidateRevisionRequest = useCallback(() => {
    ++revisionRequestId.current;
    setRevisionRequestState({ kind: "idle" });
  }, [setRevisionRequestState]);

  const requestHistory = useCallback(async (
    query: HistoryQuery,
    beforeRevision: number | null,
    append: boolean,
    epoch: number,
    clearExisting = false,
  ) => {
    const request = ++historyRequest.current;
    historyLoadingRef.current = true;
    setHistoryLoading(true);
    setHistoryError(null);
    if (!append) {
      historyCursor.current = null;
      setHistoryHasMore(false);
      if (clearExisting) {
        setContributions([]);
        setHistoryStale(false);
      } else {
        setHistoryStale(true);
      }
    }
    try {
      const page = await documentGateway.listContributions({
        ...query,
        ...(beforeRevision === null ? {} : { beforeRevision }),
        limit: DEFAULT_CONTRIBUTION_PAGE_SIZE,
      });
      if (request !== historyRequest.current || epoch !== workspaceEpoch.current || !historyOpenRef.current) return;
      setContributions((current) => {
        if (!append) return page.items;
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !known.has(item.id))];
      });
      historyCursor.current = page.nextBeforeRevision;
      setHistoryHasMore(page.hasMore);
      setHistoryStale(false);
    } catch (caught) {
      if (request === historyRequest.current && epoch === workspaceEpoch.current && historyOpenRef.current) {
        setHistoryError(errorMessage(caught));
      }
    } finally {
      if (request === historyRequest.current) {
        historyLoadingRef.current = false;
        setHistoryLoading(false);
      }
    }
  }, [documentGateway]);

  const acceptView = useCallback((next: DocumentView, epoch: number, authoritativeReset = false): boolean => {
    if (epoch !== workspaceEpoch.current) return false;
    const currentWorkspace = workspaceProjectionRef.current;
    const current = currentWorkspace ? liveContextFor(currentWorkspace).view : null;
    if (current?.document.id === next.document.id && next.document.revision < current.document.revision) return false;

    const sameDocument = current?.document.id === next.document.id;
    const currentSelection = currentWorkspace ? liveContextFor(currentWorkspace).selectedNodeId : null;
    const selectionStillExists = sameDocument
      && currentSelection !== null
      && next.nodes.some((node) => node.id === currentSelection && node.deletedAt === null);
    const nextSelection = selectionStillExists
      ? currentSelection
      : next.nodes.find((node) => node.deletedAt === null)?.id ?? null;

    const currentEditorOwner = currentWorkspace?.kind === "live"
      ? currentWorkspace.editorOwnerNodeId
      : null;
    const editorOwnerStillExists = sameDocument
      && currentEditorOwner !== null
      && next.nodes.some((node) => node.id === currentEditorOwner && node.deletedAt === null);
    setWorkspaceProjection(liveWorkspace(
      next,
      nextSelection,
      editorOwnerStillExists ? currentEditorOwner : null,
    ));
    if (authoritativeReset) setEditorGeneration((generation) => generation + 1);

    let nextQuery = historyQuery.current;
    if (nextQuery.nodeId && nextQuery.nodeId !== nextSelection) {
      nextQuery = normalizedHistoryQuery({ ...nextQuery, nodeId: nextSelection ?? undefined });
      historyQuery.current = nextQuery;
      setHistoryQueryState(nextQuery);
    }
    historyCursor.current = null;
    setHistoryHasMore(false);
    if (historyOpenRef.current) {
      void requestHistory(nextQuery, null, false, epoch);
    } else {
      setHistoryStale(true);
    }
    return true;
  }, [requestHistory, setWorkspaceProjection]);

  const enqueue = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    setBusyCount((count) => count + 1);
    try {
      return await mutationQueue.enqueue(task);
    } finally {
      setBusyCount((count) => Math.max(0, count - 1));
    }
  }, [mutationQueue]);

  const executeMutation = useCallback(async <T,>(task: () => Promise<T>, success?: string): Promise<T> => {
    return enqueue(async () => {
      setError(null);
      try {
        const result = await task();
        if (success) setStatus(success);
        return result;
      } catch (caught) {
        setError(errorMessage(caught));
        throw caught;
      }
    });
  }, [enqueue]);

  const runTransition = useCallback(async (
    task: () => Promise<void>,
    success?: string,
  ): Promise<boolean> => {
    const transition = draftTransitions.begin();
    if (!transition) return false;
    setTransitioning(true);
    setError(null);
    try {
      await transition.flush();
      await task();
      if (success) setStatus(success);
      return true;
    } catch (caught) {
      if (caught instanceof TransitionCancelled) return false;
      setError(errorMessage(caught));
      return false;
    } finally {
      transition.release();
      setTransitioning(false);
    }
  }, [draftTransitions]);

  const registerDraftParticipant = useCallback<RegisterDraftParticipant>((key, participant) => (
    draftTransitions.register(key, participant)
  ), [draftTransitions]);

  const resetHistoryForWorkspace = useCallback(() => {
    ++historyRequest.current;
    historyQuery.current = {};
    historyCursor.current = null;
    historyLoadingRef.current = false;
    setHistoryQueryState({});
    setContributions([]);
    setHistoryLoading(false);
    setHistoryHasMore(false);
    setHistoryStale(false);
    setHistoryError(null);
  }, []);

  const createDocument = useCallback((title: string): Promise<boolean> => runTransition(async () => {
    if (workspaceProjectionRef.current || revisionRequestStateRef.current.kind === "loading") {
      throw new Error("Creating a document is available only from the welcome workspace.");
    }
    const storage = documentGateway.storage;
    let created: DocumentView;
    if (storage.kind === "volatile") {
      created = await executeMutation(
        () => storage.createDocument(title, profile),
      );
    } else {
      if (!fileDialogs) throw new Error("Desktop file dialogs are not configured.");
      const path = await fileDialogs.chooseDocumentToCreate(title);
      if (!path) throw new TransitionCancelled();
      created = await executeMutation(
        () => storage.createDocument(path, title, profile),
      );
    }
    const epoch = ++workspaceEpoch.current;
    invalidateRevisionRequest();
    resetHistoryForWorkspace();
    acceptView(created, epoch, true);
  }, "Document created"), [
    acceptView,
    documentGateway,
    executeMutation,
    fileDialogs,
    invalidateRevisionRequest,
    profile,
    resetHistoryForWorkspace,
    runTransition,
  ]);

  const openDocument = useCallback((): Promise<boolean> => runTransition(async () => {
    if (workspaceProjectionRef.current || revisionRequestStateRef.current.kind === "loading") {
      throw new Error("Opening a document is available only from the welcome workspace.");
    }
    const storage = documentGateway.storage;
    if (storage.kind !== "native-file" || !fileDialogs) throw new TransitionCancelled();
    const path = await fileDialogs.chooseDocumentToOpen();
    if (!path) throw new TransitionCancelled();
    const opened = await executeMutation(() => storage.openDocument(path));
    const epoch = ++workspaceEpoch.current;
    invalidateRevisionRequest();
    resetHistoryForWorkspace();
    acceptView(opened, epoch, true);
  }, "Document opened"), [
    acceptView,
    documentGateway,
    executeMutation,
    fileDialogs,
    invalidateRevisionRequest,
    resetHistoryForWorkspace,
    runTransition,
  ]);

  const requireLiveWorkspace = useCallback(() => {
    const current = workspaceProjectionRef.current;
    if (!current) throw new Error("No document is open.");
    if (current.kind !== "live" || revisionRequestStateRef.current.kind === "loading") {
      throw new WorkspaceMutationUnavailableError();
    }
    return current;
  }, []);

  const assertCurrentWorkspace = useCallback((epoch: number, documentId: string) => {
    const current = requireLiveWorkspace();
    if (epoch !== workspaceEpoch.current || current.displayed.view.document.id !== documentId) {
      throw new Error("The document changed before the edit could be saved.");
    }
  }, [requireLiveWorkspace]);

  const commitRawOperation = useCallback(async (
    operation: DocumentOperation,
    message: string,
    groupId: string | null = null,
  ): Promise<void> => {
    const current = requireLiveWorkspace().displayed.view;
    const epoch = workspaceEpoch.current;
    const documentId = current.document.id;
    await executeMutation(async () => {
      assertCurrentWorkspace(epoch, documentId);
      const updated = await documentGateway.applyOperation(operation, context(message, groupId));
      acceptView(updated, epoch);
    }, "All changes saved locally");
  }, [acceptView, assertCurrentWorkspace, context, documentGateway, executeMutation, requireLiveWorkspace]);

  const commitBody = useCallback((checkpoint: BodyCheckpointCommitRequest): Promise<void> => {
    if (!checkpoint.groupId.trim()) {
      return Promise.reject(new Error("A body checkpoint requires a non-empty group ID."));
    }
    return commitRawOperation(
      {
        type: "updateBody",
        nodeId: checkpoint.nodeId,
        bodyHtml: checkpoint.bodyHtml,
        yjsUpdate: checkpoint.yjsUpdate,
        yjsState: checkpoint.yjsState,
      },
      "Writing contribution",
      checkpoint.groupId,
    );
  }, [commitRawOperation]);

  const commitNodeMetadata = useCallback((
    nodeId: string,
    changes: Partial<Pick<DocumentNode, "title" | "tags">>,
  ): Promise<void> => commitRawOperation(
    { type: "updateNode", nodeId, changes },
    "Refined idea",
  ), [commitRawOperation]);

  const commitDocumentTitle = useCallback((title: string): Promise<void> => commitRawOperation(
    { type: "renameDocument", title },
    "Renamed document",
  ), [commitRawOperation]);

  const applyOperation = useCallback((
    operation: DocumentOperation,
    message: string,
    groupId: string | null = null,
  ): Promise<boolean> => runTransition(
    () => commitRawOperation(operation, message, groupId),
  ), [commitRawOperation, runTransition]);

  const updateContextHistoryQuery = useCallback((nodeId: string) => {
    if (!historyQuery.current.nodeId) return;
    const query = normalizedHistoryQuery({ ...historyQuery.current, nodeId });
    historyQuery.current = query;
    setHistoryQueryState(query);
    if (historyOpenRef.current) {
      void requestHistory(query, null, false, workspaceEpoch.current, true);
    }
  }, [requestHistory]);

  const setCanvasContextNode = useCallback((nodeId: string): boolean => {
    const projection = workspaceProjectionRef.current;
    if (!projection || !displayedDocumentView(projection).nodes.some(
      (node) => node.id === nodeId && node.deletedAt === null,
    )) return false;
    if (displayedSelectedNodeId(projection) === nodeId) return true;
    setWorkspaceProjection(contextWorkspaceNode(projection, nodeId));
    updateContextHistoryQuery(nodeId);
    return true;
  }, [setWorkspaceProjection, updateContextHistoryQuery]);

  const selectNode = useCallback((nodeId: string): Promise<boolean> => {
    const current = workspaceProjectionRef.current;
    if (
      current
      && nodeId === displayedSelectedNodeId(current)
      && (current.kind === "historical" || current.editorOwnerNodeId === nodeId)
    ) return Promise.resolve(true);
    return runTransition(async () => {
      if (revisionRequestStateRef.current.kind === "loading") {
        throw new Error("Workspace navigation is unavailable while a historical revision is loading.");
      }
      const projection = workspaceProjectionRef.current;
      if (!projection || !displayedDocumentView(projection).nodes.some(
        (node) => node.id === nodeId && node.deletedAt === null,
      )) throw new Error("The selected idea is no longer available.");
      setWorkspaceProjection(selectWorkspaceNode(projection, nodeId));
      updateContextHistoryQuery(nodeId);
    });
  }, [runTransition, setWorkspaceProjection, updateContextHistoryQuery]);

  const releaseEditorOwner = useCallback((preferredContextNodeId?: string): Promise<boolean> => {
    const current = workspaceProjectionRef.current;
    if (current?.kind === "live" && current.editorOwnerNodeId === null) {
      if (preferredContextNodeId) setCanvasContextNode(preferredContextNodeId);
      return Promise.resolve(true);
    }
    return runTransition(async () => {
      const projection = workspaceProjectionRef.current;
      if (!projection || projection.kind !== "live") {
        throw new WorkspaceMutationUnavailableError();
      }
      const contextNodeId = preferredContextNodeId ?? projection.displayed.selectedNodeId;
      setWorkspaceProjection(releaseWorkspaceEditor(projection, contextNodeId));
      if (contextNodeId) updateContextHistoryQuery(contextNodeId);
    });
  }, [runTransition, setCanvasContextNode, setWorkspaceProjection, updateContextHistoryQuery]);

  const createCanvasNode = useCallback(async (
    parentId: string | null,
    index?: number,
  ): Promise<string | null> => {
    const id = newId();
    const created = await runTransition(async () => {
      await commitRawOperation(
        { type: "createNode", node: { id, parentId, title: "New idea" }, index },
        parentId ? "Added sub-idea" : "Added root idea",
      );
      const projection = workspaceProjectionRef.current;
      if (!projection || projection.kind !== "live") {
        throw new WorkspaceMutationUnavailableError();
      }
      setWorkspaceProjection(releaseWorkspaceEditor(projection, id));
      updateContextHistoryQuery(id);
    });
    return created ? id : null;
  }, [commitRawOperation, runTransition, setWorkspaceProjection, updateContextHistoryQuery]);

  const viewRevision = useCallback(async (revision: number): Promise<boolean> => {
    if (revisionQueryCapability.kind !== "available") {
      setError("Historical revision viewing is unavailable in this host.");
      return false;
    }
    if (!workspaceProjectionRef.current) {
      setError("No document is open.");
      return false;
    }

    const flushed = await runTransition(async () => undefined);
    if (!flushed) return false;

    const origin = workspaceProjectionRef.current;
    if (!origin) return false;
    const epoch = workspaceEpoch.current;
    const requestId = ++revisionRequestId.current;
    setRevisionRequestState({ kind: "loading", requestedRevision: revision, requestId, origin });
    setError(null);

    try {
      const materialized = await revisionQueryCapability.queries.materializeRevision(revision);
      if (requestId !== revisionRequestId.current || epoch !== workspaceEpoch.current) return false;
      setWorkspaceProjection(historicalWorkspace(origin, materialized));
      setRevisionRequestState({ kind: "idle" });
      setEditorGeneration((generation) => generation + 1);
      setStatus(`Viewing revision ${revision} read-only`);
      return true;
    } catch (caught) {
      if (requestId !== revisionRequestId.current || epoch !== workspaceEpoch.current) return false;
      setWorkspaceProjection(origin);
      setRevisionRequestState({ kind: "idle" });
      setError(errorMessage(caught));
      return false;
    }
  }, [revisionQueryCapability, runTransition, setRevisionRequestState, setWorkspaceProjection]);

  const backToCurrent = useCallback((): boolean => {
    const request = revisionRequestStateRef.current;
    const current = workspaceProjectionRef.current;
    const origin = request.kind === "loading" ? request.origin : current;
    const changed = request.kind === "loading" || origin?.kind === "historical";
    invalidateRevisionRequest();

    if (origin?.kind === "historical") {
      setWorkspaceProjection(liveProjectionFor(origin));
      setEditorGeneration((generation) => generation + 1);
    } else if (origin?.kind === "live" && current !== origin) {
      setWorkspaceProjection(origin);
    }
    if (changed) {
      setError(null);
      setStatus("Back to current revision");
    }
    return changed;
  }, [invalidateRevisionRequest, setWorkspaceProjection]);

  const restoreRevision = useCallback((revision: number): Promise<boolean> => runTransition(async () => {
    if (revisionRequestStateRef.current.kind === "loading") {
      throw new Error("Wait for historical revision loading to finish before restoring.");
    }
    const epoch = workspaceEpoch.current;
    const restored = await executeMutation(
      () => documentGateway.restoreRevision(revision, context(`Restored revision ${revision}`)),
    );
    invalidateRevisionRequest();
    acceptView(restored, epoch, true);
  }, `Restored revision ${revision}`), [
    acceptView,
    context,
    documentGateway,
    executeMutation,
    invalidateRevisionRequest,
    runTransition,
  ]);

  const exportDocument = useCallback((format: ExportFormat): Promise<boolean> => runTransition(async () => {
    const current = requireLiveWorkspace().displayed.view;
    const storage = documentGateway.storage;
    if (storage.kind === "volatile") {
      await executeMutation(() => storage.exportDocument(format));
      return;
    }
    if (!fileDialogs) throw new Error("Desktop file dialogs are not configured.");
    const path = await fileDialogs.chooseExportPath(format, current.document.title);
    if (!path) throw new TransitionCancelled();
    await executeMutation(() => storage.exportDocument(format, path));
  }, `Exported ${format}`), [documentGateway, executeMutation, fileDialogs, requireLiveWorkspace, runTransition]);

  const backupDocument = useCallback((): Promise<boolean> => runTransition(async () => {
    const current = requireLiveWorkspace().displayed.view;
    const storage = documentGateway.storage;
    if (storage.kind !== "native-file" || !fileDialogs) {
      throw new TransitionCancelled();
    }
    const path = await fileDialogs.chooseBackupPath(current.document.title);
    if (!path) throw new TransitionCancelled();
    await executeMutation(() => storage.backupDocument(path));
  }, "Backup created"), [documentGateway, executeMutation, fileDialogs, requireLiveWorkspace, runTransition]);

  const closeDocument = useCallback((): Promise<boolean> => {
    invalidateRevisionRequest();
    return runTransition(async () => {
      await executeMutation(() => documentGateway.closeDocument());
      ++workspaceEpoch.current;
      resetHistoryForWorkspace();
      setWorkspaceProjection(null);
      setHistoryOpenState(false);
      historyOpenRef.current = false;
      setEditorGeneration((generation) => generation + 1);
    });
  }, [
    documentGateway,
    executeMutation,
    invalidateRevisionRequest,
    resetHistoryForWorkspace,
    runTransition,
    setWorkspaceProjection,
  ]);

  const updateHistoryQuery = useCallback((query: HistoryQuery) => {
    const normalized = normalizedHistoryQuery(query);
    if (sameHistoryQuery(normalized, historyQuery.current)) return;
    historyQuery.current = normalized;
    historyCursor.current = null;
    setHistoryQueryState(normalized);
    setContributions([]);
    setHistoryHasMore(false);
    setHistoryStale(false);
    if (workspaceProjectionRef.current && historyOpenRef.current) {
      void requestHistory(normalized, null, false, workspaceEpoch.current, true);
    }
  }, [requestHistory]);

  const loadOlderHistory = useCallback(() => {
    if (!workspaceProjectionRef.current || !historyOpenRef.current || !historyHasMore
      || historyLoadingRef.current || historyCursor.current === null) return;
    void requestHistory(historyQuery.current, historyCursor.current, true, workspaceEpoch.current);
  }, [historyHasMore, requestHistory]);

  const changeHistoryOpen = useCallback((open: boolean) => {
    historyOpenRef.current = open;
    setHistoryOpenState(open);
    if (open) {
      if (workspaceProjectionRef.current) {
        void requestHistory(historyQuery.current, null, false, workspaceEpoch.current);
      }
    } else {
      ++historyRequest.current;
      historyLoadingRef.current = false;
      setHistoryLoading(false);
    }
  }, [requestHistory]);

  return {
    view,
    workspaceProjection,
    revisionRequest: revisionRequestState,
    currentRevision: workspaceProjection ? liveContextFor(workspaceProjection).view.document.revision : null,
    contributions,
    selectedId,
    selectedNode: view?.nodes.find((node) => node.id === selectedId && node.deletedAt === null) ?? null,
    editorGeneration,
    historyOpen,
    historyQuery: historyQueryState,
    historyLoading,
    historyHasMore,
    historyStale,
    historyError,
    busy: busyCount > 0,
    transitioning,
    error,
    status,
    nativeFilesAvailable: documentGateway.storage.kind === "native-file",
    createDocument,
    openDocument,
    applyOperation,
    commitBody,
    commitNodeMetadata,
    commitDocumentTitle,
    selectNode,
    setCanvasContextNode,
    releaseEditorOwner,
    createCanvasNode,
    viewRevision,
    backToCurrent,
    restoreRevision,
    exportDocument,
    backupDocument,
    closeDocument,
    registerDraftParticipant,
    setHistoryOpen: changeHistoryOpen,
    updateHistoryQuery,
    loadOlderHistory,
    clearError: () => setError(null),
  };
}

class TransitionCancelled extends Error {}

export type { DraftParticipant, RegisterDraftParticipant };
