import { describe, expect, it } from "vitest";
import fixture from "../../fixtures/protocol/document-hash-v1.json";
import type { DocumentView } from "./types";
import {
  DOCUMENT_HASH_ALGORITHM,
  canonicalDocumentJson,
  hashDocument,
  toDocumentState,
} from "./hash";
import { canonicalJson, cloneJson } from "./json";

const input = fixture.input as unknown as DocumentView;

describe("document hash contract", () => {
  it("matches the language-neutral canonicalization fixture", async () => {
    expect(fixture.algorithm).toBe(DOCUMENT_HASH_ALGORITHM);
    expect(canonicalDocumentJson(input)).toBe(fixture.canonicalJson);
    await expect(hashDocument(input)).resolves.toBe(fixture.sha256);
  });

  it("excludes host-only view fields and does not mutate collection order", async () => {
    const originalNodeOrder = input.nodes.map((node) => node.id);
    const otherHostView: DocumentView = {
      ...input,
      path: null,
      readOnly: false,
      recoveryWarning: null,
    };

    await expect(hashDocument(otherHostView)).resolves.toBe(fixture.sha256);
    expect(input.nodes.map((node) => node.id)).toEqual(originalNodeOrder);
    expect(toDocumentState(input)).not.toHaveProperty("path");
    expect(toDocumentState(input)).not.toHaveProperty("readOnly");
    expect(toDocumentState(input)).not.toHaveProperty("recoveryWarning");
  });

  it("orders Unicode and integer-like keys without locale or enumeration behavior", () => {
    for (const testCase of fixture.canonicalCases) {
      expect(canonicalJson(testCase.input), testCase.name).toBe(testCase.expected);
    }
  });

  it("rejects values that cannot be represented faithfully as JSON", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow("non-finite number");
    expect(() => canonicalJson({ value: undefined })).toThrow("not JSON-compatible");
    expect(() => canonicalJson({ value: new Date() })).toThrow("non-plain object");
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => cloneJson(circular)).toThrow("circular reference");
    expect(() => canonicalJson(new Array(1))).toThrow("sparse array element");
  });
});
