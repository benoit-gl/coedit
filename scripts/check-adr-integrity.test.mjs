import { describe, expect, it } from "vitest";

import { checkAdrIntegritySnapshot } from "./check-adr-integrity.mjs";

const adrPath = "docs/decisions/0001-example.md";
const indexPath = "docs/decisions/README.md";

function adr(status, body, metadata = "") {
  return `# ADR 0001: Example

**Status:** ${status}
${metadata}
## Context

${body}
`;
}

function index(status) {
  return `# Architecture decision records

## Index

| ADR | Status | Subject |
| --- | --- | --- |
| [\`0001-example.md\`](0001-example.md) | ${status} | Example |
`;
}

function snapshot(baseAdr, headAdr, status = "Accepted") {
  const baseFiles = new Map([[adrPath, baseAdr]]);
  const headFiles = new Map([
    [adrPath, headAdr],
    [indexPath, index(status)],
  ]);
  return {
    baseFiles,
    headFiles,
    headPaths: new Set([adrPath, indexPath]),
  };
}

describe("ADR integrity", () => {
  it("allows maintenance metadata changes before the first subsection", () => {
    const baseAdr = adr("Accepted", "Historical decision.");
    const headAdr = adr(
      "Superseded in part",
      "Historical decision.",
      "\n**Superseded by:** [ADR 0002](0002-replacement.md)\n\n**Superseded scope:** Example scope\n",
    );
    const files = snapshot(baseAdr, headAdr, "Superseded in part");
    files.headPaths.add("docs/decisions/0002-replacement.md");

    expect(checkAdrIntegritySnapshot(files)).toEqual([]);
  });

  it("rejects changes beginning with the first subsection", () => {
    const files = snapshot(
      adr("Accepted", "Historical decision."),
      adr("Accepted", "Rewritten decision."),
    );

    expect(checkAdrIntegritySnapshot(files)).toContainEqual(
      expect.objectContaining({
        path: adrPath,
        message: expect.stringContaining("Immutable ADR body changed"),
      }),
    );
  });

  it("rejects deletion or rename of an existing ADR", () => {
    const files = snapshot(
      adr("Accepted", "Historical decision."),
      adr("Accepted", "Historical decision."),
    );
    files.headFiles.delete(adrPath);
    files.headPaths.delete(adrPath);

    expect(checkAdrIntegritySnapshot(files)).toContainEqual({
      path: adrPath,
      message: "Existing ADRs cannot be deleted or renamed.",
    });
  });

  it("requires supersession metadata and matching index status", () => {
    const files = snapshot(
      adr("Accepted", "Historical decision."),
      adr("Superseded in part", "Historical decision."),
      "Accepted",
    );

    const failures = checkAdrIntegritySnapshot(files);
    expect(failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "A superseded ADR must define **Superseded by:** metadata.",
        }),
        expect.objectContaining({
          message:
            "A partly superseded ADR must define **Superseded scope:** metadata.",
        }),
        expect.objectContaining({
          message: expect.stringContaining("lifecycle is"),
        }),
      ]),
    );
  });

  it("requires supersession metadata to link to a replacement ADR", () => {
    const files = snapshot(
      adr("Accepted", "Historical decision."),
      adr(
        "Superseded",
        "Historical decision.",
        "\n**Superseded by:** Replaced elsewhere\n",
      ),
      "Superseded",
    );

    expect(checkAdrIntegritySnapshot(files)).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("existing replacement ADR"),
      }),
    );
  });

  it("rejects supersession metadata on an accepted ADR", () => {
    const files = snapshot(
      adr("Accepted", "Historical decision."),
      adr(
        "Accepted",
        "Historical decision.",
        "\n**Superseded by:** [Decision index](README.md)\n",
      ),
    );

    expect(checkAdrIntegritySnapshot(files)).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("Only a superseded ADR"),
      }),
    );
  });

  it("allows the index to elaborate on the same lifecycle class", () => {
    const baseAdr = adr("Accepted", "Historical decision.");
    const headAdr = adr(
      "Superseded in part",
      "Historical decision.",
      "\n**Superseded by:** [ADR 0002](0002-replacement.md)\n\n**Superseded scope:** Example scope\n",
    );
    const files = snapshot(baseAdr, headAdr, "Superseded in part by ADR 0002");
    files.headPaths.add("docs/decisions/0002-replacement.md");

    expect(checkAdrIntegritySnapshot(files)).toEqual([]);
  });

  it("ignores obsolete links inside immutable historical bodies", () => {
    const historicalBody = "Historical [authority](deleted-authority.md).";
    const files = snapshot(
      adr("Accepted", historicalBody),
      adr("Accepted", historicalBody),
    );

    expect(checkAdrIntegritySnapshot(files)).toEqual([]);
  });

  it("rejects broken links in mutable ADR headers", () => {
    const baseAdr = adr("Accepted", "Historical decision.");
    const headAdr = adr(
      "Superseded",
      "Historical decision.",
      "\n**Superseded by:** [ADR 0002](missing.md)\n",
    );
    const files = snapshot(baseAdr, headAdr, "Superseded");

    expect(checkAdrIntegritySnapshot(files)).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("links to missing path"),
      }),
    );
  });

  it("rejects a supersession link that does not target an ADR", () => {
    const baseAdr = adr("Accepted", "Historical decision.");
    const headAdr = adr(
      "Superseded",
      "Historical decision.",
      "\n**Superseded by:** [Decision index](README.md)\n",
    );
    const files = snapshot(baseAdr, headAdr, "Superseded");

    expect(checkAdrIntegritySnapshot(files)).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("existing replacement ADR"),
      }),
    );
  });

  it("rejects an external link in supersession metadata", () => {
    const replacementPath = "docs/decisions/0002-replacement.md";
    const baseAdr = adr("Accepted", "Historical decision.");
    const headAdr = adr(
      "Superseded",
      "Historical decision.",
      "\n**Superseded by:** [ADR 0002](0002-replacement.md) and [external](https://example.com)\n",
    );
    const files = snapshot(baseAdr, headAdr, "Superseded");
    files.headPaths.add(replacementPath);

    expect(checkAdrIntegritySnapshot(files)).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("other existing replacement ADRs"),
      }),
    );
  });

  it("rejects a self-referential supersession link", () => {
    const baseAdr = adr("Accepted", "Historical decision.");
    const headAdr = adr(
      "Superseded",
      "Historical decision.",
      "\n**Superseded by:** [This ADR](0001-example.md)\n",
    );
    const files = snapshot(baseAdr, headAdr, "Superseded");

    expect(checkAdrIntegritySnapshot(files)).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("other existing replacement ADRs"),
      }),
    );
  });

  it("rejects a cyclic supersession path", () => {
    const secondAdrPath = "docs/decisions/0002-example.md";
    const firstBase = adr("Accepted", "First historical decision.");
    const secondBase = `# ADR 0002: Example

**Status:** Accepted
## Context

Second historical decision.
`;
    const firstHead = adr(
      "Superseded",
      "First historical decision.",
      "\n**Superseded by:** [ADR 0002](0002-example.md)\n",
    );
    const secondHead = `# ADR 0002: Example

**Status:** Superseded

**Superseded by:** [ADR 0001](0001-example.md)
## Context

Second historical decision.
`;
    const cycleIndex = `# Architecture decision records

## Index

| ADR | Status | Subject |
| --- | --- | --- |
| [\`0001-example.md\`](0001-example.md) | Superseded | First example |
| [\`0002-example.md\`](0002-example.md) | Superseded | Second example |
`;
    const files = {
      baseFiles: new Map([
        [adrPath, firstBase],
        [secondAdrPath, secondBase],
      ]),
      headFiles: new Map([
        [adrPath, firstHead],
        [secondAdrPath, secondHead],
        [indexPath, cycleIndex],
      ]),
      headPaths: new Set([adrPath, secondAdrPath, indexPath]),
    };

    expect(checkAdrIntegritySnapshot(files)).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("without a cycle"),
      }),
    );
  });
});
