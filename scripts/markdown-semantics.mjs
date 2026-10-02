import { fromMarkdown } from "mdast-util-from-markdown";

function canonicalNode(node) {
  const canonical = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "position") {
      continue;
    }
    if (key === "children") {
      canonical.children = value.map((child) => canonicalNode(child));
      continue;
    }
    if (key === "value" && node.type === "text") {
      canonical.value = value.replace(/[ \t]*\r?\n[ \t]*/gu, " ");
      continue;
    }
    canonical[key] = value;
  }
  return canonical;
}

export function markdownSemanticsEqual(left, right) {
  return (
    JSON.stringify(canonicalNode(fromMarkdown(left))) ===
    JSON.stringify(canonicalNode(fromMarkdown(right)))
  );
}
