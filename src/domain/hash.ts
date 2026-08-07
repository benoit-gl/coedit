import type { DocumentState } from "./types";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

export function canonicalDocumentJson(state: DocumentState): string {
  return JSON.stringify(
    stable({
      ...state,
      nodes: [...state.nodes].sort((left, right) => left.id.localeCompare(right.id)),
      contributors: [...state.contributors].sort((left, right) => left.id.localeCompare(right.id)),
      sessions: [...state.sessions].sort((left, right) => left.id.localeCompare(right.id)),
    }),
  );
}

export async function hashDocument(state: DocumentState): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalDocumentJson(state));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

