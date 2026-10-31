import { describe, expect, it } from "vitest";
import { templateHref } from "./template-query";

describe("templateHref", () => {
  it("keeps only what is set and leaves out page 1", () => {
    expect(templateHref({})).toBe("/dashboard/studio/templates");
    expect(templateHref({ q: "easter", page: 1 })).toBe("/dashboard/studio/templates?q=easter");
    expect(templateHref({ category: "baptism", sort: "popular", page: 3 })).toBe("/dashboard/studio/templates?category=baptism&sort=popular&page=3");
  });
});
