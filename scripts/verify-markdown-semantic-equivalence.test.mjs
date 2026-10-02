import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { URL, fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const verifierPath = fileURLToPath(
  new URL("./verify-markdown-semantic-equivalence.mjs", import.meta.url),
);
const temporaryRepositories = [];

function git(cwd, arguments_, input) {
  return execFileSync("git", arguments_, { cwd, encoding: "utf8", input });
}

function createRepository() {
  const repository = mkdtempSync(
    join(tmpdir(), "coedit-markdown-equivalence-"),
  );
  temporaryRepositories.push(repository);
  git(repository, ["init", "--quiet"]);
  git(repository, ["config", "user.name", "Coedit Test"]);
  git(repository, ["config", "user.email", "coedit-test@example.invalid"]);
  git(repository, ["config", "diff.renames", "true"]);
  return repository;
}

function commitWorkingTree(repository, message) {
  git(repository, ["add", "--all"]);
  return commitIndex(repository, message);
}

function commitIndex(repository, message) {
  git(repository, ["commit", "--quiet", "-m", message]);
  return git(repository, ["rev-parse", "HEAD"]).trim();
}

function runVerifier(repository, baseRef, headRef) {
  return spawnSync(process.execPath, [verifierPath, baseRef, headRef], {
    cwd: repository,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) {
    rmSync(repository, { recursive: true, force: true });
  }
});

describe("Markdown semantic-equivalence verifier", () => {
  it("accepts a semantic-equivalent prose reflow", () => {
    const repository = createRepository();
    const path = join(repository, "doc.md");
    writeFileSync(
      path,
      "A historical sentence has the same presentation after reflow.\n",
    );
    const baseRef = commitWorkingTree(repository, "base");
    writeFileSync(
      path,
      "A historical sentence has the same\npresentation after reflow.\n",
    );
    const headRef = commitWorkingTree(repository, "reflow");

    const result = runVerifier(repository, baseRef, headRef);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Markdown semantic equivalence passed for 1 files.",
    );
  });

  it("rejects an added Markdown file", () => {
    const repository = createRepository();
    writeFileSync(join(repository, "baseline.txt"), "baseline\n");
    const baseRef = commitWorkingTree(repository, "base");
    writeFileSync(join(repository, "added.md"), "Added Markdown.\n");
    const headRef = commitWorkingTree(repository, "add Markdown");

    const result = runVerifier(repository, baseRef, headRef);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("added.md: Markdown file was added.");
  });

  it("rejects a deleted Markdown file", () => {
    const repository = createRepository();
    const path = join(repository, "doc.md");
    writeFileSync(path, "Historical Markdown.\n");
    const baseRef = commitWorkingTree(repository, "base");
    rmSync(path);
    const headRef = commitWorkingTree(repository, "delete Markdown");

    const result = runVerifier(repository, baseRef, headRef);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("doc.md: Markdown file was deleted.");
  });

  it("rejects a renamed Markdown file", () => {
    const repository = createRepository();
    writeFileSync(join(repository, "doc.md"), "Historical Markdown.\n");
    const baseRef = commitWorkingTree(repository, "base");
    git(repository, ["mv", "doc.md", "renamed.md"]);
    const headRef = commitIndex(repository, "rename Markdown");

    const result = runVerifier(repository, baseRef, headRef);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "doc.md -> renamed.md: Markdown file was renamed.",
    );
  });

  it("rejects a Markdown Git object type change", () => {
    const repository = createRepository();
    writeFileSync(join(repository, "doc.md"), "Historical Markdown.\n");
    const baseRef = commitWorkingTree(repository, "base");
    const targetBlob = git(
      repository,
      ["hash-object", "-w", "--stdin"],
      "target.md\n",
    ).trim();
    git(repository, [
      "update-index",
      "--cacheinfo",
      `120000,${targetBlob},doc.md`,
    ]);
    const headRef = commitIndex(repository, "change Markdown object type");

    const result = runVerifier(repository, baseRef, headRef);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "doc.md: Markdown file changed Git object type.",
    );
  });

  it("rejects a Markdown file mode change", () => {
    const repository = createRepository();
    writeFileSync(join(repository, "doc.md"), "Historical Markdown.\n");
    const baseRef = commitWorkingTree(repository, "base");
    const blob = git(repository, ["rev-parse", "HEAD:doc.md"]).trim();
    git(repository, ["update-index", "--cacheinfo", `100755,${blob},doc.md`]);
    const headRef = commitIndex(repository, "change Markdown file mode");

    const result = runVerifier(repository, baseRef, headRef);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("doc.md: Markdown file mode changed.");
  });
});
