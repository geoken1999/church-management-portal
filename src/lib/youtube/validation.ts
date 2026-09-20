// Google's documented thumbnail requirements: JPEG, PNG, GIF, or BMP, 2MB
// max. No "server-only" guard here (unlike client.ts) — this needs to be
// importable from the client component too, for pre-upload validation.
export const ALLOWED_THUMBNAIL_TYPES = ["image/jpeg", "image/png", "image/gif", "image/bmp"];
export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
