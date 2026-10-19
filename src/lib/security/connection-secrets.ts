import "server-only";

import crypto from "node:crypto";

// Encrypts the secrets a church hands us so we can act for it: social media access tokens, its own
// payment-gateway keys and its email (SMTP) password. A database leak, a backup, or a stray read of one of
// these rows then does not give away a working credential. AES-256-GCM with a random IV per value; the key
// lives only in the server environment (CONNECTION_SECRETS_KEY, 32 bytes, base64: openssl rand -base64 32).
//
// Format: "cs1.<iv>.<tag>.<ciphertext>", each part base64url. A value that does not start with "cs1." is an
// older plain-text one: it is still read as is, and replaced by an encrypted one the next time it is saved
// (or all at once with scripts/encrypt-connection-secrets.mjs).
const PREFIX = "cs1";

function getKey(): Buffer {
  const raw = process.env.CONNECTION_SECRETS_KEY;
  if (!raw)
    throw new Error(
      "CONNECTION_SECRETS_KEY must be set to store a church's connection secrets.",
    );
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32)
    throw new Error(
      "CONNECTION_SECRETS_KEY must be 32 bytes, base64-encoded (generate one with: openssl rand -base64 32).",
    );
  return key;
}

export function isConnectionSecretsConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function isSealed(value: string): boolean {
  return value.startsWith(`${PREFIX}.`);
}

/** Encrypts a secret for storage. Throws if the key is not configured: a secret is never stored in plain text. */
export function sealSecret(plaintext: string): string {
  if (isSealed(plaintext)) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    PREFIX,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

/** Reads a stored secret: decrypts a sealed value, passes an older plain-text one through unchanged. */
export function openSecret(stored: string): string {
  if (!isSealed(stored)) return stored;
  const [, iv, tag, data] = stored.split(".");
  if (!iv || !tag || !data)
    throw new Error("Unrecognized stored credential format.");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * For refreshing a token that is already stored: the encrypted value, or null when no key is configured
 * (the caller then keeps using the new token for this call without saving it, rather than failing a
 * working connection or saving it in plain text).
 */
export function sealIfConfigured(plaintext: string): string | null {
  return isConnectionSecretsConfigured() ? sealSecret(plaintext) : null;
}

/** Same as openSecret for a nullable column. */
export function openOptionalSecret(
  stored: string | null | undefined,
): string | null {
  return stored ? openSecret(stored) : null;
}
