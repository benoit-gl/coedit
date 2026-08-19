import { useEffect, useMemo, useRef, useState } from "react";
import { mergeContributionGroup, projectHistory, type BodyEditGroupHistoryRow } from "../application/historyProjection";
import type { HistoryQuery } from "../application/useDocumentController";
import type { Contribution } from "../domain/types";

interface HistoryPanelProps {
  contributions: Contribution[];
  query: HistoryQuery;
  selectedNodeId: string | null;
  currentRevision: number;
  viewedRevision: number | null;
  loadingRevision: number | null;
  revisionViewingAvailable: boolean;
  contributionGroupQueryAvailable: boolean;
  viewDisabled: boolean;
  restoreDisabled: boolean;
  hasMore: boolean;
  loading: boolean;
  stale: boolean;
  loadError: string | null;
  onQueryChange: (query: HistoryQuery) => void;
  onLoadOlder: () => void;
  onLoadContributionGroup: (groupId: string) => Promise<Contribution[]>;
  onView: (revision: number) => void;
  onRestore: (revision: number) => void;
  onClose: () => void;
}

interface GroupExpansion {
  loading: boolean;
  items: Contribution[] | null;
  error: string | null;
}

export function HistoryPanel({
  contributions,
  query,
  selectedNodeId,
  currentRevision,
  viewedRevision,
  loadingRevision,
  revisionViewingAvailable,
  contributionGroupQueryAvailable,
  viewDisabled,
  restoreDisabled,
  hasMore,
  loading,
  stale,
  loadError,
  onQueryChange,
  onLoadOlder,
  onLoadContributionGroup,
  onView,
  onRestore,
  onClose,
}: HistoryPanelProps) {
  const [search, setSearch] = useState(query.search ?? "");
  const [nodeOnly, setNodeOnly] = useState(query.nodeId !== undefined);
  const [expandedGroupIds, setExpandedGroupIds] = useState<ReadonlySet<string>>(() => new Set());
  const [groupExpansions, setGroupExpansions] = useState<Record<string, GroupExpansion>>({});
  const projectionGeneration = useRef(0);
  const projection = useMemo(() => projectHistory(contributions, hasMore), [contributions, hasMore]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onQueryChange({
        ...(search ? { search } : {}),
        ...(nodeOnly && selectedNodeId ? { nodeId: selectedNodeId } : {}),
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [nodeOnly, onQueryChange, search, selectedNodeId]);

  useEffect(() => {
    projectionGeneration.current += 1;
    setExpandedGroupIds(new Set());
    setGroupExpansions({});
  }, [contributions, query.contributorId, query.nodeId, query.search]);

  const actionFor = (contribution: Contribution) => {
    const current = contribution.revision === currentRevision;
    const viewed = contribution.revision === viewedRevision;
    const revisionLoading = contribution.revision === loadingRevision;
    if (revisionViewingAvailable) {
      if (viewed) return <span className="history-state">Viewing</span>;
      if (current) return <span className="history-state">Current</span>;
      return (
        <button
          type="button"
          disabled={viewDisabled || revisionLoading}
          onClick={() => onView(contribution.revision)}
        >
          {revisionLoading ? "Loading…" : "View"}
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled={restoreDisabled || current}
        onClick={() => onRestore(contribution.revision)}
      >
        Restore
      </button>
    );
  };

  const toggleGroup = (row: BodyEditGroupHistoryRow) => {
    const expanded = expandedGroupIds.has(row.groupId);
    if (expanded) {
      setExpandedGroupIds((current) => {
        const next = new Set(current);
        next.delete(row.groupId);
        return next;
      });
      return;
    }

    setExpandedGroupIds((current) => new Set(current).add(row.groupId));
    if (!row.partial || !contributionGroupQueryAvailable || groupExpansions[row.groupId]?.items) return;

    const generation = projectionGeneration.current;
    setGroupExpansions((current) => ({
      ...current,
      [row.groupId]: { loading: true, items: null, error: null },
    }));
    void onLoadContributionGroup(row.groupId).then(
      (items) => {
        if (projectionGeneration.current !== generation) return;
        setGroupExpansions((current) => ({
          ...current,
          [row.groupId]: {
            loading: false,
            items: mergeContributionGroup(row.contributions, items),
            error: null,
          },
        }));
      },
      (error: unknown) => {
        if (projectionGeneration.current !== generation) return;
        setGroupExpansions((current) => ({
          ...current,
          [row.groupId]: {
            loading: false,
            items: null,
            error: error instanceof Error ? error.message : String(error),
          },
        }));
      },
    );
  };

  return (
    <aside className="history-panel">
      <div className="history-header">
        <div><span className="eyebrow">Immutable ledger</span><h2>History</h2></div>
        <button type="button" onClick={onClose} aria-label="Close history">×</button>
      </div>
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contributions" />
      <label className="check-row"><input type="checkbox" checked={nodeOnly} onChange={(event) => setNodeOnly(event.target.checked)} disabled={!selectedNodeId} /> Selected idea only</label>
      <p className="history-result-count">
        {projection.loadedContributionCount}{hasMore ? "+" : ""} raw contributions loaded · {projection.visibleHistoryRowCount} history rows
      </p>
      {stale && contributions.length > 0 && <div className="history-stale">Refreshing previously loaded results…</div>}
      {loadError && <div className="history-load-error">History could not be refreshed: {loadError}</div>}
      <ol className="history-list" aria-busy={loading}>
        {projection.rows.map((row) => {
          if (row.kind === "contribution") {
            const contribution = row.contribution;
            const viewed = contribution.revision === viewedRevision;
            return (
              <li
                key={contribution.id}
                className={viewed ? "viewing" : ""}
                aria-current={viewed ? "true" : undefined}
              >
                <div className="history-revision">r{contribution.revision}</div>
                <div className="history-copy">
                  <strong>{contribution.message || contribution.operationType}</strong>
                  <span>{contribution.contributorName} · {new Date(contribution.timestamp).toLocaleString()}</span>
                  <code title={contribution.resultingHash}>{contribution.resultingHash.slice(0, 12)}</code>
                </div>
                <div className="history-row-action">{actionFor(contribution)}</div>
              </li>
            );
          }

          const expanded = expandedGroupIds.has(row.groupId);
          const expansion = groupExpansions[row.groupId];
          const exactItems = expansion?.items ?? row.contributions;
          const checkpointLabel = row.partial && !expansion?.items
            ? `at least ${row.contributions.length} safety checkpoints`
            : `${exactItems.length} safety checkpoint${exactItems.length === 1 ? "" : "s"}`;
          const revisionLabel = row.oldestRevision === row.newestRevision
            ? `r${row.newestRevision}`
            : `r${row.oldestRevision}–r${row.newestRevision}`;
          const viewed = exactItems.some((item) => item.revision === viewedRevision);
          return (
            <li key={`group:${row.groupId}`} className={`history-group ${viewed ? "viewing" : ""}`}>
              <div className="history-revision">{revisionLabel}</div>
              <div className="history-copy">
                <strong>{row.canonical.message || "Writing contribution"}</strong>
                <span>{checkpointLabel} · {row.canonical.contributorName}</span>
                {row.partial && !expansion?.items && <span className="history-partial">Older checkpoints are not loaded.</span>}
              </div>
              <div className="history-row-action history-group-actions">
                {actionFor(row.canonical)}
                <button type="button" onClick={() => toggleGroup(row)}>{expanded ? "Collapse" : "Expand"}</button>
              </div>
              {expanded && (
                <ol className="history-checkpoints">
                  {expansion?.loading && <li className="history-group-status">Loading all checkpoints…</li>}
                  {row.partial && !contributionGroupQueryAvailable && (
                    <li className="history-group-status">Full group expansion is unavailable in this host; showing loaded checkpoints only.</li>
                  )}
                  {expansion?.error && <li className="history-group-status history-load-error">Could not load full group: {expansion.error}</li>}
                  {exactItems.map((checkpoint) => (
                    <li key={checkpoint.id} className={checkpoint.revision === viewedRevision ? "viewing" : ""}>
                      <div className="history-revision">r{checkpoint.revision}</div>
                      <div className="history-copy">
                        <strong>Safety checkpoint</strong>
                        <span>{new Date(checkpoint.timestamp).toLocaleString()}</span>
                        <code title={checkpoint.resultingHash}>{checkpoint.resultingHash.slice(0, 12)}</code>
                      </div>
                      <div className="history-row-action">{actionFor(checkpoint)}</div>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
      {contributions.length === 0 && !loading && !loadError && <p className="empty-message">No matching contributions.</p>}
      {loading && <p className="history-loading">Loading history…</p>}
      {hasMore && <button className="history-load-more" type="button" disabled={loading} onClick={onLoadOlder}>Load older contributions</button>}
    </aside>
  );
}
