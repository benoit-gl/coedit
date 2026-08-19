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

function contribution(revision: number, overrides: Partial<Contribution> = {}): Contribution {
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
    ...overrides,
  };
}

function checkpoint(revision: number): Contribution {
  return contribution(revision, {
    groupId: "episode",
    operationType: "updateBody",
    message: "Writing contribution",
  });
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
    contributionGroupQueryAvailable: true,
    viewDisabled: false,
    restoreDisabled: false,
    hasMore: false,
    loading: false,
    stale: false,
    loadError: null,
    onQueryChange: vi.fn(),
    onLoadOlder: vi.fn(),
    onLoadContributionGroup: vi.fn().mockResolvedValue([]),
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
  const match = [...container!.querySelectorAll<HTMLLIElement>(".history-list > li")]
    .find((item) => item.querySelector(":scope > .history-revision")?.textContent === `r${revision}`);
  if (!match) throw new Error(`Revision ${revision} row was not rendered.`);
  return match;
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
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

  it("labels a partial group honestly and expands the exact standalone group", async () => {
    const loadGroup = vi.fn().mockResolvedValue([checkpoint(4), checkpoint(3), checkpoint(2)]);
    await renderPanel({
      contributions: [checkpoint(4), checkpoint(3)],
      currentRevision: 5,
      viewedRevision: null,
      loadingRevision: null,
      hasMore: true,
      onLoadContributionGroup: loadGroup,
    });

    expect(container!.textContent).toContain("2+ raw contributions loaded · 1 history rows");
    expect(container!.textContent).toContain("at least 2 safety checkpoints");
    expect(container!.textContent).toContain("Older checkpoints are not loaded.");

    const expand = [...container!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Expand");
    if (!expand) throw new Error("Expand button was not rendered.");
    await act(async () => { expand.click(); });
    await settle();

    expect(loadGroup).toHaveBeenCalledWith("episode");
    expect(container!.textContent).toContain("3 safety checkpoints");
    expect([...container!.querySelectorAll(".history-checkpoints .history-revision")].map((item) => item.textContent))
      .toEqual(["r4", "r3", "r2"]);
  });

  it("makes host-deferred full expansion explicit while retaining loaded checkpoints", async () => {
    await renderPanel({
      contributions: [checkpoint(4), checkpoint(3)],
      currentRevision: 5,
      viewedRevision: null,
      loadingRevision: null,
      revisionViewingAvailable: false,
      contributionGroupQueryAvailable: false,
      hasMore: true,
    });

    const expand = [...container!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Expand");
    if (!expand) throw new Error("Expand button was not rendered.");
    await act(async () => { expand.click(); });

    expect(container!.textContent).toContain(
      "Full group expansion is unavailable in this host; showing loaded checkpoints only.",
    );
    expect(container!.querySelectorAll(".history-checkpoints .history-revision")).toHaveLength(2);
  });
});
