"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { requireFinancePlan } from "@/lib/finance/actions";
import {
  validateExpense,
  validateAccountingCategoryName,
  validateInvoice,
  EXPENSE_PAYMENT_METHODS,
  type ExpenseFieldErrors,
  type InvoiceFieldErrors,
  type InvoiceLineItemInput,
} from "@/lib/accounting/validation";
import { getNextInvoiceNumber } from "@/lib/accounting/dal";
import type { ExpensePaymentMethod, InvoiceStatus } from "@/types/database";

const ACCOUNTING_PATH = "/dashboard/accounting";

async function organizationIdForRow(table: "expenses" | "accounting_categories" | "invoices", id: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from(table).select("organization_id").eq("id", id).maybeSingle();
  return data?.organization_id ?? null;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export interface ExpenseFormState {
  error?: string;
  fieldErrors?: ExpenseFieldErrors;
  success?: boolean;
}

function readExpenseFields(formData: FormData) {
  return {
    categoryId: String(formData.get("categoryId") ?? "").trim(),
    branchId: String(formData.get("branchId") ?? "").trim(),
    amount: String(formData.get("amount") ?? ""),
    payee: String(formData.get("payee") ?? "").trim(),
    expenseDate: String(formData.get("expenseDate") ?? "").trim(),
    paymentMethod: String(formData.get("paymentMethod") ?? "cash"),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

export async function createExpense(_prevState: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const planError = await requireFinancePlan(organizationId);
  if (planError) return { error: planError };
  const access = await checkTabAccess(organizationId, "accounting", "write");
  if (!access.ok) return { error: access.message };

  const fields = readExpenseFields(formData);
  const fieldErrors = validateExpense(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("expenses").insert({
    organization_id: organizationId,
    category_id: fields.categoryId || null,
    branch_id: fields.branchId || null,
    amount: Number(fields.amount),
    payee: fields.payee || null,
    expense_date: fields.expenseDate,
    payment_method: (EXPENSE_PAYMENT_METHODS as readonly string[]).includes(fields.paymentMethod)
      ? (fields.paymentMethod as ExpensePaymentMethod)
      : "cash",
    notes: fields.notes || null,
    recorded_by: user.id,
  });

  if (error) {
    return { error: "Couldn't record that expense. Please try again." };
  }

  revalidatePath(ACCOUNTING_PATH);
  return { success: true };
}

export async function updateExpense(_prevState: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForRow("expenses", id);
  if (!organizationId) {
    return { error: "That expense could not be found." };
  }
  const planError = await requireFinancePlan(organizationId);
  if (planError) return { error: planError };
  const access = await checkTabAccess(organizationId, "accounting", "write");
  if (!access.ok) return { error: access.message };

  const fields = readExpenseFields(formData);
  const fieldErrors = validateExpense(fields);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("expenses")
    .update({
      category_id: fields.categoryId || null,
      branch_id: fields.branchId || null,
      amount: Number(fields.amount),
      payee: fields.payee || null,
      expense_date: fields.expenseDate,
      payment_method: (EXPENSE_PAYMENT_METHODS as readonly string[]).includes(fields.paymentMethod)
        ? (fields.paymentMethod as ExpensePaymentMethod)
        : "cash",
      notes: fields.notes || null,
    })
    .eq("id", id);

  if (error) {
    return { error: "Couldn't save those changes. Please try again." };
  }

  revalidatePath(ACCOUNTING_PATH);
  return { success: true };
}

export async function deleteExpense(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForRow("expenses", id);
  if (!organizationId) return;
  if (await requireFinancePlan(organizationId)) return;
  const access = await checkTabAccess(organizationId, "accounting", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("expenses").delete().eq("id", id);

  revalidatePath(ACCOUNTING_PATH);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface AccountingCategoryState {
  error?: string;
  success?: boolean;
}

export async function createAccountingCategory(
  _prevState: AccountingCategoryState,
  formData: FormData,
): Promise<AccountingCategoryState> {
  await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const planError = await requireFinancePlan(organizationId);
  if (planError) return { error: planError };
  const access = await checkTabAccess(organizationId, "accounting", "write");
  if (!access.ok) return { error: access.message };

  const name = String(formData.get("name") ?? "").trim();
  const nameError = validateAccountingCategoryName(name);
  if (nameError) return { error: nameError };

  const typeRaw = String(formData.get("type") ?? "expense");
  const type = typeRaw === "income" ? "income" : "expense";

  const admin = createAdminClient();
  const { error } = await admin.from("accounting_categories").insert({ organization_id: organizationId, name, type });

  if (error) {
    if (error.code === "23505") {
      return { error: "A category with that name already exists." };
    }
    return { error: "Couldn't create that category. Please try again." };
  }

  revalidatePath(ACCOUNTING_PATH);
  return { success: true };
}

export async function deleteAccountingCategory(formData: FormData) {
  await requireUser();
  const id = String(formData.get("categoryId") ?? "");

  const organizationId = await organizationIdForRow("accounting_categories", id);
  if (!organizationId) return;
  if (await requireFinancePlan(organizationId)) return;
  const access = await checkTabAccess(organizationId, "accounting", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("accounting_categories").delete().eq("id", id);

  revalidatePath(ACCOUNTING_PATH);
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export interface InvoiceFormState {
  error?: string;
  fieldErrors?: InvoiceFieldErrors;
  success?: boolean;
  invoiceId?: string;
}

const MAX_INVOICE_NUMBER_ATTEMPTS = 3;

export async function createInvoice(_prevState: InvoiceFormState, formData: FormData): Promise<InvoiceFormState> {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  const planError = await requireFinancePlan(organizationId);
  if (planError) return { error: planError };
  const access = await checkTabAccess(organizationId, "accounting", "write");
  if (!access.ok) return { error: access.message };

  const billToName = String(formData.get("billToName") ?? "").trim();
  const billToEmail = String(formData.get("billToEmail") ?? "").trim();
  const billToAddress = String(formData.get("billToAddress") ?? "").trim();
  const branchId = String(formData.get("branchId") ?? "").trim();
  const issueDate = String(formData.get("issueDate") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const taxRate = String(formData.get("taxRate") ?? "0");

  let items: InvoiceLineItemInput[];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Something went wrong with the line items. Please try again." };
  }

  const fieldErrors = validateInvoice({ billToName, issueDate, taxRate, items });
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const validItems = items.filter((item) => item.description.trim());
  const subtotal = validItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
  const taxRateNumber = Number(taxRate) || 0;
  const taxAmount = subtotal * (taxRateNumber / 100);
  const total = subtotal + taxAmount;

  const admin = createAdminClient();

  let invoiceId: string | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < MAX_INVOICE_NUMBER_ATTEMPTS && !invoiceId; attempt++) {
    const invoiceNumber = await getNextInvoiceNumber(organizationId);
    const { data, error } = await admin
      .from("invoices")
      .insert({
        organization_id: organizationId,
        invoice_number: invoiceNumber,
        branch_id: branchId || null,
        bill_to_name: billToName,
        bill_to_email: billToEmail || null,
        bill_to_address: billToAddress || null,
        issue_date: issueDate,
        due_date: dueDate || null,
        notes: notes || null,
        subtotal,
        tax_rate: taxRateNumber,
        tax_amount: taxAmount,
        total,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (data) {
      invoiceId = data.id;
    } else if (error?.code === "23505") {
      // Another invoice grabbed this number between the read and the
      // insert — retry with a freshly computed next number.
      lastError = error.message;
      continue;
    } else {
      return { error: "Couldn't create that invoice. Please try again." };
    }
  }

  if (!invoiceId) {
    console.error("invoice number collision exhausted retries:", lastError);
    return { error: "Couldn't create that invoice. Please try again." };
  }

  const { error: itemsError } = await admin.from("invoice_items").insert(
    validItems.map((item, index) => ({
      invoice_id: invoiceId,
      organization_id: organizationId,
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unit_price: Number(item.unitPrice),
      amount: Number(item.quantity) * Number(item.unitPrice),
      sort_order: index,
    })),
  );

  if (itemsError) {
    console.error("invoice_items insert failed:", itemsError.message);
    // The invoice row exists but with no line items — better to surface
    // it (it's still viewable/editable-by-delete) than to leave the
    // person with no feedback at all.
    return { error: "Invoice created, but its line items failed to save. Please delete it and try again." };
  }

  revalidatePath(ACCOUNTING_PATH);
  return { success: true, invoiceId };
}

export async function updateInvoiceStatus(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  const organizationId = await organizationIdForRow("invoices", id);
  if (!organizationId) return;
  if (await requireFinancePlan(organizationId)) return;
  const access = await checkTabAccess(organizationId, "accounting", "write");
  if (!access.ok) return;

  if (!["unpaid", "paid", "cancelled"].includes(status)) return;

  const admin = createAdminClient();
  await admin
    .from("invoices")
    .update({ status: status as InvoiceStatus })
    .eq("id", id);

  revalidatePath(ACCOUNTING_PATH);
  revalidatePath(`${ACCOUNTING_PATH}/invoices/${id}`);
}

export async function deleteInvoice(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");

  const organizationId = await organizationIdForRow("invoices", id);
  if (!organizationId) return;
  if (await requireFinancePlan(organizationId)) return;
  const access = await checkTabAccess(organizationId, "accounting", "delete");
  if (!access.ok) return;

  const admin = createAdminClient();
  await admin.from("invoices").delete().eq("id", id);

  revalidatePath(ACCOUNTING_PATH);
}
