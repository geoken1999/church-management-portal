// Rules for the screenshots people attach to support tickets, shared by the form and the server.
export const SUPPORT_BUCKET = "support-attachments";
export const MAX_SUPPORT_IMAGES = 4;
export const MAX_SUPPORT_IMAGE_BYTES = 5 * 1024 * 1024;
export const SUPPORT_IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export interface SupportAttachment {
  path: string;
  name: string;
  size: number;
  // A short-lived link for showing it, added when the ticket is read.
  url?: string;
}

// Why these images can't be attached, or null when they are fine.
export function supportImagesProblem(files: { name: string; type: string; size: number }[]): string | null {
  if (files.length > MAX_SUPPORT_IMAGES) return `You can attach up to ${MAX_SUPPORT_IMAGES} images.`;
  for (const file of files) {
    if (!SUPPORT_IMAGE_TYPES[file.type]) return `"${file.name}" isn't a JPEG, PNG, WebP or GIF image.`;
    if (file.size > MAX_SUPPORT_IMAGE_BYTES) return `"${file.name}" is over 5 MB.`;
  }
  return null;
}
