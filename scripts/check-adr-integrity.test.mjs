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
| [`0001-example.md`](0001-example.md) | ${status} | Example |
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

  it("rejects duplicate singleton metadata", () => {
    const files = snapshot(
      adr("Accepted", "Historical decision."),
      adr("Accepted", "Historical decision.", "\n**Status:** Superseded\n"),
    );

    expect(checkAdrIntegritySnapshot(files)).toContainEqual({
      path: adrPath,
      message: "ADR header metadata **Status:** must appear at most once.",
    });
  });

  it("rejects duplicate ADR index rows", () => {
    const files = snapshot(
      adr("Accepted", "Historical decision."),
      adr("Accepted", "Historical decision."),
    );
    files.headFiles.set(
      indexPath,
      `${index("Accepted")}| [`0001-example.md`](0001-example.md) | Superseded | Duplicate |\n`,
    );

    expect(checkAdrIntegritySnapshot(files)).toContainEqual({
      path: indexPath,
      message: "0001-example.md appears more than once in the ADR index.",
    });
  });

  it("rejects an index row that links to a different existing file", () => {
    const files = snapshot(
      adr("Accepted", "Historical decision."),
      adr("Accepted", "Historical decision."),
    );
    files.headFiles.set(
      indexPath,
      index("Accepted").replace("(0001-example.md)", "(README.md)"),
    );

    expect(checkAdrIntegritySnapshot(files)).toContainEqual({
      path: indexPath,
      message:
        "Index entry for 0001-example.md must link to docs/decisions/0001-example.md.",
    });
  });

  it("rejects an empty partial-supersession scope", () => {
    const baseAdr = adr("Accepted", "Historical decision.");
    const headAdr = adr(
      "Superseded in part",
      "Historical decision.",
      "\n**Superseded by:** [ADR 0002](0002-replacement.md)\n\n**Superseded scope:**    \n",
    );
    const files = snapshot(baseAdr, headAdr, "Superseded in part");
    files.headPaths.add("docs/decisions/0002-replacement.md");

    expect(checkAdrIntegritySnapshot(files)).toContainEqual({
      path: adrPath,
      message:
        "A partly superseded ADR must define **Superseded scope:** metadata.",
    });
  });


  it.each([
    ["an HTML comment", "<!--\n**Status:** Accepted\n-->"],
    [
      "a fenced code block",
      "```markdown\n**Status:** Accepted\n```",
    ],
  ])(
    "does not treat metadata inside %s as ADR metadata",
    (_label, hiddenStatus) => {
      const baseAdr = adr("Accepted", "Historical decision.");
      const headAdr = `# ADR 0001: Example

${hiddenStatus}

## Context

Historical decision.
`;
      const files = snapshot(baseAdr, headAdr);

      expect(checkAdrIntegritySnapshot(files)).toContainEqual({
        path: adrPath,
        message: "ADR header must define **Status:** metadata.",
      });
    },
  );

  it.each([
    [
      "an HTML comment",
      "<!--\n| [`0001-example.md`](0001-example.md) | Accepted | Example |\n-->",
    ],
    [
      "a fenced code block",
      "```markdown\n| [`0001-example.md`](0001-example.md) | Accepted | Example |\n```",
    ],
  ])(
    "does not treat an ADR index row inside %s as an index entry",
    (_label, hiddenRow) => {
      const baseAdr = adr("Accepted", "Historical decision.");
      const headAdr = adr("Accepted", "Historical decision.");
      const files = snapshot(baseAdr, headAdr);
      files.headFiles.set(
        indexPath,
        `# Architecture decision records

## Index

${hiddenRow}
`,
      );

      expect(checkAdrIntegritySnapshot(files)).toContainEqual({
        path: indexPath,
        message: "0001-example.md is missing from the ADR index.",
      });
    },
  );

  it("ignores links that occur only inside non-Markdown header content", () => {
    const baseAdr = adr("Accepted", "Historical decision.");
    const headAdr = adr(
      "Accepted",
      "Historical decision.",
      "\n<!-- [missing](missing.md) -->\n\n`[also missing](also-missing.md)`\n",
    );
    const files = snapshot(baseAdr, headAdr);

    expect(checkAdrIntegritySnapshot(files)).toEqual([]);
  });

  it("rejects a negated lifecycle status", () => {
    const files = snapshot(
      adr("Accepted", "Historical decision."),
      adr("Not accepted", "Historical decision."),
      "Not accepted",
    );

    expect(checkAdrIntegritySnapshot(files)).toContainEqual({
      path: adrPath,
      message: 'Unrecognized ADR lifecycle status "Not accepted".',
    });
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

  it("rejects broken reference-style links in mutable ADR headers", () => {
    const baseAdr = adr("Accepted", "Historical decision.");
    const headAdr = adr(
      "Accepted",
      "Historical decision.",
      "\n**Related:** See [missing][target]\n\n[target]: missing.md\n",
    );
    const files = snapshot(baseAdr, headAdr);

    expect(checkAdrIntegritySnapshot(files)).toContainEqual({
      path: adrPath,
      message:
        "Mutable ADR header links to missing path docs/decisions/missing.md.",
    });
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
| [`0001-example.md`](0001-example.md) | Superseded | First example |
| [`0002-example.md`](0002-example.md) | Superseded | Second example |
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

  it("allows convergent supersession paths without treating them as cycles", () => {
    const fileNames = [
      "0001-a.md",
      "0002-b.md",
      "0003-c.md",
      "0004-d.md",
      "0005-e.md",
    ];
    const paths = fileNames.map((fileName) => `docs/decisions/${fileName}`);
    const graphAdr = (number, status, replacements = []) => {
      const links = replacements
        .map((fileName) => `[ADR ${fileName.slice(0, 4)}](${fileName})`)
        .join(" and ");
      const supersession =
        links.length === 0 ? "" : `\n**Superseded by:** ${links}\n`;
      return `# ADR ${number}: Graph node

**Status:** ${status}
${supersession}
## Context

Historical decision ${number}.
`;
    };
    const statuses = [
      ["Superseded", ["0002-b.md", "0003-c.md"]],
      ["Superseded", ["0004-d.md"]],
      ["Superseded", ["0004-d.md"]],
      ["Superseded", ["0005-e.md"]],
      ["Accepted", []],
    ];
    const baseFiles = new Map(
      paths.map((path, index) => [path, graphAdr(index + 1, "Accepted")]),
    );
    const headFiles = new Map(
      paths.map((path, index) => [
        path,
        graphAdr(index + 1, statuses[index][0], statuses[index][1]),
      ]),
    );
    const graphIndex = `# Architecture decision records

## Index

| ADR | Status | Subject |
| --- | --- | --- |
${fileNames
  .map(
    (fileName, index) =>
      `| [`${fileName}`](${fileName}) | ${statuses[index][0]} | Node |`,
  )
  .join("\n")}
`;
    headFiles.set(indexPath, graphIndex);

    expect(
      checkAdrIntegritySnapshot({
        baseFiles,
        headFiles,
        headPaths: new Set([...paths, indexPath]),
      }),
    ).toEqual([]);
  });
});
