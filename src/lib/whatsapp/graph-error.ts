// No "server-only" guard — pure error-handling logic with no secrets of
// its own (unlike client.ts/templates-client.ts, which read env vars),
// matching whatsapp/validation.ts's same unguarded style. Keeping it
// importable from anywhere also means it stays directly unit-testable.

// Meta's OAuthException family (code 190 — covers "could not be
// decrypted", "expired", "malformed", "invalidated", etc.) all mean the
// same actionable thing regardless of which API call hit it: the
// configured META_WHATSAPP_ACCESS_TOKEN itself is bad, not whatever the
// caller was trying to do (send a message, create a template, ...).
// Carrying code/type through a typed error — rather than just a message
// string — lets every call site detect this one category centrally
// instead of each guessing at Meta's wording.
export class GraphApiError extends Error {
  code?: number;
  type?: string;

  constructor(message: string, code?: number, type?: string) {
    super(message);
    this.name = "GraphApiError";
    this.code = code;
    this.type = type;
  }

  get isAuthError(): boolean {
    return this.code === 190 || this.type === "OAuthException";
  }
}

export async function parseGraphError(res: Response): Promise<GraphApiError> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string; code?: number; type?: string } };
    if (parsed.error?.message) {
      return new GraphApiError(parsed.error.message, parsed.error.code, parsed.error.type);
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
    return { message: err.isAuthError ? metaAuthErrorMessage() : err.message, code: err.code, type: err.type };
  }
  return { message: err instanceof Error ? err.message : "Something went wrong talking to WhatsApp." };
}
