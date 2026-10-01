import { execFileSync } from "node:child_process";

import { markdownSemanticsEqual } from "./markdown-semantics.mjs";

function git(arguments_) {
  return execFileSync("git", arguments_, { encoding: "utf8" });
}

const [baseRef, headRef] = process.argv.slice(2);
if (baseRef === undefined || headRef === undefined) {
  throw new Error(
    "Usage: npm run markdown:equivalence -- <base-ref> <head-ref>",
  );
}

const paths = git([
  "diff",
  "--name-only",
  "--diff-filter=ACMRD",
  baseRef,
  headRef,
  "--",
  "*.md",
])
  .split("\n")
  .filter((path) => path.length > 0);
const failures = [];

for (const path of paths) {
  let baseText;
  let headText;
  try {
    baseText = git(["show", `${baseRef}:${path}`]);
    headText = git(["show", `${headRef}:${path}`]);
  } catch {
    failures.push(`${path}: Markdown file was added, deleted, or renamed.`);
    continue;
  }
  if (!markdownSemanticsEqual(baseText, headText)) {
    failures.push(`${path}: parsed Markdown changed.`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Markdown semantic equivalence passed for ${paths.length} files.`,
  );
}
