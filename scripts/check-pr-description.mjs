import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";

const prohibitedSections = [
  { name: "verification", pattern: /\bverification\b/u },
  { name: "testing", pattern: /\btesting\b/u },
  { name: "test plan", pattern: /\btest\s+plans?\b/u },
  { name: "tests", pattern: /\btests?\b/u },
  { name: "checks", pattern: /\bchecks\b/u },
  { name: "CI status", pattern: /\bci\s+status\b/u },
  { name: "command output", pattern: /\bcommand\s+outputs?\b/u },
  { name: "review progress", pattern: /\breview\s+progress\b/u },
];
const rawHtmlPattern = /<!--|<[!?][^>]*>|<\/?[a-z][a-z\d-]*(?:\s[^>]*)?\/?>/iu;
const characterReferencePattern = /&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/iu;

function normalizedHeading(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<[^>]+>/gu, "")
    .replace(/[`*_~]/gu, "")
    .replace(/\p{Cf}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
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

function nodeContainsHtml(node) {
  return (
    node.type === "html" ||
    (node.children ?? []).some((child) => nodeContainsHtml(child))
  );
}

function markdownHeadings(markdown) {
  const headings = [];

  function visit(node) {
    if (node.type === "heading") {
      const start = node.position?.start;
      const end = node.position?.end;
      headings.push({
        line: start?.line ?? 1,
        source:
          start?.offset === undefined || end?.offset === undefined
            ? nodeText(node)
            : markdown.slice(start.offset, end.offset),
        text: nodeText(node),
        rawHtmlHeading: nodeContainsHtml(node),
      });
      return;
    }
    if (node.type === "html" && /^ {0,3}<h[1-6](?:\s|>|$)/iu.test(node.value)) {
      headings.push({
        line: node.position?.start.line ?? 1,
        source: node.value,
        text: node.value,
        rawHtmlHeading: true,
      });
      return;
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  }

  visit(fromMarkdown(markdown));
  return headings;
}

export function findProhibitedPrDescriptionSections(markdown) {
  const failures = [];
  for (const heading of markdownHeadings(markdown)) {
    if (
      heading.rawHtmlHeading ||
      rawHtmlPattern.test(heading.source ?? heading.text)
    ) {
      failures.push({
        line: heading.line,
        heading: heading.text.trim(),
        prohibitedSection: "raw HTML",
      });
      continue;
    }
    if (characterReferencePattern.test(heading.source ?? heading.text)) {
      failures.push({
        line: heading.line,
        heading: heading.text.trim(),
        prohibitedSection: "HTML character reference",
      });
      continue;
    }
    const normalized = normalizedHeading(heading.text);
    const rule = prohibitedSections.find(({ pattern }) =>
      pattern.test(normalized),
    );
    if (rule !== undefined) {
      failures.push({
        line: heading.line,
        heading: heading.text.trim(),
        prohibitedSection: rule.name,
      });
    }
  }
  return failures;
}

function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath === undefined) {
    console.error("GITHUB_EVENT_PATH is required.");
    process.exitCode = 2;
    return;
  }

  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const body = event.pull_request?.body;
  if (body !== null && body !== undefined && typeof body !== "string") {
    console.error("The pull-request body in GITHUB_EVENT_PATH is not text.");
    process.exitCode = 2;
    return;
  }

  const failures = findProhibitedPrDescriptionSections(body ?? "");
  if (failures.length === 0) {
    console.log("Pull-request description policy passed.");
    return;
  }

  for (const failure of failures) {
    console.error(
      `::error title=Pull-request description policy::Heading on body line ${failure.line} (` +
        `"${failure.heading}") is a prohibited ${failure.prohibitedSection} section. ` +
        "Rely on required checks and put transient evidence in PR comments.",
    );
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
