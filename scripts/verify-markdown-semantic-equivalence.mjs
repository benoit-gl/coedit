import { execFileSync } from "node:child_process";

import { markdownSemanticsEqual } from "./markdown-semantics.mjs";

function git(arguments_) {
  return execFileSync("git", arguments_, { encoding: "utf8" });
}

function markdownChanges(baseRef, headRef) {
  const fields = git([
    "diff",
    "--name-status",
    "--diff-filter=ACMRDT",
    "-z",
    baseRef,
    headRef,
    "--",
    "*.md",
  ]).split("\0");
  if (fields.at(-1) === "") {
    fields.pop();
  }

  const changes = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index];
    const sourcePath = fields[index + 1];
    if (status === undefined || sourcePath === undefined) {
      throw new Error("Unexpected git diff --name-status output.");
    }
    index += 2;

    const kind = status[0];
    if (kind === "R" || kind === "C") {
      const destinationPath = fields[index];
      if (destinationPath === undefined) {
        throw new Error("Unexpected git diff --name-status output.");
      }
      index += 1;
      changes.push({ status, path: `${sourcePath} -> ${destinationPath}` });
    } else {
      changes.push({ status, path: sourcePath });
    }
  }
  return changes;
}

function structuralChangeMessage(change) {
  switch (change.status[0]) {
    case "A":
      return `${change.path}: Markdown file was added.`;
    case "C":
      return `${change.path}: Markdown file was copied.`;
    case "D":
      return `${change.path}: Markdown file was deleted.`;
    case "R":
      return `${change.path}: Markdown file was renamed.`;
    case "T":
      return `${change.path}: Markdown file changed Git object type.`;
    default:
      return `${change.path}: unsupported Markdown change status ${change.status}.`;
  }
}

const [baseRef, headRef] = process.argv.slice(2);
if (baseRef === undefined || headRef === undefined) {
  throw new Error(
    "Usage: npm run markdown:equivalence -- <base-ref> <head-ref>",
  );
}

const changes = markdownChanges(baseRef, headRef);
const failures = [];

for (const change of changes) {
  if (change.status[0] !== "M") {
    failures.push(structuralChangeMessage(change));
    continue;
  }

  const path = change.path;
  let baseText;
  let headText;
  try {
    baseText = git(["show", `${baseRef}:${path}`]);
    headText = git(["show", `${headRef}:${path}`]);
  } catch {
    failures.push(`${path}: Markdown file could not be read from both refs.`);
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
    `Markdown semantic equivalence passed for ${changes.length} files.`,
  );
}
