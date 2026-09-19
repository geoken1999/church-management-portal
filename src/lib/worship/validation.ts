export interface WorshipTeamMemberFieldErrors {
  memberId?: string;
  role?: string;
}

export function validateWorshipTeamMember(input: { memberId: string; role: string }): WorshipTeamMemberFieldErrors {
  const errors: WorshipTeamMemberFieldErrors = {};

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

export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export function documentExtension(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return ".pdf";
    case "application/vnd.ms-powerpoint":
      return ".ppt";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return ".pptx";
    default:
      return "";
  }
}

export function documentTypeLabel(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case "application/vnd.ms-powerpoint":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "PowerPoint";
    default:
      return "File";
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
