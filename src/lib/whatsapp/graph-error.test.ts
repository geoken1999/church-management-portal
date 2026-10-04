import { describe, it, expect } from "vitest";
import { GraphApiError, parseGraphError, metaAuthErrorMessage, describeWhatsAppError } from "./graph-error";

function jsonResponse(body: unknown, status = 400): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("parseGraphError", () => {
  it("extracts message/code/type from Meta's error shape", async () => {
    // The exact error a real template-create call returned live.
    const res = jsonResponse({ error: { message: "The access token could not be decrypted", type: "OAuthException", code: 190 } });
    const err = await parseGraphError(res);
    expect(err).toBeInstanceOf(GraphApiError);
    expect(err.message).toBe("The access token could not be decrypted");
    expect(err.code).toBe(190);
    expect(err.type).toBe("OAuthException");
    expect(err.isAuthError).toBe(true);
  });

  it("does not flag an unrelated error as an auth error", async () => {
    const res = jsonResponse({ error: { message: "Invalid parameter", type: "GraphMethodException", code: 100 } });
    const err = await parseGraphError(res);
    expect(err.isAuthError).toBe(false);
  });

  // Pins a real misdiagnosis this app made live: a template-category
  // casing bug (lowercase "utility" sent where Meta requires "UTILITY")
  // produced exactly this code+type combination for hours — type
  // "OAuthException" alone is NOT sufficient to mean "the token is bad";
  // only code 190 is.
  it("does not flag code 100 as an auth error even when type is OAuthException", async () => {
    const res = jsonResponse({ error: { message: "Invalid parameter", type: "OAuthException", code: 100 } });
    const err = await parseGraphError(res);
    expect(err.isAuthError).toBe(false);
  });

  it("extracts error_user_msg when Meta provides one", async () => {
    const res = jsonResponse({
      error: { message: "Invalid parameter", type: "OAuthException", code: 100, error_subcode: 2388043, error_user_msg: "Category is not valid." },
    });
    const err = await parseGraphError(res);
    expect(err.subcode).toBe(2388043);
    expect(err.userMessage).toBe("Category is not valid.");
  });

  it("falls back to the raw response body when it isn't JSON", async () => {
    const res = new Response("Bad Gateway", { status: 502 });
    const err = await parseGraphError(res);
    expect(err.message).toBe("Bad Gateway");
    expect(err.isAuthError).toBe(false);
  });
});

describe("describeWhatsAppError", () => {
  it("replaces an auth error's raw message with an actionable one", () => {
    const err = new GraphApiError("The access token could not be decrypted", 190, "OAuthException");
    const result = describeWhatsAppError(err);
    expect(result.message).toBe(metaAuthErrorMessage());
    expect(result.message).not.toContain("decrypted");
    expect(result.code).toBe(190);
  });

  it("passes through a non-auth GraphApiError's own message", () => {
    const err = new GraphApiError("Invalid parameter", 100, "GraphMethodException");
    expect(describeWhatsAppError(err).message).toBe("Invalid parameter");
  });

  it("prefers Meta's error_user_msg over the generic message when present", () => {
    const err = new GraphApiError("Invalid parameter", 100, "OAuthException", 2388043, "Category is not valid.");
    expect(describeWhatsAppError(err).message).toBe("Category is not valid.");
  });

  it("handles a plain Error", () => {
    expect(describeWhatsAppError(new Error("network down")).message).toBe("network down");
  });

  it("handles a non-Error throw", () => {
    expect(describeWhatsAppError("oops").message).toBe("Something went wrong talking to WhatsApp.");
  });
});
