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
