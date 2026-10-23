"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { validateExpenseInput, validateInvestmentInput, type ExpenseInputErrors, type InvestmentInputErrors } from "@/lib/platform-admin/finance-config";
import type { PlatformInvestment } from "@/types/database";
import { logPlatformEvent } from "@/lib/platform-events/log";

const EXPENSES_PATH = "/platform-admin/expenses";
const EARNINGS_PATH = "/platform-admin/earnings";

export interface RecordExpenseState {
  error?: string;
  success?: boolean;
  fieldErrors?: ExpenseInputErrors;
}

// Bookkeeping only: recording an expense doesn't pay the supplier. It's how
// the operator logs that a service bill was paid, so margins and "last paid"
// dates are accurate.
export async function recordPlatformExpense(_prevState: RecordExpenseState, formData: FormData): Promise<RecordExpenseState> {
  const user = await requirePlatformAdmin();

  const service = String(formData.get("service") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const vendor = String(formData.get("vendor") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const paidOn = String(formData.get("paidOn") ?? "");
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount = amountRaw === "" ? Number.NaN : Number(amountRaw);

  const fieldErrors = validateExpenseInput({ service, description, amount, paidOn });
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_expenses")
    .insert({
      service,
      description,
      vendor: vendor || null,
      reference: reference || null,
      amount,
      paid_on: paidOn,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Couldn't record that expense. Please try again." };
  }

  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Recorded platform expense of ${amount} for ${service}`,
    metadata: { expenseId: data.id },
  });

  revalidatePath(EXPENSES_PATH);
  revalidatePath(EARNINGS_PATH);
  return { success: true };
}

export async function deletePlatformExpense(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("platform_expenses").delete().eq("id", id);

  revalidatePath(EXPENSES_PATH);
  revalidatePath(EARNINGS_PATH);
}

export interface RecordInvestmentState {
  error?: string;
  success?: boolean;
  fieldErrors?: InvestmentInputErrors;
}

// Bookkeeping only, like an expense: it records that money was put into KingdomFlow, it doesn't move any.
export async function recordPlatformInvestment(_prevState: RecordInvestmentState, formData: FormData): Promise<RecordInvestmentState> {
  const user = await requirePlatformAdmin();

  const investor = String(formData.get("investor") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const purpose = String(formData.get("purpose") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const investedOn = String(formData.get("investedOn") ?? "");
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount = amountRaw === "" ? Number.NaN : Number(amountRaw);

  const fieldErrors = validateInvestmentInput({ investor, category, amount, investedOn });
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const { data, error } = await createAdminClient()
    .from("platform_investments")
    .insert({
      investor,
      category: category as PlatformInvestment["category"],
      amount,
      invested_on: investedOn,
      purpose: purpose || null,
      reference: reference || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't record that investment. Please try again." };

  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Recorded platform investment of ${amount} from ${investor}`,
    metadata: { investmentId: data.id },
  });

  revalidatePath(EXPENSES_PATH);
  revalidatePath(EARNINGS_PATH);
  return { success: true };
}

export async function deletePlatformInvestment(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await createAdminClient().from("platform_investments").delete().eq("id", id);
  revalidatePath(EXPENSES_PATH);
  revalidatePath(EARNINGS_PATH);
}
