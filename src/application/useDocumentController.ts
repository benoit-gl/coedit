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
import type { DocumentGateway } from "../persistence/gateway";
import { DEFAULT_CONTRIBUTION_PAGE_SIZE } from "../persistence/gateway";
import {
  DraftTransitionCoordinator,
  type DraftParticipant,
  type RegisterDraftParticipant,
} from "./draftTransition";
import { SerializedTaskQueue } from "./serializedTaskQueue";

export type HistoryQuery = Pick<ContributionQuery, "search" | "nodeId" | "contributorId">;

interface UseDocumentControllerOptions {
  documentGateway: DocumentGateway;
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

export function useDocumentController({ documentGateway, fileDialogs, profile }: UseDocumentControllerOptions) {
  const [view, setView] = useState<DocumentView | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const viewRef = useRef<DocumentView | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const contributorRef = useRef(profile);
  const workspaceEpoch = useRef(0);
  const historyRequest = useRef(0);
  const historyOpenRef = useRef(false);
  const historyQuery = useRef<HistoryQuery>({});
  const historyCursor = useRef<number | null>(null);
  const historyLoadingRef = useRef(false);

  const contributor = useMemo(
    () => view?.contributors.find((item) => item.id === profile.id) ?? view?.contributors[0] ?? profile,
    [profile, view],
  );
  useLayoutEffect(() => { contributorRef.current = contributor; }, [contributor]);

  const context = useCallback((message: string, groupId: string | null = null): ContributionContext => ({
    contributorId: contributorRef.current.id,
    sessionId,
    groupId,
    message,
  }), [sessionId]);

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

  const setSelection = useCallback((nodeId: string | null) => {
    selectedIdRef.current = nodeId;
    setSelectedId(nodeId);
  }, []);

  const acceptView = useCallback((next: DocumentView, epoch: number, authoritativeReset = false): boolean => {
    if (epoch !== workspaceEpoch.current) return false;
    const current = viewRef.current;
    if (current?.document.id === next.document.id && next.document.revision < current.document.revision) return false;

    const sameDocument = current?.document.id === next.document.id;
    const currentSelection = selectedIdRef.current;
    const selectionStillExists = sameDocument
      && currentSelection !== null
      && next.nodes.some((node) => node.id === currentSelection && node.deletedAt === null);
    const nextSelection = selectionStillExists
      ? currentSelection
      : next.nodes.find((node) => node.deletedAt === null)?.id ?? null;

    viewRef.current = next;
    setView(next);
    setSelection(nextSelection);
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
  }, [requestHistory, setSelection]);

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
    resetHistoryForWorkspace();
    acceptView(created, epoch, true);
  }, "Document created"), [
    acceptView,
    documentGateway,
    executeMutation,
    fileDialogs,
    profile,
    resetHistoryForWorkspace,
    runTransition,
  ]);

  const openDocument = useCallback((): Promise<boolean> => runTransition(async () => {
    const storage = documentGateway.storage;
    if (storage.kind !== "native-file" || !fileDialogs) throw new TransitionCancelled();
    const path = await fileDialogs.chooseDocumentToOpen();
    if (!path) throw new TransitionCancelled();
    const opened = await executeMutation(() => storage.openDocument(path));
    const epoch = ++workspaceEpoch.current;
    resetHistoryForWorkspace();
    acceptView(opened, epoch, true);
  }, "Document opened"), [
    acceptView,
    documentGateway,
    executeMutation,
    fileDialogs,
    resetHistoryForWorkspace,
    runTransition,
  ]);

  const assertCurrentWorkspace = useCallback((epoch: number, documentId: string) => {
    if (epoch !== workspaceEpoch.current || viewRef.current?.document.id !== documentId) {
      throw new Error("The document changed before the edit could be saved.");
    }
  }, []);

  const commitRawOperation = useCallback(async (
    operation: DocumentOperation,
    message: string,
    groupId: string | null = null,
  ): Promise<void> => {
    const current = viewRef.current;
    if (!current) throw new Error("No document is open.");
    const epoch = workspaceEpoch.current;
    const documentId = current.document.id;
    await executeMutation(async () => {
      assertCurrentWorkspace(epoch, documentId);
      const updated = await documentGateway.applyOperation(operation, context(message, groupId));
      acceptView(updated, epoch);
    }, "All changes saved locally");
  }, [acceptView, assertCurrentWorkspace, context, documentGateway, executeMutation]);

  const commitBody = useCallback((
    nodeId: string,
    bodyHtml: string,
    yjsUpdate: string,
    yjsState: string,
  ): Promise<void> => commitRawOperation(
    { type: "updateBody", nodeId, bodyHtml, yjsUpdate, yjsState },
    "Writing contribution",
    newId(),
  ), [commitRawOperation]);

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

  const selectNode = useCallback((nodeId: string): Promise<boolean> => {
    if (nodeId === selectedIdRef.current) return Promise.resolve(true);
    return runTransition(async () => {
      const exists = viewRef.current?.nodes.some((node) => node.id === nodeId && node.deletedAt === null);
      if (!exists) throw new Error("The selected idea is no longer available.");
      setSelection(nodeId);
      if (historyQuery.current.nodeId) {
        const query = normalizedHistoryQuery({ ...historyQuery.current, nodeId });
        historyQuery.current = query;
        setHistoryQueryState(query);
        if (historyOpenRef.current) {
          void requestHistory(query, null, false, workspaceEpoch.current, true);
        }
      }
    });
  }, [requestHistory, runTransition, setSelection]);

  const restoreRevision = useCallback((revision: number): Promise<boolean> => runTransition(async () => {
    const epoch = workspaceEpoch.current;
    const restored = await executeMutation(
      () => documentGateway.restoreRevision(revision, context(`Restored revision ${revision}`)),
    );
    acceptView(restored, epoch, true);
  }, `Restored revision ${revision}`), [acceptView, context, documentGateway, executeMutation, runTransition]);

  const exportDocument = useCallback((format: ExportFormat): Promise<boolean> => runTransition(async () => {
    const current = viewRef.current;
    if (!current) throw new Error("No document is open.");
    const storage = documentGateway.storage;
    if (storage.kind === "volatile") {
      await executeMutation(() => storage.exportDocument(format));
      return;
    }
    if (!fileDialogs) throw new Error("Desktop file dialogs are not configured.");
    const path = await fileDialogs.chooseExportPath(format, current.document.title);
    if (!path) throw new TransitionCancelled();
    await executeMutation(() => storage.exportDocument(format, path));
  }, `Exported ${format}`), [documentGateway, executeMutation, fileDialogs, runTransition]);

  const backupDocument = useCallback((): Promise<boolean> => runTransition(async () => {
    const current = viewRef.current;
    const storage = documentGateway.storage;
    if (!current || storage.kind !== "native-file" || !fileDialogs) {
      throw new TransitionCancelled();
    }
    const path = await fileDialogs.chooseBackupPath(current.document.title);
    if (!path) throw new TransitionCancelled();
    await executeMutation(() => storage.backupDocument(path));
  }, "Backup created"), [documentGateway, executeMutation, fileDialogs, runTransition]);

  const closeDocument = useCallback((): Promise<boolean> => runTransition(async () => {
    await executeMutation(() => documentGateway.closeDocument());
    ++workspaceEpoch.current;
    resetHistoryForWorkspace();
    viewRef.current = null;
    setView(null);
    setSelection(null);
    setHistoryOpenState(false);
    historyOpenRef.current = false;
    setEditorGeneration((generation) => generation + 1);
  }), [documentGateway, executeMutation, resetHistoryForWorkspace, runTransition, setSelection]);

  const updateHistoryQuery = useCallback((query: HistoryQuery) => {
    const normalized = normalizedHistoryQuery(query);
    if (sameHistoryQuery(normalized, historyQuery.current)) return;
    historyQuery.current = normalized;
    historyCursor.current = null;
    setHistoryQueryState(normalized);
    setContributions([]);
    setHistoryHasMore(false);
    setHistoryStale(false);
    if (viewRef.current && historyOpenRef.current) {
      void requestHistory(normalized, null, false, workspaceEpoch.current, true);
    }
  }, [requestHistory]);

  const loadOlderHistory = useCallback(() => {
    if (!viewRef.current || !historyOpenRef.current || !historyHasMore
      || historyLoadingRef.current || historyCursor.current === null) return;
    void requestHistory(historyQuery.current, historyCursor.current, true, workspaceEpoch.current);
  }, [historyHasMore, requestHistory]);

  const changeHistoryOpen = useCallback((open: boolean) => {
    historyOpenRef.current = open;
    setHistoryOpenState(open);
    if (open) {
      if (viewRef.current) {
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
