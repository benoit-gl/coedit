import { describe, expect, it, vi } from "vitest";
import { MemoryDocumentGateway } from "./memoryGateway";
import { safeFilenameStem } from "./fileDialogs";
import type { Contributor, RecoveryExport } from "../domain/types";

const contributor: Contributor = {
  id: "author",
  displayName: "Author",
  kind: "human",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const context = { contributorId: "author", sessionId: null, groupId: null, message: null };

describe("memory document gateway", () => {
  it("attributes, hashes, and restores changes without deleting history", async () => {
    const gateway = new MemoryDocumentGateway();
    await gateway.createDocument("Report", contributor);
    await gateway.applyOperation({ type: "createNode", node: { id: "intro", tags: ["section"], title: "Introduction" } }, context);
    await gateway.applyOperation({ type: "updateNode", nodeId: "intro", changes: { summary: "Context" } }, context);

    const restored = await gateway.restoreRevision(1, context);
    const history = await gateway.listContributions();
    expect(restored.nodes[0].summary).toBe("");
    expect(restored.document.revision).toBe(3);
    expect(history.items).toHaveLength(4);
    expect(history.hasMore).toBe(false);
    expect(history.nextBeforeRevision).toBeNull();
    expect(history.items.every((item) => item.resultingHash.length > 0)).toBe(true);
  });

  it("filters before paginating and exposes an exclusive revision cursor", async () => {
    const gateway = new MemoryDocumentGateway();
    await gateway.createDocument("Report", contributor);
    await gateway.applyOperation(
      { type: "createNode", node: { id: "intro", tags: ["section"], title: "Introduction" } },
      { ...context, message: "Add introduction" },
    );
    await gateway.applyOperation(
      { type: "updateNode", nodeId: "intro", changes: { summary: "Alpha context" } },
      { ...context, message: "Alpha revision" },
    );
    await gateway.applyOperation(
      { type: "createNode", node: { id: "ending", tags: ["section"], title: "Ending" } },
      { ...context, message: "Add ending" },
    );
    await gateway.applyOperation(
      { type: "updateNode", nodeId: "ending", changes: { summary: "Alpha conclusion" } },
      { ...context, message: "Alpha revision" },
    );

    const first = await gateway.listContributions({ limit: 2 });
    expect(first.items.map((item) => item.revision)).toEqual([4, 3]);
    expect(first).toMatchObject({ hasMore: true, nextBeforeRevision: 3 });

    const second = await gateway.listContributions({ beforeRevision: first.nextBeforeRevision!, limit: 2 });
    expect(second.items.map((item) => item.revision)).toEqual([2, 1]);
    expect(second).toMatchObject({ hasMore: true, nextBeforeRevision: 1 });

    const last = await gateway.listContributions({ beforeRevision: second.nextBeforeRevision!, limit: 2 });
    expect(last.items.map((item) => item.revision)).toEqual([0]);
    expect(last).toMatchObject({ hasMore: false, nextBeforeRevision: null });

    const filtered = await gateway.listContributions({ search: "ALPHA", nodeId: "intro", limit: 1 });
    expect(filtered.items.map((item) => item.revision)).toEqual([2]);
    expect(filtered.hasMore).toBe(false);

    const unknownContributor = await gateway.listContributions({ contributorId: "unknown" });
    expect(unknownContributor.items).toEqual([]);
  });

  it("exports a portable recovery envelope with complete newest-first history", async () => {
    const gateway = new MemoryDocumentGateway();
    await gateway.createDocument("Résumé / Final?", contributor);
    await gateway.applyOperation(
      { type: "createNode", node: { id: "intro", tags: ["section"], title: "Introduction" } },
      context,
    );

    let downloaded: Blob | undefined;
    let downloadedName = "";
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        downloaded = blob;
        return "blob:coedit-test";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadedName = this.download;
    });

    try {
      const result = await gateway.exportDocument("json");
      expect(result.path).toBe("resume-final.json");
      expect(downloadedName).toBe("resume-final.json");
      expect(downloaded).toBeDefined();
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(downloaded!);
      });
      const recovery = JSON.parse(text) as RecoveryExport & Record<string, unknown>;
      expect(recovery.format).toBe("coedit-recovery");
      expect(recovery.exportVersion).toBe(2);
      expect(recovery.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(recovery.hashAlgorithm).toBe("coedit-document-state-v1");
      expect(recovery.stateHash).toMatch(/^[0-9a-f]{64}$/);
      expect(recovery.history).toEqual({ order: "revision-descending", complete: true });
      expect(recovery.state.document.title).toBe("Résumé / Final?");
      expect(recovery.contributions.map((item) => item.revision)).toEqual([1, 0]);
      expect(recovery.state).not.toHaveProperty("path");
      expect(recovery.state).not.toHaveProperty("readOnly");
      expect(recovery.state).not.toHaveProperty("recoveryWarning");
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:coedit-test");
    } finally {
      click.mockRestore();
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectUrl });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectUrl });
    }
  });

  it("detaches inputs, validates metadata, and sanitizes direct rich-text operations", async () => {
    const gateway = new MemoryDocumentGateway();
    const mutableContributor = { ...contributor };
    await gateway.createDocument("Report", mutableContributor);
    mutableContributor.displayName = "Mutated outside";

    const metadata = { nested: { label: "original" } };
    const operation = {
      type: "createNode" as const,
      node: {
        id: "intro",
        tags: ["section"],
        title: "Introduction",
        contentHtml: '<p onclick="evil()">Safe<script>evil()</script></p>',
        metadata,
      },
    };
    const view = await gateway.applyOperation(operation, context);
    metadata.nested.label = "mutated outside";
    operation.node.title = "Mutated outside";

    expect(view.contributors[0].displayName).toBe("Author");
    expect(view.nodes[0].contentHtml).toBe("<p>Safe</p>");
    const exportView = await gateway.restoreRevision(1, context);
    expect(exportView.nodes[0].title).toBe("Introduction");
    expect(exportView.nodes[0].metadata).toEqual({ nested: { label: "original" } });

    const invalidMetadata = Object.create(null) as Record<string, number>;
    invalidMetadata.value = Number.NaN;
    await expect(gateway.applyOperation({
      type: "updateNode",
      nodeId: "intro",
      changes: { metadata: invalidMetadata },
    }, context)).rejects.toThrow("non-finite number");
  });
});

describe("portable filenames", () => {
  it("normalizes unsafe, reserved, empty, and overly long document titles", () => {
    expect(safeFilenameStem(" Résumé / Final? ")).toBe("resume-final");
    expect(safeFilenameStem("CON")).toBe("document");
    expect(safeFilenameStem("lpt9")).toBe("document");
    expect(safeFilenameStem("... ")).toBe("document");
    expect(safeFilenameStem("文書")).toBe("文書");
    expect(safeFilenameStem("A".repeat(140))).toHaveLength(100);
    expect(Array.from(safeFilenameStem("𐐀".repeat(140)))).toHaveLength(100);
  });
});
