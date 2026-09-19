export interface SignupFieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
}

export interface LoginFieldErrors {
  email?: string;
  password?: string;
}

export interface ProfileDetailsFieldErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Loose international phone check: optional +, 7-15 digits, spaces/dashes/parens allowed.
const PHONE_RE = /^\+?[0-9\s\-().]{7,20}$/;

export function validatePhone(phone: string): string | undefined {
  if (phone.trim() && !PHONE_RE.test(phone.trim())) {
    return "Enter a valid phone number.";
  }
  return undefined;
}

export function validateName(name: string, label: string): string | undefined {
  if (!name.trim()) return `${label} is required.`;
  if (name.trim().length < 2) return `${label} must be at least 2 characters.`;
  return undefined;
}

export function validateProfileDetails(input: {
  firstName: string;
  lastName: string;
  phone: string;
}): ProfileDetailsFieldErrors {
  const errors: ProfileDetailsFieldErrors = {};
  const firstNameError = validateName(input.firstName, "First name");
  if (firstNameError) errors.firstName = firstNameError;
  const lastNameError = validateName(input.lastName, "Last name");
  if (lastNameError) errors.lastName = lastNameError;
  const phoneError = validatePhone(input.phone);
  if (phoneError) errors.phone = phoneError;
  return errors;
}

export function validatePassword(password: string): string | undefined {
  if (!password) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  return undefined;
}

export function validateSignup(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}): SignupFieldErrors {
  const errors: SignupFieldErrors = {};

  const firstNameError = validateName(input.firstName, "First name");
  if (firstNameError) errors.firstName = firstNameError;
  const lastNameError = validateName(input.lastName, "Last name");
  if (lastNameError) errors.lastName = lastNameError;

  if (!input.email.trim()) {
    errors.email = "Email is required.";
  } else if (!EMAIL_RE.test(input.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  const phoneError = validatePhone(input.phone);
  if (phoneError) errors.phone = phoneError;

  const passwordError = validatePassword(input.password);
  if (passwordError) errors.password = passwordError;

  if (!input.confirmPassword) {
    errors.confirmPassword = "Please confirm your password.";
  } else if (input.password !== input.confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}

export function validateLogin(input: { email: string; password: string }): LoginFieldErrors {
  const errors: LoginFieldErrors = {};

  if (!input.email.trim()) {
    errors.email = "Email is required.";
  } else if (!EMAIL_RE.test(input.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (!input.password) {
    errors.password = "Password is required.";
  }

  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.values(errors).some(Boolean);
}
