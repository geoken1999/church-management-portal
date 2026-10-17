import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClientForToken } from "@/lib/supabase/as-user";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import { getReportRows } from "@/lib/reports/dal";
import { buildReportPdf, buildReportWorkbook } from "@/lib/reports/export";
import {
  REPORT_DEFINITIONS,
  getReportDefinition,
  type ReportFilters,
} from "@/lib/reports/registry";

// The staff mobile app's Reports: run a report with filters, and download it as
// Excel or PDF. Same definitions, permissions (the Reports tab AND the tab the
// data belongs to) and data rules as the web, and the query runs as the person,
// so Row Level Security applies.
export async function GET(request: Request) {
  const organizationId =
    new URL(request.url).searchParams.get("organizationId") ?? "";
  const auth = await requireMobileTabAccess(
    request,
    organizationId,
    "reports",
    "read",
  );
  if (auth instanceof NextResponse) return auth;

  // Only the reports whose data this person may read.
  const available = [];
  for (const definition of REPORT_DEFINITIONS) {
    const access = await requireMobileTabAccess(
      request,
      organizationId,
      definition.tab,
      "read",
    );
    if (!(access instanceof NextResponse))
      available.push({
        id: definition.id,
        label: definition.label,
        description: definition.description,
        filters: definition.filters,
        columns: definition.columns,
      });
  }
  const admin = createAdminClient();
  const { data: branches } = await admin
    .from("branches")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name");
  return NextResponse.json({
    ok: true,
    reports: available,
    branches: branches ?? [],
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  const text = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string) : "";
  const organizationId = text("organizationId");
  const definition = getReportDefinition(text("reportId"));
  if (!definition)
    return NextResponse.json(
      { ok: false, error: "Unknown report." },
      { status: 400 },
    );

  const reports = await requireMobileTabAccess(
    request,
    organizationId,
    "reports",
    "read",
  );
  if (reports instanceof NextResponse) return reports;
  const access = await requireMobileTabAccess(
    request,
    organizationId,
    definition.tab,
    "read",
  );
  if (access instanceof NextResponse) return access;

  const f = (body.filters ?? {}) as Record<string, unknown>;
  const clean = (value: unknown) =>
    typeof value === "string" && value ? value : undefined;
  const filters: ReportFilters = {
    branchId: clean(f.branchId),
    status: clean(f.status),
    method: clean(f.method),
    from: clean(f.from),
    to: clean(f.to),
  };

  const token = (request.headers.get("authorization") ?? "").slice(
    "Bearer ".length,
  );
  const rows = await getReportRows(
    organizationId,
    definition.id,
    filters,
    createClientForToken(token),
  );

  const format = text("format");
  if (format === "excel" || format === "pdf") {
    const admin = createAdminClient();
    const { data: organization } = await admin
      .from("organizations")
      .select("name, slug")
      .eq("id", organizationId)
      .maybeSingle();
    const slug = organization?.slug ?? "report";
    const bytes =
      format === "excel"
        ? buildReportWorkbook(definition, rows)
        : buildReportPdf(definition, rows, organization?.name ?? "Report");
    return NextResponse.json({
      ok: true,
      base64: Buffer.from(bytes).toString("base64"),
      filename: `${slug}-${definition.id}-report.${format === "excel" ? "xlsx" : "pdf"}`,
    });
  }
  return NextResponse.json({
    ok: true,
    rows: rows.slice(0, 1000),
    total: rows.length,
  });
}
