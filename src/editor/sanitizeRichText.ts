import DOMPurify from "dompurify";

export const RICH_TEXT_POLICY = "coedit-rich-text-v1" as const;
export const RICH_TEXT_ALLOWED_TAGS = [
  "p", "br", "strong", "em", "s", "code", "pre", "blockquote",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "a", "hr",
] as const;
export const RICH_TEXT_ALLOWED_ATTRIBUTES = ["href", "title"] as const;
export const RICH_TEXT_FORBIDDEN_CONTENTS = ["script", "style", "iframe", "object", "embed"] as const;

export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS],
    ALLOWED_ATTR: [...RICH_TEXT_ALLOWED_ATTRIBUTES],
    // These elements are opaque/executable containers; do not preserve their child text.
    FORBID_CONTENTS: [...RICH_TEXT_FORBIDDEN_CONTENTS],
  });
}
