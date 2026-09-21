"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";
import { buildMemberTemplate, parseMemberSpreadsheet } from "@/lib/members/excel";

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export interface DownloadTemplateResult {
  error?: string;
  base64?: string;
  filename?: string;
}

export async function downloadMemberTemplate(organizationId: string): Promise<DownloadTemplateResult> {
  await requireUser();

  const supabase = await createClient();
  const [{ data: definitions }, { data: branches }, { data: organization }] = await Promise.all([
    supabase
      .from("member_field_definitions")
      .select("*")
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: true }),
    supabase.from("branches").select("*").eq("organization_id", organizationId),
    supabase.from("organizations").select("slug").eq("id", organizationId).single(),
  ]);

  const bytes = buildMemberTemplate(definitions ?? [], branches ?? []);
  const base64 = Buffer.from(bytes).toString("base64");
  const filename = `${organization?.slug ?? "members"}-members-template.xlsx`;

  return { base64, filename };
}

export interface BulkImportResult {
  error?: string;
  imported?: number;
  rowErrors?: { row: number; message: string }[];
}

export async function bulkImportMembers(organizationId: string, formData: FormData): Promise<BulkImportResult> {
  const user = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an Excel file to upload." };
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { error: "File must be smaller than 5MB." };
  }

  const supabase = await createClient();
  const [{ data: definitions }, { data: branches }] = await Promise.all([
    supabase.from("member_field_definitions").select("*").eq("organization_id", organizationId),
    supabase.from("branches").select("*").eq("organization_id", organizationId),
  ]);

  let parsed: ReturnType<typeof parseMemberSpreadsheet>;
  try {
    const bytes = await file.arrayBuffer();
    parsed = parseMemberSpreadsheet(bytes, definitions ?? [], branches ?? []);
  } catch {
    return { error: "Couldn't read that file. Make sure it's a valid .xlsx file exported from the template." };
  }

  if (parsed.rows.length === 0 && parsed.errors.length === 0) {
    return { error: "No member rows found in that file." };
  }

  const rowErrors: { row: number; message: string }[] = [...parsed.errors];
  let imported = 0;

  // Phone numbers already seen this import — catches duplicates within the
  // uploaded file itself, before they'd otherwise collide in the DB.
  const seenPhones = new Set<string>();

  // Row by row (not a bulk insert) so one bad row can't fail the whole
  // batch — the roster is small enough that N inserts is not a real cost.
  for (const row of parsed.rows) {
    if (row.phone && seenPhones.has(row.phone)) {
      rowErrors.push({ row: row.rowNumber, message: "This phone number is used by another row in this file." });
      continue;
    }

    const { error } = await supabase.from("members").insert({
      organization_id: organizationId,
      first_name: row.firstName,
      last_name: row.lastName,
      email: row.email || null,
      phone: row.phone || null,
      status: row.status,
      branch_id: row.branchId,
      date_of_birth: row.dateOfBirth || null,
      marital_status: row.maritalStatus,
      wedding_date: row.weddingDate,
      custom_fields: row.customFields,
      created_by: user.id,
    });

    if (error) {
      const message =
        error.code === "23505"
          ? "Another member already has this phone number."
          : "Couldn't save this row. Please try again.";
      rowErrors.push({ row: row.rowNumber, message });
    } else {
      if (row.phone) seenPhones.add(row.phone);
      imported += 1;
    }
  }

  revalidatePath("/dashboard/members");
  return { imported, rowErrors };
}
