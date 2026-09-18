import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function normalizedHeading(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/<[^>]+>/gu, " ")
    .replace(/[`*_~]/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function markdownHeadings(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const headings = [];
  let fence;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1] ?? "";
      if (fence === undefined) {
        fence = { character: marker[0], length: marker.length };
      } else if (
        marker[0] === fence.character &&
        marker.length >= fence.length
      ) {
        fence = undefined;
      }
      continue;
    }
    if (fence !== undefined) {
      continue;
    }

    const atxMatch = /^ {0,3}#{1,6}(?:[ \t]+|$)(.*)$/u.exec(line);
    if (atxMatch !== null) {
      const text = (atxMatch[1] ?? "").replace(/[ \t]+#+[ \t]*$/u, "");
      headings.push({ line: index + 1, text });
      continue;
    }

    if (
      index > 0 &&
      /^ {0,3}(?:=+|-+)[ \t]*$/u.test(line) &&
      (lines[index - 1] ?? "").trim().length > 0
    ) {
      headings.push({ line: index, text: lines[index - 1] ?? "" });
    }
  }

  return headings;
}

export function findProhibitedPrDescriptionSections(markdown) {
  const failures = [];
  for (const heading of markdownHeadings(markdown)) {
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
