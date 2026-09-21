export interface YouthFieldErrors {
  memberId?: string;
}

export function validateYouth(input: { memberId: string }): YouthFieldErrors {
  const errors: YouthFieldErrors = {};

  if (!input.memberId) {
    errors.memberId = "Select a member.";
  }

  return errors;
}
