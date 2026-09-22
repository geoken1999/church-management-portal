// Deliberately broad — this is a general-purpose document repository, not
// scoped to one ministry's file types like Worship (PDF/PPT only). Still
// excludes executables/HTML/SVG (SVGs can carry inline scripts) for safety.
export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "image/png",
  "image/jpeg",
  "image/webp",
];

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

const DOCUMENT_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/zip": ".zip",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export function documentExtension(mimeType: string): string {
  return DOCUMENT_EXTENSIONS[mimeType] ?? "";
}

export function validateDocumentTitle(title: string): string | undefined {
  if (!title.trim() || title.trim().length < 2) {
    return "Give the document a title of at least 2 characters.";
  }
  return undefined;
}

export function validateCategoryName(name: string): string | undefined {
  if (!name.trim() || name.trim().length < 2) {
    return "Give the category a name of at least 2 characters.";
  }
  return undefined;
}
