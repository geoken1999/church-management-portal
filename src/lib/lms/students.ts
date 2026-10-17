// Pure rules for people from outside the church who apply to the Bible School ("students").
import { nationalTail } from "@/lib/whatsapp/phone-match";

export interface ApplicationInput {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  message: string;
  courseId: string;
}

export type ApplicationErrors = Partial<Record<keyof ApplicationInput, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateApplication(
  input: ApplicationInput,
): ApplicationErrors {
  const errors: ApplicationErrors = {};
  if (!input.firstName.trim()) errors.firstName = "Enter your first name.";
  else if (input.firstName.trim().length > 60)
    errors.firstName = "Keep your first name under 60 characters.";
  if (!input.lastName.trim()) errors.lastName = "Enter your last name.";
  else if (input.lastName.trim().length > 60)
    errors.lastName = "Keep your last name under 60 characters.";
  if (!/^[0-9+\-\s()]{7,20}$/.test(input.phone.trim()))
    errors.phone = "Enter your mobile number.";
  else if (nationalTail(input.phone).length !== 10)
    errors.phone = "Enter a 10-digit mobile number.";
  if (
    input.email.trim() &&
    (!EMAIL_RE.test(input.email.trim()) || input.email.trim().length > 200)
  )
    errors.email = "Enter a valid email address, or leave it blank.";
  if (input.message.length > 500)
    errors.message = "Keep your message under 500 characters.";
  return errors;
}

// The status the database gives each kind of person; used to explain why an application can't go ahead.
export function explainExistingPerson(status: string | null): string | null {
  if (status === "active")
    return "You already have a membership at this church. Install the KingdomFlow app and sign in with this phone number.";
  if (status === "student")
    return "You're already registered. Install the KingdomFlow app and sign in with this phone number.";
  if (status === "pending")
    return "Your membership request is waiting for the church to review it.";
  return null;
}

// What a team member sees as the public address of the school page.
export function publicSchoolPath(slug: string): string {
  return `/bible-school/${slug}`;
}
