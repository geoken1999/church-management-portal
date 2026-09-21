export interface LeaderFieldErrors {
  memberId?: string;
}

export function validateLeader(input: { memberId: string }): LeaderFieldErrors {
  const errors: LeaderFieldErrors = {};

  if (!input.memberId) {
    errors.memberId = "Select a member.";
  }

  return errors;
}
