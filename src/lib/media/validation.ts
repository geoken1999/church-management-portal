export interface MediaTeamMemberFieldErrors {
  memberId?: string;
  role?: string;
}

export function validateMediaTeamMember(input: { memberId: string; role: string }): MediaTeamMemberFieldErrors {
  const errors: MediaTeamMemberFieldErrors = {};

  if (!input.memberId) {
    errors.memberId = "Select a member.";
  }

  if (!input.role.trim()) {
    errors.role = "Role is required.";
  } else if (input.role.trim().length < 2) {
    errors.role = "Role must be at least 2 characters.";
  }

  return errors;
}

export interface MediaEquipmentFieldErrors {
  name?: string;
}

export function validateMediaEquipment(input: { name: string }): MediaEquipmentFieldErrors {
  const errors: MediaEquipmentFieldErrors = {};

  if (!input.name.trim()) {
    errors.name = "Equipment name is required.";
  } else if (input.name.trim().length < 2) {
    errors.name = "Equipment name must be at least 2 characters.";
  }

  return errors;
}

export interface MediaSocialAccountFieldErrors {
  platform?: string;
}

export function validateMediaSocialAccount(input: { platform: string }): MediaSocialAccountFieldErrors {
  const errors: MediaSocialAccountFieldErrors = {};

  if (!input.platform.trim()) {
    errors.platform = "Platform is required.";
  } else if (input.platform.trim().length < 2) {
    errors.platform = "Platform must be at least 2 characters.";
  }

  return errors;
}

// "Documents of all kinds" — broader than worship's PDF/PowerPoint-only
// allowlist, but still excludes executables/HTML/SVG (SVGs can carry
// inline scripts) for safety.
export const ALLOWED_MEDIA_DOCUMENT_TYPES = [
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

export const MAX_MEDIA_DOCUMENT_BYTES = 25 * 1024 * 1024;

const MEDIA_DOCUMENT_EXTENSIONS: Record<string, string> = {
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

export function mediaDocumentExtension(mimeType: string): string {
  return MEDIA_DOCUMENT_EXTENSIONS[mimeType] ?? "";
}

const MEDIA_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.ms-excel": "Excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.ms-powerpoint": "PowerPoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
  "text/plain": "Text",
  "text/csv": "CSV",
  "application/zip": "ZIP",
  "image/png": "Image",
  "image/jpeg": "Image",
  "image/webp": "Image",
};

export function mediaDocumentTypeLabel(mimeType: string): string {
  return MEDIA_DOCUMENT_TYPE_LABELS[mimeType] ?? "File";
}
