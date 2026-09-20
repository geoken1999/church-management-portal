import "server-only";

import crypto from "node:crypto";
import { getInstagramEnv } from "@/lib/instagram/env";

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

export interface SignedRequestPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
}

// Verifies and decodes the signed_request Meta posts to the deauthorize and
// data-deletion webhooks. Returns null for anything that fails HMAC
// verification — callers must treat a null result as "not really from
// Meta" and refuse to act on it.
export function parseSignedRequest(signedRequest: string): SignedRequestPayload | null {
  const { appSecret } = getInstagramEnv();
  const [encodedSig, payload] = signedRequest.split(".", 2);
  if (!encodedSig || !payload) return null;

  const sig = base64UrlDecode(encodedSig);
  const expectedSig = crypto.createHmac("sha256", appSecret).update(payload).digest();

  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(sig, expectedSig)) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(payload).toString("utf8")) as SignedRequestPayload;
  } catch {
    return null;
  }
}
