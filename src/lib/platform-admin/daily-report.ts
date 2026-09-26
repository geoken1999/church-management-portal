import "server-only";

import { getPlatformOverview, getPlatformEvents, getDatabaseHealth, getPlatformStorageStats } from "@/lib/platform-admin/dal";
import { getLatestProductionDeployment } from "@/lib/platform-admin/vercel";
import { getSupabaseProjectStatus } from "@/lib/platform-admin/supabase-management";
import { getPortalResponseTime } from "@/lib/platform-admin/portal-speed";
import { getIntegrationHealth } from "@/lib/platform-admin/integration-health";
import { formatBytes } from "@/lib/plans/format";

// Every value interpolated below either comes from our own DB (tenant
// counts, logged error messages) or a third-party API response (Vercel's
// deployment state, Supabase's service names) — none of it is
// organizer-authored the way an event/form title is, but it's still
// escaped before going into the email the same way, since a logged error
// message could in principle contain anything (e.g. a raw exception
// message echoing back malformed user input from wherever it was thrown).
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const STATUS_COLORS: Record<string, string> = {
  operational: "#16a34a",
  degraded: "#d97706",
  down: "#dc2626",
  unconfigured: "#6b7280",
};

function statusBadge(status: string, label: string): string {
  const color = STATUS_COLORS[status] ?? "#6b7280";
  return `<span style="display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; color:#fff; background:${color};">${escapeHtml(label)}</span>`;
}

function row(label: string, valueHtml: string): string {
  return `<tr><td style="padding:6px 0; color:#666; font-size:13px;">${escapeHtml(label)}</td><td style="padding:6px 0; text-align:right; font-size:13px;">${valueHtml}</td></tr>`;
}

export interface DailyHealthReport {
  subject: string;
  html: string;
  issueCount: number;
}

// Pulls together every check already built for the platform-admin Health
// page (src/app/platform-admin/health/page.tsx) into a single emailed
// snapshot, rather than duplicating any of that logic — this is the same
// data, just rendered as an email instead of a dashboard, run once a day
// instead of on every page view.
export async function buildDailyHealthReport(): Promise<DailyHealthReport> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [overview, errors, dbHealth, storageStats, deployment, supabaseStatus, portalSpeed, integrations] = await Promise.all([
    getPlatformOverview(),
    getPlatformEvents({ level: "error", since, limit: 50 }),
    getDatabaseHealth(),
    getPlatformStorageStats(),
    getLatestProductionDeployment(),
    getSupabaseProjectStatus(),
    getPortalResponseTime(),
    getIntegrationHealth(),
  ]);

  const dateLabel = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const issues: string[] = [];
  if (!portalSpeed.reachable) issues.push("Portal is unreachable");
  if (deployment.configured && (deployment.state === "ERROR" || deployment.state === "BLOCKED")) {
    issues.push(`Production deployment is ${deployment.state}`);
  }
  if (!dbHealth.reachable) issues.push("Database is unreachable");
  if (supabaseStatus.services?.some((s) => !s.healthy)) issues.push("A Supabase service is reporting unhealthy");
  for (const integration of integrations) {
    if (integration.status === "down") issues.push(`${integration.name} is down`);
  }
  if (errors.length > 0) issues.push(`${errors.length} error${errors.length === 1 ? "" : "s"} logged in the last 24 hours`);

  const summaryHtml =
    issues.length === 0
      ? `<div style="padding:14px 16px; border-radius:8px; background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; font-weight:600; font-size:14px;">✅ All systems operational</div>`
      : `<div style="padding:14px 16px; border-radius:8px; background:#fef2f2; border:1px solid #fecaca; color:#991b1b;">
           <p style="margin:0 0 6px; font-weight:600; font-size:14px;">⚠️ ${issues.length} issue${issues.length === 1 ? "" : "s"} need attention</p>
           <ul style="margin:0; padding-left:18px; font-size:13px;">${issues.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
         </div>`;

  const overviewRows = [
    row("Total tenants", `<strong>${overview.totalTenants}</strong>`),
    row("Active subscriptions", `<strong>${overview.activeSubscriptions}</strong>`),
    row("Trialing", `<strong>${overview.trialingCount}</strong>`),
    row("Expired", `<strong>${overview.expiredCount}</strong>`),
    row("New tenants (last 7 days)", `<strong>${overview.newTenantsLast7Days}</strong>`),
    row("Total logins across tenants", `<strong>${overview.totalMembers}</strong>`),
  ].join("");

  const infraRows: string[] = [
    row("Portal", portalSpeed.reachable ? `${portalSpeed.responseTimeMs}ms` : statusBadge("down", "Unreachable")),
    row("Database", dbHealth.reachable ? `${dbHealth.latencyMs}ms` : statusBadge("down", "Unreachable")),
  ];
  if (storageStats) {
    infraRows.push(row("Database size", formatBytes(storageStats.databaseBytes)));
    infraRows.push(row("File storage (all tenants)", formatBytes(storageStats.fileStorageBytes)));
  }
  if (deployment.configured) {
    infraRows.push(row("Production deployment", escapeHtml(deployment.state ?? "—")));
  }
  if (supabaseStatus.configured && supabaseStatus.services) {
    for (const service of supabaseStatus.services) {
      infraRows.push(row(`Supabase ${service.name}`, statusBadge(service.healthy ? "operational" : "down", service.healthy ? "Healthy" : "Unhealthy")));
    }
  }

  const integrationRows = integrations
    .map((i) => row(i.name, statusBadge(i.status, i.status.charAt(0).toUpperCase() + i.status.slice(1))))
    .join("");

  const errorsHtml =
    errors.length === 0
      ? `<p style="color:#666; font-size:13px; margin:0;">No errors logged in the last 24 hours.</p>`
      : `${errors
          .slice(0, 15)
          .map(
            (e) => `
        <div style="padding:8px 0; border-bottom:1px solid #f0f0f0;">
          <p style="margin:0; font-size:13px;">${escapeHtml(e.message)}</p>
          <p style="margin:2px 0 0; font-size:11px; color:#999;">${escapeHtml(e.source)} &middot; ${new Date(e.created_at).toLocaleString()}</p>
        </div>`,
          )
          .join("")}${errors.length > 15 ? `<p style="margin-top:8px; font-size:12px; color:#999;">+ ${errors.length - 15} more</p>` : ""}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
      <h1 style="font-size:20px; margin:0 0 4px;">KingdomFlow — Daily System Health Report</h1>
      <p style="margin:0 0 16px; color:#666; font-size:13px;">${dateLabel} &middot; 10:00 AM IST</p>

      ${summaryHtml}

      <h2 style="font-size:15px; margin:24px 0 8px;">Platform overview</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">${overviewRows}</table>

      <h2 style="font-size:15px; margin:24px 0 8px;">Infrastructure</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">${infraRows.join("")}</table>

      <h2 style="font-size:15px; margin:24px 0 8px;">Integrations</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">${integrationRows}</table>

      <h2 style="font-size:15px; margin:24px 0 8px;">Errors (last 24 hours)</h2>
      ${errorsHtml}

      <p style="margin-top:32px; font-size:11px; color:#bbb; text-align:center;">Sent automatically every day at 10:00 AM IST — KingdomFlow platform monitoring.</p>
    </div>
  `;

  const subject =
    issues.length === 0
      ? "✅ KingdomFlow daily health report — all systems operational"
      : `⚠️ KingdomFlow daily health report — ${issues.length} issue${issues.length === 1 ? "" : "s"} to review`;

  return { subject, html, issueCount: issues.length };
}
