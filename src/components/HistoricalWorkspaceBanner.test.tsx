import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoricalWorkspaceBanner } from "./HistoricalWorkspaceBanner";

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

describe("HistoricalWorkspaceBanner", () => {
  it("announces both revisions and exposes Back as the primary action", async () => {
    const onBack = vi.fn();
    const onRestore = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <HistoricalWorkspaceBanner
        viewedRevision={4}
        currentRevision={9}
        backDisabled={false}
        restoreDisabled={false}
        onBack={onBack}
        onRestore={onRestore}
      />,
    ));

    expect(container.querySelector('[aria-label="Historical revision"]')?.textContent)
      .toContain("Viewing revision 4Read only · current revision is 9");
    expect(container.querySelector('[role="status"]')?.textContent)
      .toBe("Viewing revision 4, read only. Current revision is 9.");
    const back = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Back to current")!;
    expect(back.classList.contains("primary")).toBe(true);
    await act(async () => back.click());
    expect(onBack).toHaveBeenCalledOnce();
    expect(onRestore).not.toHaveBeenCalled();
  });
});
