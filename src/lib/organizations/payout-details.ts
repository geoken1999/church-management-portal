import type { PayoutMethod } from "@/types/database";

export const PAYOUT_METHODS: PayoutMethod[] = ["upi", "bank_transfer"];
export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  upi: "UPI",
  bank_transfer: "Bank transfer",
};

export interface PayoutDetailsInput {
  payoutMethod: string;
  upiId: string;
  bankAccountHolder: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
}

export interface PayoutDetailsErrors {
  payoutMethod?: string;
  upiId?: string;
  bankAccountHolder?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankName?: string;
}

// Deliberately light — required-field checks only, same touch as
// validateRazorpayKeyId/validateRazorpayKeySecret (src/lib/finance/
// validation.ts). Nothing here is checked against a live bank/UPI API;
// a platform admin reads it and wires money manually, so a format regex
// would only create false rejections without catching anything that
// actually matters.
export function validatePayoutDetails(input: PayoutDetailsInput): PayoutDetailsErrors {
  const errors: PayoutDetailsErrors = {};

  if (!PAYOUT_METHODS.includes(input.payoutMethod as PayoutMethod)) {
    errors.payoutMethod = "Choose how you'd like to receive payouts.";
    return errors;
  }

  if (input.payoutMethod === "upi") {
    if (!input.upiId.trim()) errors.upiId = "Enter your UPI ID.";
    return errors;
  }

  if (!input.bankAccountHolder.trim()) errors.bankAccountHolder = "Enter the account holder's name.";
  if (!input.bankAccountNumber.trim()) errors.bankAccountNumber = "Enter the account number.";
  if (!input.bankIfsc.trim()) errors.bankIfsc = "Enter the IFSC code.";
  if (!input.bankName.trim()) errors.bankName = "Enter the bank name.";

  return errors;
}
