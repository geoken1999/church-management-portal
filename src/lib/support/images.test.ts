import { describe, expect, it } from "vitest";
import { MAX_SUPPORT_IMAGE_BYTES, supportImagesProblem } from "@/lib/support/images";

const img = (over = {}) => ({ name: "shot.png", type: "image/png", size: 1000, ...over });

describe("supportImagesProblem", () => {
  it("accepts a few small images", () => {
    expect(supportImagesProblem([img(), img({ type: "image/jpeg" })])).toBeNull();
    expect(supportImagesProblem([])).toBeNull();
  });
  it("refuses too many, wrong types and big files", () => {
    expect(supportImagesProblem(Array.from({ length: 5 }, () => img()))).toMatch(/up to 4/);
    expect(supportImagesProblem([img({ name: "doc.pdf", type: "application/pdf" })])).toMatch(/isn't a JPEG/);
    expect(supportImagesProblem([img({ size: MAX_SUPPORT_IMAGE_BYTES + 1 })])).toMatch(/over 5 MB/);
  });
});
