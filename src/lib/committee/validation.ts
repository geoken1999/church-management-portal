export interface CommitteeMemberFieldErrors {
  memberId?: string;
  committeeName?: string;
  role?: string;
}

export function validateCommitteeMember(input: { memberId: string; committeeName: string; role: string }): CommitteeMemberFieldErrors {
  const errors: CommitteeMemberFieldErrors = {};

  if (!input.memberId) {
    errors.memberId = "Select a member.";
  }

  if (!input.committeeName.trim()) {
    errors.committeeName = "Committee name is required.";
  } else if (input.committeeName.trim().length < 2) {
    errors.committeeName = "Committee name must be at least 2 characters.";
  }

  if (!input.role.trim()) {
    errors.role = "Role is required.";
  } else if (input.role.trim().length < 2) {
    errors.role = "Role must be at least 2 characters.";
  }

  return errors;
}
