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

  it("rejects prohibited headings split by invisible format characters", () => {
    expect(
      findProhibitedPrDescriptionSections(
        "## Ver\u200bification\n\nTransient details.",
      ),
    ).toEqual([
      expect.objectContaining({
        line: 1,
        prohibitedSection: "verification",
      }),
    ]);
  });

  it("rejects raw HTML and character references in headings", () => {
    expect(
      findProhibitedPrDescriptionSections(
        "## Ver<!-- policy -->ification\n\nTransient details.",
      ),
    ).toEqual([
      expect.objectContaining({
        line: 1,
        prohibitedSection: "raw HTML",
      }),
    ]);
    expect(
      findProhibitedPrDescriptionSections(
        "<h2>Verification</h2>\n\nTransient details.",
      ),
    ).toEqual([
      expect.objectContaining({
        line: 1,
        prohibitedSection: "raw HTML",
      }),
    ]);
    expect(
      findProhibitedPrDescriptionSections(
        '<h2\nclass="section">Verification</h2>\n\nTransient details.',
      ),
    ).toEqual([
      expect.objectContaining({
        line: 1,
        prohibitedSection: "raw HTML",
      }),
    ]);
    expect(
      findProhibitedPrDescriptionSections(
        "## Ver&#105;fication\n\nTransient details.",
      ),
    ).toEqual([
      expect.objectContaining({
        line: 1,
        prohibitedSection: "HTML character reference",
      }),
    ]);
    for (const heading of [
      "## <!DOCTYPE html> Summary",
      "## <?processing instruction?> Summary",
      "## <![CDATA[Summary]]>",
      "## Summary <br/>",
    ]) {
      expect(findProhibitedPrDescriptionSections(heading)).toEqual([
        expect.objectContaining({
          line: 1,
          prohibitedSection: "raw HTML",
        }),
      ]);
    }
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

  it("does not let an invalid backtick fence hide a prohibited heading", () => {
    expect(
      findProhibitedPrDescriptionSections("```bad```\n## Testing\n"),
    ).toEqual([
      expect.objectContaining({
        line: 2,
        prohibitedSection: "testing",
      }),
    ]);
  });

  it("requires a fence closer to contain only its marker", () => {
    const body = `\`\`\`markdown
## Testing
\`\`\` trailing text
## Verification
\`\`\`
`;

    expect(findProhibitedPrDescriptionSections(body)).toEqual([]);
  });

  it("does not treat block content followed by a thematic break as Setext", () => {
    for (const body of [
      "> Testing\n---\n",
      "- Testing\n---\n",
      "<!--\nTesting\n-->\n---\n",
    ]) {
      expect(findProhibitedPrDescriptionSections(body)).toEqual([]);
    }
  });

  it("finds prohibited headings nested in Markdown containers", () => {
    for (const body of ["> Testing\n> ---\n", "- ## Verification\n"]) {
      expect(findProhibitedPrDescriptionSections(body)).toEqual([
        expect.objectContaining({
          prohibitedSection: expect.stringMatching(/testing|verification/u),
        }),
      ]);
    }
  });
});
