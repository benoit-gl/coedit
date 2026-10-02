import { describe, expect, it } from "vitest";

import { markdownSemanticsEqual } from "./markdown-semantics.mjs";

describe("Markdown semantics", () => {
  it("accepts soft prose line reflow", () => {
    expect(
      markdownSemanticsEqual(
        "A historical sentence has the same presentation after reflow.\n",
        "A historical sentence has the same\npresentation after reflow.\n",
      ),
    ).toBe(true);
  });

  it("rejects a hard-break change", () => {
    expect(
      markdownSemanticsEqual(
        "First historical line.\nSecond historical line.\n",
        "First historical line.  \nSecond historical line.\n",
      ),
    ).toBe(false);
  });

  it("rejects code and link-target changes", () => {
    expect(markdownSemanticsEqual("`first value`\n", "`second value`\n")).toBe(
      false,
    );
    expect(
      markdownSemanticsEqual(
        "[Historical source](https://example.com/one)\n",
        "[Historical source](https://example.com/two)\n",
      ),
    ).toBe(false);
  });
});
