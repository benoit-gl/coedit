import { describe, expect, it } from "vitest";

import { findProhibitedPrDescriptionSections } from "./check-pr-description.mjs";

describe("pull-request description policy", () => {
  it("allows durable result and post-merge configuration sections", () => {
    const body = `## Summary

Add a required policy check and document its rationale.

## Repository setup after merge

Require the new status check on the protected branch.
`;

    expect(findProhibitedPrDescriptionSections(body)).toEqual([]);
  });

  it.each([
    "Verification",
    "Testing",
    "Test plan",
    "Tests",
    "Checks",
    "CI status",
    "Command output",
    "Review progress",
  ])("rejects a %s section", (heading) => {
    expect(
      findProhibitedPrDescriptionSections(
        `## ${heading}\n\nTransient details.`,
      ),
    ).toEqual([
      expect.objectContaining({
        line: 1,
        heading,
      }),
    ]);
  });

  it("rejects decorated and elaborated prohibited headings", () => {
    expect(
      findProhibitedPrDescriptionSections(
        "### **Local verification results** ###\n\nTransient details.",
      ),
    ).toEqual([
      expect.objectContaining({
        line: 1,
        prohibitedSection: "verification",
      }),
    ]);
  });

  it("rejects a prohibited setext heading", () => {
    expect(
      findProhibitedPrDescriptionSections(
        "Review progress\n---------------\n\nTransient details.",
      ),
    ).toEqual([
      expect.objectContaining({
        line: 1,
        heading: "Review progress",
      }),
    ]);
  });

  it("allows prose and fenced examples that mention verification", () => {
    const body = `## Summary

The change makes verification policy explicit.

\`\`\`markdown
## Verification
\`\`\`
`;

    expect(findProhibitedPrDescriptionSections(body)).toEqual([]);
  });
});
