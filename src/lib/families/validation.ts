export interface FamilyFieldErrors {
  name?: string;
}

export function validateFamily(input: { name: string }): FamilyFieldErrors {
  const errors: FamilyFieldErrors = {};

  if (!input.name.trim()) {
    errors.name = "Family name is required.";
  } else if (input.name.trim().length < 2) {
    errors.name = "Family name must be at least 2 characters.";
  }

  return errors;
}

export interface FamilyMemberFieldErrors {
  memberId?: string;
  relationship?: string;
}

export function validateFamilyMember(input: { memberId: string; relationship: string }): FamilyMemberFieldErrors {
  const errors: FamilyMemberFieldErrors = {};

  if (!input.memberId) {
    errors.memberId = "Select a member.";
  }

  if (!input.relationship.trim()) {
    errors.relationship = "Relationship is required.";
  } else if (input.relationship.trim().length < 2) {
    errors.relationship = "Relationship must be at least 2 characters.";
  }

  return errors;
}
