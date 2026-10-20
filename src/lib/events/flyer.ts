// Rules for an event's flyer image, shared by the upload and the report that copies it.
export const FLYER_BUCKET = "event-flyers";
export const MAX_FLYER_BYTES = 3 * 1024 * 1024;
export const FLYER_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const flyerUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${FLYER_BUCKET}/${path}`;

export function flyerProblem(file: {
  type: string;
  size: number;
}): string | null {
  if (!FLYER_TYPES[file.type])
    return "The flyer must be a JPEG, PNG or WebP image.";
  if (file.size > MAX_FLYER_BYTES)
    return `The flyer must be smaller than ${Math.round(MAX_FLYER_BYTES / (1024 * 1024))} MB.`;
  return null;
}
