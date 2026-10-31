import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, cspHeaderName } from "./csp";

const directive = (policy: string, name: string) => policy.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("contentSecurityPolicy", () => {
  const policy = contentSecurityPolicy();

  it("only allows what the app uses and shuts the rest", () => {
    expect(directive(policy, "default-src")).toBe("default-src 'self'");
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
    expect(policy).toContain("report-uri /api/csp-report");
  });

  it("lets payments, calls and the WhatsApp sign-up window work", () => {
    expect(directive(policy, "script-src")).toContain("https://checkout.razorpay.com");
    expect(directive(policy, "script-src")).toContain("https://sdk.cashfree.com");
    expect(directive(policy, "script-src")).toContain("https://source.zoom.us");
    expect(directive(policy, "script-src")).toContain("https://connect.facebook.net");
    expect(directive(policy, "connect-src")).toContain("https://zoom.us");
    expect(directive(policy, "connect-src")).toContain("wss://*.zoom.us");
    expect(directive(policy, "script-src")).toContain("https://*.cloudfront.net");
    expect(directive(policy, "script-src")).toContain(" blob: ");
    expect(directive(policy, "worker-src")).toContain("https://source.zoom.us");
    expect(directive(policy, "connect-src")).toContain("https://*.facebook.com");
    expect(directive(policy, "frame-src")).toContain("https://*.facebook.com");
    expect(directive(policy, "frame-src")).toContain("https://*.razorpay.com");
    expect(directive(policy, "form-action")).toContain("https://secure.payu.in");
  });

  it("never allows scripts from anywhere", () => {
    expect(directive(policy, "script-src")).not.toMatch(/ https:( |$)| \*( |$)/);
    expect(directive(policy, "frame-src")).not.toMatch(/ https:( |$)| \*( |$)/);
  });

  it("forbids being framed only where asked", () => {
    expect(policy).not.toContain("frame-ancestors");
    expect(contentSecurityPolicy({ framingAllowed: false })).toContain("frame-ancestors 'none'");
  });
});

describe("cspHeaderName", () => {
  it("enforces by default and can be switched back to report-only", () => {
    expect(cspHeaderName(undefined)).toBe("Content-Security-Policy");
    expect(cspHeaderName("")).toBe("Content-Security-Policy");
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName(" Report-Only ")).toBe("Content-Security-Policy-Report-Only");
  });
});
