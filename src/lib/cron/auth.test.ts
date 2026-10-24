import { describe, expect, it } from "vitest";
import { cronAuthResponse } from "./auth";

const req = (authorization?: string) => new Request("http://localhost/api/cron/x", { headers: authorization ? { authorization } : {} });

describe("cronAuthResponse", () => {
  it("lets a call with the right secret through", () => {
    expect(cronAuthResponse(req("Bearer s3cret"), { CRON_SECRET: "s3cret", VERCEL_ENV: "production" })).toBeNull();
  });
  it("refuses a missing or wrong secret", async () => {
    for (const header of [undefined, "Bearer nope", "s3cret", "Bearer s3cre"]) {
      const res = cronAuthResponse(req(header), { CRON_SECRET: "s3cret" });
      expect(res?.status).toBe(401);
    }
  });
  it("refuses everything on Vercel (production or preview) when no secret is set", () => {
    for (const env of [{ VERCEL_ENV: "production" }, { VERCEL_ENV: "preview" }, { NODE_ENV: "production" }, { VERCEL_ENV: "production", CRON_SECRET: "  " }]) {
      expect(cronAuthResponse(req(), env)?.status).toBe(503);
      expect(cronAuthResponse(req("Bearer anything"), env)?.status).toBe(503);
    }
  });
  it("runs unsigned on a developer's own machine", () => {
    expect(cronAuthResponse(req(), { NODE_ENV: "development" })).toBeNull();
    expect(cronAuthResponse(req(), {})).toBeNull();
  });
});
