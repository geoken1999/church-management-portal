import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let makeOAuthState: typeof import("./oauth-state").makeOAuthState;
let checkOAuthState: typeof import("./oauth-state").checkOAuthState;

beforeAll(async () => {
  process.env.CONNECTION_SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
  ({ makeOAuthState, checkOAuthState } = await import("./oauth-state"));
});

describe("oauth state", () => {
  it("is accepted for the same person, church and provider, soon after", () => {
    const state = makeOAuthState("u1", "o1", "zoom", 1_000);
    expect(checkOAuthState(state, "u1", "o1", "zoom", 2_000)).toBe(true);
  });
  it("is refused for someone else, another church or provider, a changed value, or too late", () => {
    const state = makeOAuthState("u1", "o1", "zoom", 1_000);
    expect(checkOAuthState(state, "u2", "o1", "zoom", 2_000)).toBe(false);
    expect(checkOAuthState(state, "u1", "o2", "zoom", 2_000)).toBe(false);
    expect(checkOAuthState(state, "u1", "o1", "google_meet", 2_000)).toBe(false);
    expect(checkOAuthState(`${state}x`, "u1", "o1", "zoom", 2_000)).toBe(false);
    expect(checkOAuthState(state, "u1", "o1", "zoom", 1_000 + 16 * 60 * 1000)).toBe(false);
    expect(checkOAuthState(null, "u1", "o1", "zoom")).toBe(false);
  });
});
