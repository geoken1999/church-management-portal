export interface CustomPlanRequestFieldErrors {
  churchName?: string;
  email?: string;
  phone?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCustomPlanRequest(input: { churchName: string; email: string; phone: string }): CustomPlanRequestFieldErrors {
  const errors: CustomPlanRequestFieldErrors = {};

  if (!input.churchName.trim()) {
    errors.churchName = "Enter your church's name.";
  }

  if (!input.email.trim()) {
    errors.email = "Enter your email.";
  } else if (!EMAIL_RE.test(input.email.trim())) {
    errors.email = "Enter a valid email.";
  }

  if (!input.phone.trim()) {
    errors.phone = "Enter a phone number so we can reach you.";
  }

  return errors;
}
