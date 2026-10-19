// The encryption format of src/lib/security/connection-secrets.ts, with the key passed in, for the
// maintenance scripts (encrypt existing rows, rotate the key). A test checks both stay compatible.
import crypto from "node:crypto";

export const PREFIX = "cs1";

export function parseKey(raw, name = "key") {
  if (!raw) throw new Error(`${name} is not set.`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded (openssl rand -base64 32).`);
  return key;
}

export const isSealed = (value) => typeof value === "string" && value.startsWith(`${PREFIX}.`);

export function seal(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function open(stored, key) {
  const [, iv, tag, data] = stored.split(".");
  if (!iv || !tag || !data) throw new Error("Unrecognized stored credential format.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/**
 * What a value should become when the key changes. Sealed with the old key: decrypted and sealed again with
 * the new one. Already sealed with the new key: left alone (so a run can be repeated or resumed). Plain text:
 * sealed with the new key. Anything that opens with neither key is reported, never overwritten.
 */
export function rekey(stored, oldKey, newKey) {
  if (!isSealed(stored)) return { action: "seal", value: seal(stored, newKey) };
  try {
    open(stored, newKey);
    return { action: "keep" };
  } catch {
    // not the new key: try the old one
  }
  try {
    return { action: "rotate", value: seal(open(stored, oldKey), newKey) };
  } catch {
    return { action: "unreadable" };
  }
}

// Every place a church's connection secrets live. `id` is the column that identifies the row.
export const TARGETS = [
  { table: "instagram_connections", id: "id", columns: ["access_token"] },
  { table: "youtube_connections", id: "id", columns: ["access_token", "refresh_token"] },
  { table: "facebook_connections", id: "organization_id", columns: ["access_token"] },
  { table: "email_smtp_settings", id: "organization_id", columns: ["password"] },
  { table: "organization_razorpay_accounts", id: "organization_id", columns: ["key_secret"] },
  { table: "organization_gateway_accounts", id: "id", columns: ["key_secret"] },
];
