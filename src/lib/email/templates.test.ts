import { describe, expect, it } from "vitest";
import { BUILT_IN_EMAIL_TEMPLATES, fillChurchName } from "@/lib/email/templates";

const ALLOWED = new Set(["p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "h2", "h3", "blockquote", "img"]);

describe("built-in email templates", () => {
  it("have unique keys and names, and something to say", () => {
    expect(new Set(BUILT_IN_EMAIL_TEMPLATES.map((t) => t.key)).size).toBe(BUILT_IN_EMAIL_TEMPLATES.length);
    expect(new Set(BUILT_IN_EMAIL_TEMPLATES.map((t) => t.name)).size).toBe(BUILT_IN_EMAIL_TEMPLATES.length);
    for (const t of BUILT_IN_EMAIL_TEMPLATES) {
      expect(t.subject.length).toBeGreaterThan(3);
      expect(t.html.length).toBeGreaterThan(40);
    }
  });
  it("use only tags the email sanitizer keeps", () => {
    for (const t of BUILT_IN_EMAIL_TEMPLATES) {
      for (const tag of t.html.matchAll(/<\/?([a-z0-9]+)/gi)) expect(ALLOWED.has(tag[1].toLowerCase()), `${t.key}: <${tag[1]}>`).toBe(true);
    }
  });
  it("fills in the church's name everywhere", () => {
    const t = BUILT_IN_EMAIL_TEMPLATES.find((x) => x.key === "service-reminder")!;
    expect(fillChurchName(t.html, "Grace Church")).not.toContain("{{");
    expect(fillChurchName(t.subject, "Grace Church")).toBe("See you this Sunday at Grace Church");
  });
});
