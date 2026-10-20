import { describe, expect, it } from "vitest";
import { flyerProblem, MAX_FLYER_BYTES } from "@/lib/events/flyer";

describe("flyerProblem", () => {
  it("accepts a JPEG, PNG or WebP under the limit", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"])
      expect(flyerProblem({ type, size: 1000 })).toBeNull();
  });
  it("rejects other types and big files", () => {
    expect(flyerProblem({ type: "application/pdf", size: 1000 })).toMatch(
      /JPEG, PNG or WebP/,
    );
    expect(flyerProblem({ type: "image/gif", size: 1000 })).not.toBeNull();
    expect(
      flyerProblem({ type: "image/png", size: MAX_FLYER_BYTES + 1 }),
    ).toMatch(/smaller than 3 MB/);
  });
});
