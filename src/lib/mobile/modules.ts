import type { TabKey } from "@/lib/permissions/tabs";

// The simple "records" modules the staff mobile app edits through one generic
// route (/api/mobile/records): each is a table of a few fields with the same
// permissions and rules as its web page. Pure (no database), so the rules are
// testable; the mobile app mirrors the field lists in lib/data/module_specs.dart.

export type FieldType = "text" | "longtext" | "date" | "amount" | "select" | "member" | "leader" | "branch" | "fundraiser" | "category";

export interface FieldSpec {
  key: string;
  column: string;
  label: string;
  type: FieldType;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  options?: string[];
  // Only set when the record is created (a person can't be swapped on an existing entry).
  createOnly?: boolean;
  // A date that can't be in the future.
  noFuture?: boolean;
}

export interface ModuleSpec {
  key: ModuleKey;
  tab: TabKey;
  table: string;
  // Needs the Finance plan, as on the web.
  finance?: boolean;
  // Column that records who made the entry.
  createdBy?: string;
  fields: FieldSpec[];
  // Rules across fields: returns an error message, or null.
  crossCheck?: (row: Record<string, unknown>) => string | null;
}

export type ModuleKey = "ministries" | "worship" | "media" | "offerings" | "donations" | "fundraisers" | "expenses" | "accounting_categories";

const DONATION_METHODS = ["cash", "check", "bank_transfer", "online", "other"];
const FUNDRAISER_STATUSES = ["active", "completed", "cancelled"];

