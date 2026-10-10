import crypto from "node:crypto";

// Encrypts a tenant's WhatsApp access token (and optional app secret) before
// it is stored. A database leak or a stray read of the connection row then
// doesn't hand over a token that can send messages as the church. AES-256-GCM
// with a random IV per value; the key lives only in the environment.
// Format: "v1.<iv>.<tag>.<ciphertext>", each part base64url.
const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.WHATSAPP_CREDENTIALS_KEY;
  if (!raw) throw new Error("WHATSAPP_CREDENTIALS_KEY must be set to store a tenant's WhatsApp credentials.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("WHATSAPP_CREDENTIALS_KEY must be 32 bytes, base64-encoded (generate one with: openssl rand -base64 32).");
  return key;
}

export function isSecretBoxConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognized stored credential format.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
