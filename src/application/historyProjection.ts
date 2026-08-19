import type { Contribution } from "../domain/types";

export interface ContributionHistoryRow {
  kind: "contribution";
  contribution: Contribution;
}

export interface BodyEditGroupHistoryRow {
  kind: "body-group";
  groupId: string;
  contributions: Contribution[];
  canonical: Contribution;
  newestRevision: number;
  oldestRevision: number;
  partial: boolean;
}

export type HistoryRow = ContributionHistoryRow | BodyEditGroupHistoryRow;

export interface HistoryProjection {
  rows: HistoryRow[];
  loadedContributionCount: number;
  visibleHistoryRowCount: number;
}

function groupEligible(contribution: Contribution): contribution is Contribution & { groupId: string } {
  return contribution.operationType === "updateBody"
    && contribution.groupId !== null
    && contribution.groupId.trim().length > 0;
}

export function projectHistory(
  contributions: readonly Contribution[],
  hasMore: boolean,
): HistoryProjection {
  const unique: Contribution[] = [];
  const seen = new Set<string>();
  for (const contribution of contributions) {
    if (seen.has(contribution.id)) continue;
    seen.add(contribution.id);
    unique.push(contribution);
  }

  const rows: HistoryRow[] = [];
  for (const contribution of unique) {
    const previous = rows[rows.length - 1];
    if (
      groupEligible(contribution)
      && previous?.kind === "body-group"
      && previous.groupId === contribution.groupId
    ) {
      previous.contributions.push(contribution);
      previous.oldestRevision = contribution.revision;
      continue;
    }

    if (groupEligible(contribution)) {
      rows.push({
        kind: "body-group",
        groupId: contribution.groupId,
        contributions: [contribution],
        canonical: contribution,
        newestRevision: contribution.revision,
        oldestRevision: contribution.revision,
        partial: false,
      });
    } else {
      rows.push({ kind: "contribution", contribution });
    }
  }

  if (hasMore && unique.length > 0) {
    const oldestContribution = unique[unique.length - 1];
    const oldestRow = rows[rows.length - 1];
    if (
      groupEligible(oldestContribution)
      && oldestRow?.kind === "body-group"
      && oldestRow.groupId === oldestContribution.groupId
    ) {
      oldestRow.partial = true;
    }
  }

  return {
    rows,
    loadedContributionCount: unique.length,
    visibleHistoryRowCount: rows.length,
  };
}

export function mergeContributionGroup(
  loaded: readonly Contribution[],
  exact: readonly Contribution[],
): Contribution[] {
  const byId = new Map<string, Contribution>();
  for (const contribution of [...loaded, ...exact]) byId.set(contribution.id, contribution);
  return [...byId.values()].sort((left, right) => right.revision - left.revision);
}
