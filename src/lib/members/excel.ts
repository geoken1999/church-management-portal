import "server-only";

import * as XLSX from "xlsx";
import { validateMemberBasics, validateMemberDetails, parseCustomFieldValues } from "@/lib/members/validation";
import type { Branch, CustomFieldValue, MaritalStatus, MemberFieldDefinition, MemberStatus } from "@/types/database";

const MEMBER_STATUSES: MemberStatus[] = ["active", "left"];

function columnHeader(definition: MemberFieldDefinition): string {
  let header = definition.label;
  if (definition.field_type === "select" && definition.options?.length) {
    header += ` (${definition.options.join("/")})`;
  } else if (definition.field_type === "checkbox") {
    header += " (Yes/No)";
  } else if (definition.field_type === "date") {
    header += " (YYYY-MM-DD)";
  }
  if (definition.required) header += "*";
  return header;
}

function exampleValue(definition: MemberFieldDefinition): string {
  if (definition.field_type === "select" && definition.options?.length) return definition.options[0];
  if (definition.field_type === "checkbox") return "Yes";
  if (definition.field_type === "date") return "2024-01-01";
  if (definition.field_type === "number") return "1";
  return "";
}

// Generates a per-organization template — column set reflects this org's
// actual branches and custom field definitions, since those vary org to
// org and the uploaded file has to match them to import cleanly.
export function buildMemberTemplate(definitions: MemberFieldDefinition[], branches: Branch[]): ArrayBuffer {
  const headers = [
    "First Name*",
    "Last Name*",
    "Email",
    "Phone",
    "Date of Birth (YYYY-MM-DD)*",
    "Marital Status (Married/Unmarried)*",
    "Wedding Date (YYYY-MM-DD)",
    "Status (Active/Left)",
  ];
  if (branches.length > 0) headers.push("Branch*");
  for (const definition of definitions) headers.push(columnHeader(definition));

  const exampleRow = [
    "Jane",
    "Doe",
    "jane@example.com",
    "+1 555 000 1234",
    "1990-05-15",
    "Unmarried",
    "",
    "Active",
  ];
  if (branches.length > 0) exampleRow.push(branches[0].name);
  for (const definition of definitions) exampleRow.push(exampleValue(definition));

  const membersSheet = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, membersSheet, "Members");

  if (branches.length > 0) {
    const branchSheet = XLSX.utils.aoa_to_sheet([["Available branches"], ...branches.map((b) => [b.name])]);
    XLSX.utils.book_append_sheet(workbook, branchSheet, "Branches");
  }

  const notes = [
    ["How to use this template"],
    ["Row 2 is an example — replace it (or delete it) before importing."],
    ["Columns marked with * are required."],
    ["Dates use YYYY-MM-DD. Yes/No fields accept Yes, No, True, or False."],
    ["Dropdown fields must exactly match one of the options shown in the column header."],
    ["Wedding Date is required only when Marital Status is Married — leave it blank otherwise."],
  ];
  if (branches.length > 0) notes.push(["Branch must exactly match a name from the Branches sheet."]);
  const notesSheet = XLSX.utils.aoa_to_sheet(notes);
  XLSX.utils.book_append_sheet(workbook, notesSheet, "Instructions");

  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export interface ParsedMemberRow {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: MemberStatus;
  branchId: string | null;
  dateOfBirth: string;
  maritalStatus: MaritalStatus;
  weddingDate: string | null;
  customFields: Record<string, CustomFieldValue>;
}

export interface RowError {
  row: number;
  message: string;
}

// Matches a spreadsheet column by prefix rather than exact string, since
// the template appends hints to headers (" (Yes/No)", "*") that a user
// might edit or that vary from what we generated.
function readColumn(record: Record<string, unknown>, headerPrefix: string): string {
  const key = Object.keys(record).find((k) => k.toLowerCase().startsWith(headerPrefix.toLowerCase()));
  return key ? String(record[key] ?? "").trim() : "";
}

function readCheckboxColumn(record: Record<string, unknown>, headerPrefix: string): string {
  const raw = readColumn(record, headerPrefix).toLowerCase();
  return ["yes", "true", "1", "y"].includes(raw) ? "on" : "";
}

export function parseMemberSpreadsheet(
  bytes: ArrayBuffer,
  definitions: MemberFieldDefinition[],
  branches: Branch[],
): { rows: ParsedMemberRow[]; errors: RowError[] } {
  const workbook = XLSX.read(bytes, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const branchIdByName = new Map(branches.map((b) => [b.name.trim().toLowerCase(), b.id]));

  const rows: ParsedMemberRow[] = [];
  const errors: RowError[] = [];

  records.forEach((record, index) => {
    const rowNumber = index + 2; // header is spreadsheet row 1

    const firstName = readColumn(record, "First Name");
    const lastName = readColumn(record, "Last Name");
    const email = readColumn(record, "Email");
    const phone = readColumn(record, "Phone");
    const statusRaw = readColumn(record, "Status").toLowerCase();
    const dateOfBirth = readColumn(record, "Date of Birth");
    const maritalStatusRaw = readColumn(record, "Marital Status").toLowerCase();
    const weddingDate = readColumn(record, "Wedding Date");

    // Skip fully blank rows — trailing empty rows are common in exported
    // spreadsheets and shouldn't surface as errors.
    if (!firstName && !lastName && !email && !phone) return;

    const basicErrors = validateMemberBasics({ firstName, lastName, email, phone });
    const detailErrors = validateMemberDetails({
      dateOfBirth,
      maritalStatus: maritalStatusRaw,
      weddingDate,
    });
    const messages = [
      ...Object.values(basicErrors).filter((v): v is string => Boolean(v)),
      ...Object.values(detailErrors).filter((v): v is string => Boolean(v)),
    ];

    const status: MemberStatus = MEMBER_STATUSES.includes(statusRaw as MemberStatus)
      ? (statusRaw as MemberStatus)
      : "active";

    let branchId: string | null = null;
    if (branches.length > 0) {
      const branchName = readColumn(record, "Branch");
      if (!branchName) {
        messages.push("Branch is required.");
      } else {
        const match = branchIdByName.get(branchName.toLowerCase());
        if (!match) {
          messages.push(`Branch "${branchName}" doesn't match any existing branch.`);
        } else {
          branchId = match;
        }
      }
    }

    const { values: customFields, errors: customErrors } = parseCustomFieldValues(definitions, (key) => {
      const definition = definitions.find((d) => d.key === key);
      if (!definition) return "";
      return definition.field_type === "checkbox"
        ? readCheckboxColumn(record, definition.label)
        : readColumn(record, definition.label);
    });
    messages.push(...Object.values(customErrors));

    if (messages.length > 0) {
      errors.push({ row: rowNumber, message: messages.join(" ") });
      return;
    }

    rows.push({
      rowNumber,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email,
      phone,
      status,
      branchId,
      dateOfBirth,
      maritalStatus: maritalStatusRaw as MaritalStatus,
      weddingDate: maritalStatusRaw === "married" ? weddingDate || null : null,
      customFields,
    });
  });

  return { rows, errors };
}
