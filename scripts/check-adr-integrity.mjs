import { execFileSync } from "node:child_process";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const decisionsDirectory = "docs/decisions";
const decisionIndexPath = `${decisionsDirectory}/README.md`;
const adrPathPattern = /^docs\/decisions\/\d{4}-[^/]+\.md$/;

function splitHistoricalBody(path, text) {
  const match = /^##(?:\s|$)/m.exec(text);
  if (match === null || match.index === undefined) {
    throw new Error(
      `${path} has no level-two heading delimiting its immutable body.`,
    );
  }

  return {
    header: text.slice(0, match.index),
    body: text.slice(match.index),
  };
}

function metadataValue(header, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^\\*\\*${escapedName}:\\*\\*\\s*(.+)$`, "m").exec(
    header,
  );
  return match?.[1]?.trim();
}

function markdownLinkTargets(text) {
  return [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1]?.split("#", 1)[0]?.trim())
    .filter((target) => target !== undefined && target.length > 0);
}

function relativeMarkdownLinks(text) {
  return markdownLinkTargets(text).filter(
    (target) => !/^[a-z][a-z\d+.-]*:/i.test(target),
  );
}

function supersedingAdrLinks(path, supersededBy, headPaths) {
  const targets = markdownLinkTargets(supersededBy);
  const links = targets.map((target) => resolveRepositoryLink(path, target));
  if (
    links.length === 0 ||
    links.some(
      (link) =>
        link === path || !adrPathPattern.test(link) || !headPaths.has(link),
    )
  ) {
    return undefined;
  }
  return links;
}

function resolveRepositoryLink(sourcePath, target) {
  return posix.normalize(posix.join(posix.dirname(sourcePath), target));
}

function parseDecisionIndex(text) {
  const entries = new Map();
  const rowPattern =
    /^\|\s*\[`([^`]+\.md)`\]\(([^)]+)\)\s*\|\s*([^|]+?)\s*\|/gm;

  for (const match of text.matchAll(rowPattern)) {
    const fileName = match[1];
    const target = match[2];
    const status = match[3]?.trim();
    if (
      fileName !== undefined &&
      target !== undefined &&
      status !== undefined
    ) {
      entries.set(fileName, { target, status });
    }
  }

  return entries;
}

function lifecycleClass(status) {
  if (/\bsuperseded in part\b/i.test(status)) {
    return "superseded-in-part";
  }
  if (/\bsuperseded\b/i.test(status)) {
    return "superseded";
  }
  if (/\baccepted\b/i.test(status)) {
    return "accepted";
  }
  return undefined;
}

function firstDifferentLine(left, right) {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const count = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < count; index += 1) {
    if (leftLines[index] !== rightLines[index]) {
      return index + 1;
    }
  }
  return 1;
}

