// No "server-only" guard here (unlike sanitize.ts/client.ts/smtp.ts in this
// same directory) — these constants need to be importable from the
// composer's Client Component too, to validate file picks before upload.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB per file
export const MAX_ATTACHMENTS = 5;
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB combined, across recipients this multiplies fast
