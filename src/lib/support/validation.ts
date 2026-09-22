export const TICKET_CATEGORIES = ["technical", "billing", "feature_request", "account", "other"] as const;
export const TICKET_URGENCIES = ["low", "medium", "high", "urgent"] as const;

export const TICKET_CATEGORY_LABELS: Record<(typeof TICKET_CATEGORIES)[number], string> = {
  technical: "Technical issue",
  billing: "Billing",
  feature_request: "Feature request",
  account: "Account",
  other: "Other",
};

export const TICKET_URGENCY_LABELS: Record<(typeof TICKET_URGENCIES)[number], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export interface SupportTicketFieldErrors {
  subject?: string;
  description?: string;
  category?: string;
}

export function validateSupportTicket(input: { subject: string; description: string; category: string }): SupportTicketFieldErrors {
  const errors: SupportTicketFieldErrors = {};

  if (!input.subject.trim()) {
    errors.subject = "Subject is required.";
  } else if (input.subject.trim().length < 3) {
    errors.subject = "Subject must be at least 3 characters.";
  }

  if (!input.description.trim()) {
    errors.description = "Description is required.";
  } else if (input.description.trim().length < 10) {
    errors.description = "Please describe the issue in at least 10 characters.";
  }

  if (!(TICKET_CATEGORIES as readonly string[]).includes(input.category)) {
    errors.category = "Select a category.";
  }

  return errors;
}
