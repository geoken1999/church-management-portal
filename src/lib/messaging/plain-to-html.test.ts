import { describe, expect, it } from "vitest";
import { plainTextToHtml } from "@/lib/messaging/plain-to-html";

describe("plainTextToHtml", () => {
  it("makes paragraphs and line breaks", () => {
    expect(plainTextToHtml("Hello\nthere\n\nSee you Sunday")).toBe("<p>Hello<br>there</p><p>See you Sunday</p>");
  });
  it("escapes markup", () => {
    expect(plainTextToHtml('<script>alert("x")</script> & more')).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more</p>");
  });
  it("is empty for empty text", () => {
    expect(plainTextToHtml("  \n\n ")).toBe("");
  });
});