export function checkAdrIntegritySnapshot({ baseFiles, headFiles, headPaths }) {
  const failures = [];
  const baseAdrPaths = [...baseFiles.keys()].filter((path) =>
    adrPathPattern.test(path),
  );
  const headAdrPaths = [...headFiles.keys()].filter((path) =>
    adrPathPattern.test(path),
  );

  for (const path of baseAdrPaths) {
    const baseText = baseFiles.get(path);
    const headText = headFiles.get(path);
    if (headText === undefined) {
      failures.push({
        path,
        message: "Existing ADRs cannot be deleted or renamed.",
      });
      continue;
    }

    try {
      const baseBody = splitHistoricalBody(path, baseText).body;
      const headBody = splitHistoricalBody(path, headText).body;
      if (baseBody !== headBody) {
        failures.push({
          path,
          message: `Immutable ADR body changed near body line ${firstDifferentLine(baseBody, headBody)}. Record later decisions through header metadata and a new ADR.`,
        });
      }
    } catch (error) {
      failures.push({ path, message: error.message });
    }
  }

  const statuses = new Map();
  const lifecyclesByPath = new Map();
  const replacementLinks = new Map();
  for (const path of headAdrPaths) {
    const text = headFiles.get(path);
    try {
      const { header } = splitHistoricalBody(path, text);
      const status = metadataValue(header, "Status");
      if (status === undefined) {
        failures.push({
          path,
          message: "ADR header must define **Status:** metadata.",
        });
        continue;
      }
      const lifecycle = lifecycleClass(status);
      if (lifecycle === undefined) {
        failures.push({
          path,
          message: `Unrecognized ADR lifecycle status ${JSON.stringify(status)}.`,
        });
        continue;
      }
      statuses.set(posix.basename(path), { lifecycle, status });
      lifecyclesByPath.set(path, lifecycle);

      const isSuperseded = /\bsuperseded\b/i.test(status);
      const supersededBy = metadataValue(header, "Superseded by");
      if (!isSuperseded && supersededBy !== undefined) {
        failures.push({
          path,
          message:
            "Only a superseded ADR can define **Superseded by:** metadata.",
        });
      } else if (isSuperseded && supersededBy === undefined) {
        failures.push({
          path,
          message: "A superseded ADR must define **Superseded by:** metadata.",
        });
      } else if (isSuperseded) {
        const links = supersedingAdrLinks(path, supersededBy, headPaths);
        if (links === undefined) {
          failures.push({
            path,
            message:
              "A superseded ADR must link only to other existing replacement ADRs in **Superseded by:** metadata.",
          });
        } else {
          replacementLinks.set(path, links);
        }
      }
      if (/\bsuperseded in part\b/i.test(status)) {
        const supersededScope = metadataValue(header, "Superseded scope");
        if (supersededScope === undefined) {
          failures.push({
            path,
            message:
              "A partly superseded ADR must define **Superseded scope:** metadata.",
          });
        }
      }

      for (const target of relativeMarkdownLinks(header)) {
        const resolvedTarget = resolveRepositoryLink(path, target);
        if (!headPaths.has(resolvedTarget)) {
          failures.push({
            path,
            message: `Mutable ADR header links to missing path ${resolvedTarget}.`,
          });
        }
      }
    } catch (error) {
      failures.push({ path, message: error.message });
    }
  }

  for (const [path, links] of replacementLinks) {
    const pending = [...links];
    const visited = new Set([path]);
    let hasInvalidPath = false;
    while (pending.length > 0) {
      const replacement = pending.pop();
      if (
        replacement === undefined ||
        lifecyclesByPath.get(replacement) === "accepted"
      ) {
        continue;
      }
      if (visited.has(replacement)) {
        hasInvalidPath = true;
        break;
      }
      visited.add(replacement);
      const nextLinks = replacementLinks.get(replacement);
      if (nextLinks === undefined) {
        continue;
      }
      pending.push(...nextLinks);
    }
    if (hasInvalidPath) {
      failures.push({
        path,
        message:
          "Supersession links must lead to an accepted ADR without a cycle.",
      });
    }
  }

  const indexText = headFiles.get(decisionIndexPath);
  if (indexText === undefined) {
    failures.push({
      path: decisionIndexPath,
      message: "The ADR index is required.",
    });
    return failures;
  }

  const indexEntries = parseDecisionIndex(indexText);
  for (const [fileName, metadata] of statuses) {
    const entry = indexEntries.get(fileName);
    if (entry === undefined) {
      failures.push({
        path: decisionIndexPath,
        message: `${fileName} is missing from the ADR index.`,
      });
      continue;
    }
    const indexLifecycle = lifecycleClass(entry.status);
    if (indexLifecycle === undefined) {
      failures.push({
        path: decisionIndexPath,
        message: `${fileName} has unrecognized index lifecycle status ${JSON.stringify(entry.status)}.`,
      });
    } else if (indexLifecycle !== metadata.lifecycle) {
      failures.push({
        path: decisionIndexPath,
        message: `${fileName} lifecycle is ${JSON.stringify(metadata.lifecycle)} in the ADR and ${JSON.stringify(indexLifecycle)} in the index.`,
      });
    }
    const resolvedTarget = resolveRepositoryLink(
      decisionIndexPath,
      entry.target,
    );
    if (!headPaths.has(resolvedTarget)) {
      failures.push({
        path: decisionIndexPath,
        message: `Index entry for ${fileName} links to missing path ${resolvedTarget}.`,
      });
    }
  }

  for (const fileName of indexEntries.keys()) {
    if (!statuses.has(fileName)) {
      failures.push({
        path: decisionIndexPath,
        message: `Index entry ${fileName} does not name an ADR in ${decisionsDirectory}.`,
      });
    }
  }

  return failures;
}

function gitOutput(arguments_) {
  return execFileSync("git", arguments_, { encoding: "utf8" });
}

function resolveCommit(reference) {
  return gitOutput(["rev-parse", "--verify", `${reference}^{commit}`]).trim();
}

function listPaths(reference) {
  return gitOutput(["ls-tree", "-r", "--name-only", reference])
    .split(/\r?\n/)
    .filter((path) => path.length > 0);
}

function loadDecisionFiles(reference, paths) {
  const files = new Map();
  for (const path of paths) {
    if (path === decisionIndexPath || adrPathPattern.test(path)) {
      files.set(path, gitOutput(["show", `${reference}:${path}`]));
    }
  }
  return files;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function main() {
  const baseArgument = argumentValue("--base-ref");
  const headArgument = argumentValue("--head-ref") ?? "HEAD";
  if (baseArgument === undefined) {
    console.error(
      "Usage: npm run adr:check -- --base-ref <commit> [--head-ref <commit>]",
    );
    process.exitCode = 2;
    return;
  }

  const baseReference = resolveCommit(baseArgument);
  const headReference = resolveCommit(headArgument);
  const basePaths = listPaths(baseReference);
  const headPaths = listPaths(headReference);
  const failures = checkAdrIntegritySnapshot({
    baseFiles: loadDecisionFiles(baseReference, basePaths),
    headFiles: loadDecisionFiles(headReference, headPaths),
    headPaths: new Set(headPaths),
  });

  if (failures.length === 0) {
    console.log(
      `ADR integrity passed for ${baseReference.slice(0, 12)}..${headReference.slice(0, 12)}.`,
    );
    return;
  }

  for (const failure of failures) {
    if (process.env.GITHUB_ACTIONS === "true") {
      console.error(`::error file=${failure.path}::${failure.message}`);
    } else {
      console.error(`${failure.path}: ${failure.message}`);
    }
  }
  process.exitCode = 1;
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  fileURLToPath(import.meta.url) === resolve(invokedPath)
) {
  main();
}