export const MODULES: Record<ModuleKey, ModuleSpec> = {
  expenses: {
    key: "expenses",
    tab: "accounting",
    table: "expenses",
    finance: true,
    createdBy: "recorded_by",
    fields: [
      { key: "categoryId", column: "category_id", label: "Category", type: "category" },
      { key: "branchId", column: "branch_id", label: "Branch", type: "branch" },
      { key: "amount", column: "amount", label: "Amount", type: "amount", required: true },
      { key: "payee", column: "payee", label: "Payee", type: "text", maxLength: 120 },
      { key: "expenseDate", column: "expense_date", label: "Date", type: "date", required: true, noFuture: true },
      { key: "paymentMethod", column: "payment_method", label: "Payment method", type: "select", options: DONATION_METHODS },
      { key: "notes", column: "notes", label: "Notes", type: "longtext" },
    ],
  },
  accounting_categories: {
    key: "accounting_categories",
    tab: "accounting",
    table: "accounting_categories",
    finance: true,
    fields: [
      { key: "name", column: "name", label: "Name", type: "text", required: true, minLength: 2, maxLength: 80 },
      { key: "type", column: "type", label: "Type", type: "select", required: true, createOnly: true, options: ["income", "expense"] },
    ],
  },
  ministries: {
    key: "ministries",
    tab: "ministries",
    table: "ministries",
    fields: [
      { key: "title", column: "title", label: "Ministry title", type: "text", required: true, minLength: 2, maxLength: 120 },
      { key: "type", column: "type", label: "Type", type: "text", maxLength: 80 },
      { key: "managedBy", column: "managed_by", label: "Managed by", type: "leader" },
      { key: "vision", column: "vision", label: "Vision", type: "longtext" },
      { key: "mission", column: "mission", label: "Mission", type: "longtext" },
      { key: "startedOn", column: "started_on", label: "Started on", type: "date" },
      { key: "futurePlans", column: "future_plans", label: "Future plans", type: "longtext" },
    ],
  },
  worship: {
    key: "worship",
    tab: "worship",
    table: "worship_team_members",
    fields: [
      { key: "memberId", column: "member_id", label: "Member", type: "member", required: true, createOnly: true },
      { key: "role", column: "role", label: "Role", type: "text", required: true, minLength: 2, maxLength: 80 },
      { key: "notes", column: "notes", label: "Notes", type: "longtext" },
    ],
  },
  media: {
    key: "media",
    tab: "media",
    table: "media_team_members",
    fields: [
      { key: "memberId", column: "member_id", label: "Member", type: "member", required: true, createOnly: true },
      { key: "role", column: "role", label: "Role", type: "text", required: true, minLength: 2, maxLength: 80 },
      { key: "notes", column: "notes", label: "Notes", type: "longtext" },
    ],
  },
  offerings: {
    key: "offerings",
    tab: "offerings",
    table: "offerings",
    finance: true,
    createdBy: "recorded_by",
    fields: [
      { key: "category", column: "category", label: "Category", type: "text", required: true, minLength: 2, maxLength: 80 },
      { key: "amount", column: "amount", label: "Amount", type: "amount", required: true },
      { key: "collectedOn", column: "collected_on", label: "Date", type: "date", required: true, noFuture: true },
      { key: "branchId", column: "branch_id", label: "Branch", type: "branch" },
      { key: "notes", column: "notes", label: "Notes", type: "longtext" },
    ],
  },
  donations: {
    key: "donations",
    tab: "donations",
    table: "donations",
    finance: true,
    createdBy: "recorded_by",
    fields: [
      { key: "memberId", column: "member_id", label: "Member", type: "member" },
      { key: "donorName", column: "donor_name", label: "Donor name", type: "text", maxLength: 120 },
      { key: "amount", column: "amount", label: "Amount", type: "amount", required: true },
      { key: "donatedOn", column: "donated_on", label: "Date", type: "date", required: true, noFuture: true },
      { key: "method", column: "method", label: "Method", type: "select", options: DONATION_METHODS },
      { key: "fundraiserId", column: "fundraiser_id", label: "Fundraiser", type: "fundraiser" },
      { key: "notes", column: "notes", label: "Notes", type: "longtext" },
    ],
    crossCheck: (row) => (row.member_id || row.donor_name ? null : "Select a member or enter a donor name."),
  },
  fundraisers: {
    key: "fundraisers",
    tab: "fundraisers",
    table: "fundraisers",
    finance: true,
    createdBy: "created_by",
    fields: [
      { key: "title", column: "title", label: "Title", type: "text", required: true, minLength: 2, maxLength: 120 },
      { key: "description", column: "description", label: "Description", type: "longtext" },
      { key: "goalAmount", column: "goal_amount", label: "Goal amount", type: "amount", required: true },
      { key: "branchId", column: "branch_id", label: "Branch", type: "branch" },
      { key: "managedBy", column: "managed_by", label: "Managed by", type: "leader" },
      { key: "startDate", column: "start_date", label: "Start date", type: "date" },
      { key: "endDate", column: "end_date", label: "End date", type: "date" },
      { key: "status", column: "status", label: "Status", type: "select", options: FUNDRAISER_STATUSES },
    ],
    crossCheck: (row) => (row.start_date && row.end_date && String(row.end_date) < String(row.start_date) ? "End date can't be before the start date." : null),
  },
};

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MODULES, value);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Turns a request's fields into the database row for [spec], or says what's
// wrong. Unknown fields are dropped; empty optional fields become null. On an
// update, fields marked createOnly are left alone.
export function parseModuleInput(
  spec: ModuleSpec,
  input: Record<string, unknown>,
  mode: "create" | "update",
  todayKey: string,
): { row: Record<string, unknown> } | { error: string } {
  const row: Record<string, unknown> = {};

  for (const field of spec.fields) {
    if (mode === "update" && field.createOnly) continue;
    const raw = typeof input[field.key] === "string" ? (input[field.key] as string).trim() : typeof input[field.key] === "number" ? String(input[field.key]) : "";

    if (!raw) {
      if (field.required) return { error: `${field.label} is required.` };
      row[field.column] = null;
      continue;
    }

    switch (field.type) {
      case "text":
      case "longtext": {
        const max = field.maxLength ?? (field.type === "longtext" ? 2000 : 200);
        if (field.minLength && raw.length < field.minLength) return { error: `${field.label} must be at least ${field.minLength} characters.` };
        if (raw.length > max) return { error: `${field.label} must be at most ${max} characters.` };
        row[field.column] = raw;
        break;
      }
      case "date": {
        if (!DATE.test(raw) || Number.isNaN(Date.parse(raw))) return { error: `${field.label} isn't a valid date.` };
        if (field.noFuture && raw > todayKey) return { error: `${field.label} can't be in the future.` };
        row[field.column] = raw;
        break;
      }
      case "amount": {
        const amount = Number(raw);
        if (Number.isNaN(amount) || amount <= 0) return { error: `${field.label} must be greater than 0.` };
        if (amount > 1_000_000_000) return { error: `${field.label} is too large.` };
        row[field.column] = Math.round(amount * 100) / 100;
        break;
      }
      case "select": {
        if (!field.options?.includes(raw)) return { error: `${field.label} isn't valid.` };
        row[field.column] = raw;
        break;
      }
      default: {
        if (!UUID.test(raw)) return { error: `${field.label} isn't valid.` };
        row[field.column] = raw;
      }
    }
  }

  const crossError = spec.crossCheck?.(row);
  return crossError ? { error: crossError } : { row };
}
