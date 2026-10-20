import { stateByName } from "@/lib/billing/states";

// What a church gives so it can be invoiced. Pure, so the form and the server check the same way.
export interface BillingDetailsInput {
  legalName: string;
  gstin: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  email: string;
  phone: string;
}

export type BillingDetailsErrors = Partial<
  Record<keyof BillingDetailsInput, string>
>;

export const EMPTY_BILLING_DETAILS: BillingDetailsInput = {
  legalName: "",
  gstin: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  pincode: "",
  email: "",
  phone: "",
};

// 15 characters: 2-digit state code, 10-character PAN, entity number, Z, check character.
const GSTIN = /^(\d{2})[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function validateBillingDetails(
  input: BillingDetailsInput,
): BillingDetailsErrors {
  const errors: BillingDetailsErrors = {};
  if (input.legalName.trim().length < 2)
    errors.legalName = "Enter the name to put on the invoice.";
  if (input.addressLine1.trim().length < 3)
    errors.addressLine1 = "Enter the address.";
  if (input.city.trim().length < 2) errors.city = "Enter the city.";
  const state = stateByName(input.state);
  if (!state) errors.state = "Choose the state.";
  if (!/^\d{6}$/.test(input.pincode.trim()))
    errors.pincode = "Enter a 6-digit PIN code.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))
    errors.email = "Enter the email the invoice should be sent to.";
  if (input.phone.trim() && !/^[+\d][\d\s-]{6,}$/.test(input.phone.trim()))
    errors.phone = "Enter a valid phone number.";
  const gstin = input.gstin.trim().toUpperCase();
  if (gstin) {
    const match = GSTIN.exec(gstin);
    if (!match)
      errors.gstin = "A GSTIN is 15 characters, like 27ABCDE1234F1Z5.";
    else if (state && match[1] !== state.code)
      errors.gstin = `This GSTIN starts with state code ${match[1]}, which isn't ${state.name}.`;
  }
  return errors;
}

export function cleanBillingDetails(
  input: BillingDetailsInput,
): BillingDetailsInput {
  return {
    legalName: input.legalName.trim(),
    gstin: input.gstin.trim().toUpperCase(),
    addressLine1: input.addressLine1.trim(),
    addressLine2: input.addressLine2.trim(),
    city: input.city.trim(),
    state: stateByName(input.state)?.name ?? input.state.trim(),
    pincode: input.pincode.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
  };
}
