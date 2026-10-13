import { describe, expect, it } from "vitest";
import { jitter, judgeConnection, median } from "@/lib/livestream/netcheck";

const result = (uploadMbps: number, over = {}) => ({ pingMs: 40, jitterMs: 5, downloadMbps: 50, uploadMbps, ...over });

describe("judgeConnection", () => {
  it("is good when upload covers the chosen quality", () => {
    expect(judgeConnection(result(10), "high")).toMatchObject({ verdict: "good", best: "high" });
  });
  it("is limited when upload only covers a lower quality", () => {
    const j = judgeConnection(result(2), "high");
    expect(j.verdict).toBe("limited");
    expect(j.best).toBe("low");
    expect(j.messages[0]).toMatch(/Full HD needs about 5 Mbps/);
  });
  it("is poor when even Standard won't fit", () => {
    expect(judgeConnection(result(0.8), "low")).toMatchObject({ verdict: "poor", best: null });
  });
  it("flags an unsteady connection", () => {
    expect(judgeConnection(result(10, { pingMs: 400 }), "med").verdict).toBe("limited");
  });
});

describe("helpers", () => {
  it("median and jitter", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(jitter([10, 20, 10])).toBe(10);
    expect(jitter([10])).toBe(0);
  });
});
