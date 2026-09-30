export interface ContactFieldErrors {
  name?: string;
  email?: string;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactForm(input: { name: string; email: string; message: string }): ContactFieldErrors {
  const errors: ContactFieldErrors = {};

  if (!input.name.trim()) {
    errors.name = "Enter your name.";
  }

  if (!input.email.trim()) {
    errors.email = "Enter your email.";
  } else if (!EMAIL_RE.test(input.email.trim())) {
    errors.email = "Enter a valid email.";
  }

  if (!input.message.trim()) {
    errors.message = "Enter a message.";
  } else if (input.message.trim().length < 10) {
    errors.message = "Enter a few more details so we can help.";
  }

  return errors;
}
