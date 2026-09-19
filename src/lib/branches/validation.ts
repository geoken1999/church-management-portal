export interface BranchFieldErrors {
  name?: string;
  memberCount?: string;
  leaderPhone?: string;
}

const PHONE_RE = /^\+?[0-9\s\-().]{7,20}$/;

export function validateBranch(input: {
  name: string;
  memberCount: string;
  leaderPhone: string;
}): BranchFieldErrors {
  const errors: BranchFieldErrors = {};

  if (!input.name.trim()) {
    errors.name = "Branch name is required.";
  } else if (input.name.trim().length < 2) {
    errors.name = "Branch name must be at least 2 characters.";
  }

  if (input.memberCount.trim()) {
    const parsed = Number(input.memberCount);
    if (!Number.isInteger(parsed) || parsed < 0) {
      errors.memberCount = "Enter a whole number of 0 or more.";
    }
  }

  if (input.leaderPhone.trim() && !PHONE_RE.test(input.leaderPhone.trim())) {
    errors.leaderPhone = "Enter a valid phone number.";
  }

  return errors;
}
