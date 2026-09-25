export const EXPENSE_PAYMENT_METHODS = ["cash", "check", "bank_transfer", "online", "other"] as const;

export const EXPENSE_PAYMENT_METHOD_LABELS: Record<(typeof EXPENSE_PAYMENT_METHODS)[number], string> = {
  cash: "Cash",
  check: "Check",
  bank_transfer: "Bank transfer",
  online: "Online",
  other: "Other",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ExpenseFieldErrors {
  amount?: string;
  expenseDate?: string;
}

export function validateExpense(input: { amount: string; expenseDate: string }): ExpenseFieldErrors {
  const errors: ExpenseFieldErrors = {};

  if (!input.amount.trim()) {
    errors.amount = "Enter an amount.";
  } else {
    const amount = Number(input.amount);
    if (Number.isNaN(amount) || amount <= 0) errors.amount = "Enter an amount greater than 0.";
  }

  if (!input.expenseDate) {
    errors.expenseDate = "Date is required.";
  } else if (input.expenseDate > today()) {
    errors.expenseDate = "Date can't be in the future.";
  }

  return errors;
}

export function validateAccountingCategoryName(name: string): string | undefined {
  if (!name.trim() || name.trim().length < 2) {
    return "Give the category a name of at least 2 characters.";
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export interface InvoiceLineItemInput {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface InvoiceFieldErrors {
  billToName?: string;
  issueDate?: string;
  taxRate?: string;
  items?: string;
}

export function validateInvoice(input: {
  billToName: string;
  issueDate: string;
  taxRate: string;
  items: InvoiceLineItemInput[];
}): InvoiceFieldErrors {
  const errors: InvoiceFieldErrors = {};

  if (!input.billToName.trim() || input.billToName.trim().length < 2) {
    errors.billToName = "Enter who this invoice is billed to.";
  }

  if (!input.issueDate) {
    errors.issueDate = "Issue date is required.";
  }

  if (input.taxRate.trim()) {
    const rate = Number(input.taxRate);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) errors.taxRate = "Tax rate must be between 0 and 100.";
  }

  const validItems = input.items.filter((item) => item.description.trim());
  if (validItems.length === 0) {
    errors.items = "Add at least one line item.";
  } else if (
    validItems.some((item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      return Number.isNaN(quantity) || quantity <= 0 || Number.isNaN(unitPrice) || unitPrice < 0;
    })
  ) {
    errors.items = "Every line item needs a positive quantity and a valid unit price.";
  }

  return errors;
}
