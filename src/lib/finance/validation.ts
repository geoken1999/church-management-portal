export const FUNDRAISER_STATUSES = ["active", "completed", "cancelled"] as const;
export const DONATION_METHODS = ["cash", "check", "bank_transfer", "online", "other"] as const;

export const DONATION_METHOD_LABELS: Record<(typeof DONATION_METHODS)[number], string> = {
  cash: "Cash",
  check: "Check",
  bank_transfer: "Bank transfer",
  online: "Online",
  other: "Other",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function validateAmount(raw: string): string | undefined {
  if (!raw.trim()) return "Enter an amount.";
  const amount = Number(raw);
  if (Number.isNaN(amount) || amount <= 0) return "Enter an amount greater than 0.";
  return undefined;
}

export interface FundraiserFieldErrors {
  title?: string;
  goalAmount?: string;
  endDate?: string;
}

export function validateFundraiser(input: {
  title: string;
  goalAmount: string;
  startDate: string;
  endDate: string;
}): FundraiserFieldErrors {
  const errors: FundraiserFieldErrors = {};

  if (!input.title.trim()) {
    errors.title = "Title is required.";
  } else if (input.title.trim().length < 2) {
    errors.title = "Title must be at least 2 characters.";
  }

  const amountError = validateAmount(input.goalAmount);
  if (amountError) errors.goalAmount = amountError;

  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    errors.endDate = "End date can't be before the start date.";
  }

  return errors;
}

export interface OfferingFieldErrors {
  category?: string;
  amount?: string;
  collectedOn?: string;
}

export function validateOffering(input: { category: string; amount: string; collectedOn: string }): OfferingFieldErrors {
  const errors: OfferingFieldErrors = {};

  if (!input.category.trim()) {
    errors.category = "Category is required.";
  } else if (input.category.trim().length < 2) {
    errors.category = "Category must be at least 2 characters.";
  }

  const amountError = validateAmount(input.amount);
  if (amountError) errors.amount = amountError;

  if (!input.collectedOn) {
    errors.collectedOn = "Date is required.";
  } else if (input.collectedOn > today()) {
    errors.collectedOn = "Date can't be in the future.";
  }

  return errors;
}

export interface DonationFieldErrors {
  donor?: string;
  amount?: string;
  donatedOn?: string;
}

export function validateDonation(input: {
  memberId: string;
  donorName: string;
  amount: string;
  donatedOn: string;
}): DonationFieldErrors {
  const errors: DonationFieldErrors = {};

  if (!input.memberId && !input.donorName.trim()) {
    errors.donor = "Select a member or enter a donor name.";
  }

  const amountError = validateAmount(input.amount);
  if (amountError) errors.amount = amountError;

  if (!input.donatedOn) {
    errors.donatedOn = "Date is required.";
  } else if (input.donatedOn > today()) {
    errors.donatedOn = "Date can't be in the future.";
  }

  return errors;
}
