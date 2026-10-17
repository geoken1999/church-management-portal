import "server-only";

import sanitizeHtml from "sanitize-html";

// A lesson's reading text is stored as HTML typed into the editor, which anyone could post directly
// to the server, and it is later shown to students. This allowlist matches the editor's toolbar and
// nothing else, so a script or event handler can never reach a student's browser.
const ALLOWED_TAGS = ["p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "h2", "h3", "blockquote"];

export function sanitizeLessonHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }, true) },
  });
}
