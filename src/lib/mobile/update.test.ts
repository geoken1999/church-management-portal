import { describe, expect, it } from "vitest";
import { answerFor, compareVersions } from "@/lib/mobile/update-config";

const cfg = { latest: "1.2.0", minimum: "1.1.0", storeUrl: "https://example.com", notes: "" };

describe("mobile update answer", () => {
  it("compares versions numerically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("1.1", "1.1.0")).toBe(0);
  });
  it("is current, optional or required", () => {
    expect(answerFor(cfg, "1.2.0").status).toBe("none");
    expect(answerFor(cfg, "1.1.5").status).toBe("optional");
    expect(answerFor(cfg, "1.0.9").status).toBe("required");
  });
  it("says nothing when nothing is configured", () => {
    expect(answerFor({ ...cfg, latest: "" }, "1.0.0").status).toBe("none");
  });
});
