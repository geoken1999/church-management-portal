// No "server-only" guard — pure error-handling logic with no secrets of
// its own (unlike client.ts/templates-client.ts, which read env vars),
// matching whatsapp/validation.ts's same unguarded style. Keeping it
// importable from anywhere also means it stays directly unit-testable.

// Meta's error response can include `error_user_msg` — a short,
// reviewer-facing explanation meant to be shown directly to an end user
// (e.g. a specific reason a template body was rejected) — which is far
// more actionable than the generic top-level `message` (often just
// "Invalid parameter" with no indication of which parameter). Surfaced
// separately so callers can prefer it when present.
export class GraphApiError extends Error {
  code?: number;
  type?: string;
  subcode?: number;
  userMessage?: string;

  constructor(message: string, code?: number, type?: string, subcode?: number, userMessage?: string) {
    super(message);
    this.name = "GraphApiError";
    this.code = code;
    this.type = type;
    this.subcode = subcode;
    this.userMessage = userMessage;
  }

  // Code 190 specifically is Meta's "invalid OAuth 2.0 access token"
  // family (covers "could not be decrypted", "expired", "malformed",
  // "invalidated", etc.) — the actual token is bad, regardless of which
  // API call hit it. Deliberately narrow: `type: "OAuthException"` alone
  // is NOT enough to mean this — Meta also returns that type for plenty
  // of other auth-adjacent failures that have nothing to do with the
  // token's validity (e.g. code 100 "Invalid parameter" for a malformed
  // request body, confirmed live: a template-category casing bug kept
  // producing exactly that code+type for hours after the real token
  // problem had already been fixed, and this check originally treated it
  // as the same issue — a real misdiagnosis, not a hypothetical one).
  get isAuthError(): boolean {
    return this.code === 190;
  }
}

export async function parseGraphError(res: Response): Promise<GraphApiError> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string; code?: number; type?: string; error_subcode?: number; error_user_msg?: string };
    };
    if (parsed.error?.message) {
      return new GraphApiError(parsed.error.message, parsed.error.code, parsed.error.type, parsed.error.error_subcode, parsed.error.error_user_msg);
    }
  } catch {
    // Not JSON — fall through to the raw text below.
  }
  return new GraphApiError(text || `WhatsApp API request failed (${res.status}).`);
}

// What an admin actually needs to do — Meta's own message ("The access
// token could not be decrypted") is accurate but not actionable to
// someone who isn't the one who set up the integration.
export function metaAuthErrorMessage(): string {
  return "WhatsApp isn't connected right now — the configured access token is invalid or has expired. Ask your developer to reconnect it in Meta Business Manager.";
}

// Use at any catch site that doesn't otherwise know whether `err` is a
// GraphApiError — one call gets both the right message to show an admin
// and, via `code`/`type` on the return value, the detail worth logging.
export function describeWhatsAppError(err: unknown): { message: string; code?: number; type?: string } {
  if (err instanceof GraphApiError) {
    const message = err.isAuthError ? metaAuthErrorMessage() : err.userMessage || err.message;
    return { message, code: err.code, type: err.type };
  }
  return { message: err instanceof Error ? err.message : "Something went wrong talking to WhatsApp." };
}
