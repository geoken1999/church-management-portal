export interface BranchFieldErrors {
  name?: string;
  memberCount?: string;
}

export function validateBranch(input: { name: string; memberCount: string }): BranchFieldErrors {
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

  return errors;
}
