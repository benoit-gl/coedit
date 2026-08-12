import type { DocumentNode } from "./types";

export const MAX_TAGS_PER_NODE = 20;
export const MAX_TAG_CODE_POINTS = 64;
export const MAX_TAG_UTF8_BYTES = 256;

function tagIdentity(tag: string): string {
  return tag.toLowerCase();
}

export function normalizeTag(value: string): string {
  if (typeof value !== "string") throw new Error("A tag must be text.");
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized) return "";
  if ([...normalized].some((character) => /\p{Cc}/u.test(character))) {
    throw new Error("Tags cannot contain control characters.");
  }
  if (Array.from(normalized).length > MAX_TAG_CODE_POINTS) {
    throw new Error(`A tag cannot exceed ${MAX_TAG_CODE_POINTS} characters.`);
  }
  if (new TextEncoder().encode(normalized).length > MAX_TAG_UTF8_BYTES) {
    throw new Error(`A tag cannot exceed ${MAX_TAG_UTF8_BYTES} UTF-8 bytes.`);
  }
  return normalized;
}

export function normalizeTags(values: readonly string[]): string[] {
  if (!Array.isArray(values)) throw new Error("Tags must be an array of text values.");
  const result: string[] = [];
  const identities = new Set<string>();
  for (const value of values) {
    const normalized = normalizeTag(value);
    if (!normalized) continue;
    const identity = tagIdentity(normalized);
    if (identities.has(identity)) continue;
    identities.add(identity);
    result.push(normalized);
  }
  if (result.length > MAX_TAGS_PER_NODE) {
    throw new Error(`A node cannot have more than ${MAX_TAGS_PER_NODE} tags.`);
  }
  return result;
}

export function hasTag(tags: readonly string[], candidate: string): boolean {
  const identity = tagIdentity(normalizeTag(candidate));
  return identity !== "" && tags.some((tag) => tagIdentity(tag) === identity);
}

export function collectActiveTags(nodes: readonly DocumentNode[]): string[] {
  const values: string[] = [];
  const identities = new Set<string>();
  for (const node of nodes) {
    if (node.deletedAt !== null) continue;
    for (const value of node.tags) {
      const normalized = normalizeTag(value);
      if (!normalized) continue;
      const identity = tagIdentity(normalized);
      if (identities.has(identity)) continue;
      identities.add(identity);
      values.push(normalized);
    }
  }
  return values.sort((left, right) => (
    left.toLowerCase() < right.toLowerCase() ? -1
      : left.toLowerCase() > right.toLowerCase() ? 1
        : left < right ? -1 : left > right ? 1 : 0
  ));
}
