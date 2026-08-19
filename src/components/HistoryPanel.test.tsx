import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Contribution } from "../domain/types";
import { HistoryPanel } from "./HistoryPanel";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function contribution(revision: number): Contribution {
  return {
    id: `contribution-${revision}`,
    revision,
    contributorId: "author",
    contributorName: "Author",
    contributorKind: "human",
    sessionId: null,
    groupId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    operationType: "updateNode",
    affectedNodeIds: ["node"],
    payload: {},
    baseRevision: revision - 1,
    resultingHash: `${revision}`.repeat(64),
    message: `Revision ${revision}`,
  };
}

async function renderPanel(overrides: Partial<Parameters<typeof HistoryPanel>[0]> = {}) {
  const props: Parameters<typeof HistoryPanel>[0] = {
    contributions: [contribution(3), contribution(2), contribution(1), contribution(0)],
    query: {},
    selectedNodeId: "node",
    currentRevision: 3,
    viewedRevision: 1,
    loadingRevision: 2,
    revisionViewingAvailable: true,
    viewDisabled: false,
    restoreDisabled: false,
    hasMore: false,
    loading: false,
    stale: false,
    loadError: null,
    onQueryChange: vi.fn(),
    onLoadOlder: vi.fn(),
    onView: vi.fn(),
    onRestore: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<HistoryPanel {...props} />));
  return props;
}

function row(revision: number): HTMLLIElement {
  const match = [...container!.querySelectorAll<HTMLLIElement>(".history-list li")]
    .find((item) => item.querySelector(".history-revision")?.textContent === `r${revision}`);
  if (!match) throw new Error(`Revision ${revision} row was not rendered.`);
  return match;
}

describe("HistoryPanel revision actions", () => {
  it("presents View as the primary action and identifies current, loading, and viewed revisions", async () => {
    const props = await renderPanel();

    expect(row(3).querySelector(".history-state")?.textContent).toBe("Current");
    expect(row(1).getAttribute("aria-current")).toBe("true");
    expect(row(1).querySelector(".history-state")?.textContent).toBe("Viewing");
    expect(row(2).querySelector("button")?.textContent).toBe("Loading…");
    expect(row(2).querySelector("button")?.disabled).toBe(true);
    expect(container!.textContent).not.toContain("Restore");

    await act(async () => row(0).querySelector<HTMLButtonElement>("button")!.click());
    expect(props.onView).toHaveBeenCalledWith(0);
  });

  it("retains row-level Restore when the host defers revision queries", async () => {
    const props = await renderPanel({
      revisionViewingAvailable: false,
      viewedRevision: null,
      loadingRevision: null,
    });

    expect(container!.textContent).not.toContain("View");
    expect(row(3).querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
    await act(async () => row(2).querySelector<HTMLButtonElement>("button")!.click());
    expect(props.onRestore).toHaveBeenCalledWith(2);
    expect(props.onView).not.toHaveBeenCalled();
  });
});
