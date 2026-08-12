import { newId } from "../domain/ids";
import type { Contributor, ContributorKind } from "../domain/types";

export const LOCAL_CONTRIBUTOR_KEY = "coedit-local-contributor";

const CONTRIBUTOR_KINDS = new Set<ContributorKind>(["human", "automation", "ai", "imported"]);

export function isContributor(value: unknown): value is Contributor {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string"
    && candidate.id.trim().length > 0
    && typeof candidate.displayName === "string"
    && candidate.displayName.trim().length > 0
    && typeof candidate.kind === "string"
    && CONTRIBUTOR_KINDS.has(candidate.kind as ContributorKind)
    && typeof candidate.createdAt === "string"
    && Number.isFinite(Date.parse(candidate.createdAt));
}

export function loadLocalContributor(storage: Pick<Storage, "getItem"> = localStorage): Contributor {
  try {
    const stored = storage.getItem(LOCAL_CONTRIBUTOR_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isContributor(parsed)) return parsed;
    }
  } catch {
    // A corrupt or unavailable non-secret preference must not prevent startup.
  }
  return { id: newId(), displayName: "Local author", kind: "human", createdAt: new Date().toISOString() };
}
