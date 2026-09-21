export interface MinistryFieldErrors {
  title?: string;
}

export function validateMinistry(input: { title: string }): MinistryFieldErrors {
  const errors: MinistryFieldErrors = {};

  if (!input.title.trim()) {
    errors.title = "Ministry title is required.";
  } else if (input.title.trim().length < 2) {
    errors.title = "Ministry title must be at least 2 characters.";
  }

  return errors;
}
