// Encryption for a church's proof document, on top of the storage provider's own encryption at rest.
// AES-256-GCM; the key lives only in the server's environment, so reading the storage bucket or the database alone
// shows nothing. Stored layout: version byte | 12-byte IV | 16-byte auth tag | ciphertext.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = 1;
export const ENCRYPTED_SUFFIX = ".enc";

// 32 random bytes, base64: `openssl rand -base64 32`. Null when it is missing or the wrong size.
export function parseProofKey(value: string | undefined): Buffer | null {
  if (!value) return null;
  const key = Buffer.from(value.trim(), "base64");
  return key.length === 32 ? key : null;
}

export function encryptBytes(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
}

export function decryptBytes(data: Buffer, key: Buffer): Buffer {
  if (data.length < 29 || data[0] !== VERSION) throw new Error("Not an encrypted document.");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(1, 13));
  decipher.setAuthTag(data.subarray(13, 29));
  return Buffer.concat([decipher.update(data.subarray(29)), decipher.final()]);
}

export function isEncryptedPath(path: string): boolean {
  return path.endsWith(ENCRYPTED_SUFFIX);
}
