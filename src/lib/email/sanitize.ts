import "server-only";

import sanitizeHtml from "sanitize-html";

// The composer's hidden "html" form field is just user-controlled form
// data by the time it reaches the server — the Tiptap editor's own
// constraints don't protect us, since anything could be posted directly.
// This allowlist matches the composer's toolbar (bold/italic/underline,
// headings, lists, blockquote, links, images) and nothing else, since the
// stored body_html is later rendered with dangerouslySetInnerHTML in the
// send history view — an unsanitized script/onerror attribute there would
// be a stored-XSS hole against other admins viewing that history.
const ALLOWED_TAGS = ["p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "h2", "h3", "blockquote", "img"];

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt", "width", "height", "style"] },
    allowedSchemes: ["http", "https", "mailto"],
    // Images only ever come from our own upload endpoint (Supabase Storage
    // public URLs), never a pasted/base64 src — restrict img specifically
    // so a crafted `src="javascript:..."` or huge data: URI can't sneak in
    // even though allowedSchemes above already covers the common case.
    allowedSchemesByTag: { img: ["https"] },
    // The composer sets a fixed `style="max-width: 100%;"` on every inserted
    // image so it doesn't overflow a recipient's inbox width — allowedStyles
    // pins that to an exact safe value rather than trusting arbitrary CSS
    // (which could otherwise carry tracking/exfiltration tricks like
    // `background: url(...)`).
    allowedStyles: { img: { "max-width": [/^100%$/] } },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });
}
