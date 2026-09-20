import { execFileSync } from "node:child_process";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";

const decisionsDirectory = "docs/decisions";
const decisionIndexPath = `${decisionsDirectory}/README.md`;
const adrPathPattern = /^docs\/decisions\/\d{4}-[^/]+\.md$/;

function sourceForNode(text, node) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) {
    throw new Error("Markdown parser did not provide source positions.");
  }
  return text.slice(start, end);
}

function nodeText(node) {
  if (node.type === "image") {
    return node.alt ?? "";
  }
  if (typeof node.value === "string") {
    return node.value;
  }
  return (node.children ?? []).map((child) => nodeText(child)).join("");
}

function splitHistoricalBody(path, text) {
  const tree = fromMarkdown(text);
  const heading = tree.children.find(
    (node) => node.type === "heading" && node.depth === 2,
  );
  const offset = heading?.position?.start.offset;
  if (offset === undefined) {
    throw new Error(
      `${path} has no level-two heading delimiting its immutable body.`,
    );
  }

  return {
    header: text.slice(0, offset),
    body: text.slice(offset),
  };
}

function metadataValue(header, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^\\*\\*${escapedName}:\\*\\*\\s*(.+)$`,
    "gm",
  );
  const matches = [];

  for (const node of fromMarkdown(header).children) {
    if (node.type !== "paragraph") {
      continue;
    }
    for (const match of sourceForNode(header, node).matchAll(pattern)) {
      matches.push(match[1]?.trim());
    }
  }

  if (matches.length > 1) {
    throw new Error(
      `ADR header metadata **${name}:** must appear at most once.`,
    );
  }
  const value = matches[0];
  return value === "" ? undefined : value;
}

function definitionSources(text) {
  return fromMarkdown(text).children
    .filter((node) => node.type === "definition")
    .map((node) => sourceForNode(text, node));
}

function markdownLinkTargets(text, referenceText = text) {
  const references =
    referenceText === text ? [] : definitionSources(referenceText);
  const markdown =
    references.length === 0 ? text : `${text}\\n\\n${references.join("\\n")}`;
  const tree = fromMarkdown(markdown);
  const definitions = new Map();
  const targets = [];

  function collectDefinitions(node) {
    if (node.type === "definition") {
      definitions.set(node.identifier, node.url);
    }
    for (const child of node.children ?? []) {
      collectDefinitions(child);
    }
  }

  function collectTargets(node) {
    if (node.type === "link") {
      targets.push(node.url);
    } else if (node.type === "linkReference") {
      const target = definitions.get(node.identifier);
      if (target !== undefined) {
        targets.push(target);
      }
    }
    for (const child of node.children ?? []) {
      collectTargets(child);
    }
  }

  collectDefinitions(tree);
  collectTargets(tree);
  return targets
    .map((target) => target.split("#", 1)[0]?.trim())
    .filter((target) => target !== undefined && target.length > 0);
}

function relativeMarkdownLinks(text) {
  return markdownLinkTargets(text).filter(
    (target) => !/^[a-z][a-z\d+.-]*:/i.test(target),
  );
}

function supersedingAdrLinks(path, supersededBy, headPaths, header) {
  const targets = markdownLinkTargets(supersededBy, header);
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
  const duplicateFileNames = new Set();
  const rowPattern =
    /^\|\s*\\[`([^`]+\.md)`\\]\(([^)]+)\)\s*\|\s*([^|]+?)\s*\|/gm;
  const tree = fromMarkdown(text);
  let inIndex = false;

  for (const node of tree.children) {
    if (node.type === "heading") {
      if (node.depth === 2 && nodeText(node).trim() === "Index") {
        inIndex = true;
        continue;
      }
      if (inIndex && node.depth <= 2) {
        break;
      }
    }
    if (!inIndex || node.type !== "paragraph") {
      continue;
    }

    for (const match of sourceForNode(text, node).matchAll(rowPattern)) {
      const fileName = match[1];
      const target = match[2];
      const status = match[3]?.trim();
      if (
        fileName !== undefined &&
        target !== undefined &&
        status !== undefined
      ) {
        if (entries.has(fileName)) {
          duplicateFileNames.add(fileName);
        } else {
          entries.set(fileName, { target, status });
        }
      }
    }
  }

  return { duplicateFileNames, entries };
}

function lifecycleClass(status) {
  const normalized = status.trim();
  if (/^superseded in part\b/iu.test(normalized)) {
    return "superseded-in-part";
  }
  if (/^superseded\b/iu.test(normalized)) {
    return "superseded";
  }
  if (/^accepted\b/iu.test(normalized)) {
    return "accepted";
  }
  return undefined;
}

function hasSupersessionCycle(
  path,
  replacementLinks,
  lifecyclesByPath,
  active = new Set(),
  complete = new Set(),
) {
  if (lifecyclesByPath.get(path) === "accepted" || complete.has(path)) {
    return false;
  }
  if (active.has(path)) {
    return true;
  }
  active.add(path);
  for (const replacement of replacementLinks.get(path) ?? []) {
    if (
      hasSupersessionCycle(
        replacement,
        replacementLinks,
        lifecyclesByPath,
        active,
        complete,
      )
    ) {
      return true;
    }
  }
  active.delete(path);
  complete.add(path);
  return false;
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

      const isSuperseded = lifecycle !== "accepted";
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
        const links = supersedingAdrLinks(
          path,
          supersededBy,
          headPaths,
          header,
        );
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
      if (lifecycle === "superseded-in-part") {
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
    if (
      links.length > 0 &&
      hasSupersessionCycle(path, replacementLinks, lifecyclesByPath)
    ) {
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

  const { duplicateFileNames, entries: indexEntries } =
    parseDecisionIndex(indexText);
  for (const fileName of duplicateFileNames) {
    failures.push({
      path: decisionIndexPath,
      message: `${fileName} appears more than once in the ADR index.`,
    });
  }
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
    const expectedTarget = `${decisionsDirectory}/${fileName}`;
    if (resolvedTarget !== expectedTarget) {
      failures.push({
        path: decisionIndexPath,
        message: `Index entry for ${fileName} must link to ${expectedTarget}.`,
      });
    } else if (!headPaths.has(resolvedTarget)) {
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
