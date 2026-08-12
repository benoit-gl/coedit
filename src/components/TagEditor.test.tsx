import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { DraftParticipant } from "../application/draftTransition";
import { TagEditor } from "./TagEditor";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function press(input: HTMLInputElement, key: string) {
  input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("TagEditor", () => {
  it("creates, reuses, and removes tags", async () => {
    function Harness() {
      const [tags, setTags] = useState(["Scene"]);
      return <TagEditor tags={tags} suggestions={["Draft", "Scene"]} disabled={false} onChange={setTags} registerDraftParticipant={() => () => undefined} />;
    }
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Harness />));

    const input = container.querySelector<HTMLInputElement>("[role=combobox]")!;
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="Show tag suggestions"]')!;
    await act(async () => toggle.click());
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    await act(async () => toggle.click());
    expect(container.querySelector('[role="listbox"]')).toBeNull();

    await act(async () => { input.focus(); setInputValue(input, "Character arc"); });
    await act(async () => press(input, "Enter"));
    expect([...container.querySelectorAll(".tag-chip span")].map((element) => element.textContent)).toEqual(["Scene", "Character arc"]);

    await act(async () => { input.focus(); setInputValue(input, "dra"); });
    await act(async () => press(input, "Enter"));
    expect([...container.querySelectorAll(".tag-chip span")].map((element) => element.textContent)).toEqual(["Scene", "Character arc", "Draft"]);

    const removeScene = container.querySelector<HTMLButtonElement>('button[aria-label="Remove tag Scene"]')!;
    await act(async () => removeScene.click());
    expect([...container.querySelectorAll(".tag-chip span")].map((element) => element.textContent)).toEqual(["Character arc", "Draft"]);
  });

  it("flushes pending free text through the draft participant", async () => {
    let participant: DraftParticipant | null = null;
    function Harness() {
      const [tags, setTags] = useState<string[]>([]);
      return (
        <TagEditor
          tags={tags}
          suggestions={[]}
          disabled={false}
          onChange={setTags}
          registerDraftParticipant={(next) => {
            participant = next;
            return () => { if (participant === next) participant = null; };
          }}
        />
      );
    }
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Harness />));
    const input = container.querySelector<HTMLInputElement>("[role=combobox]")!;
    await act(async () => setInputValue(input, "Research"));
    await act(async () => { await participant!.flush(); });
    expect(container.querySelector(".tag-chip span")?.textContent).toBe("Research");
    expect(input.value).toBe("");
  });
});
