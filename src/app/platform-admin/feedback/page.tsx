import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FeedbackList, type FeedbackItem } from "@/components/feedback/FeedbackList";
import { FEEDBACK_CATEGORIES, FEEDBACK_LABELS, FEEDBACK_SOURCES } from "@/lib/feedback/validation";

export const metadata: Metadata = { title: "Feedback | KingdomFlow Super Admin" };
export const dynamic = "force-dynamic";

const STATUSES = ["new", "reviewed", "archived"] as const;
const SOURCE_LABELS: Record<string, string> = { web: "Web", android: "Android", ios: "iPhone" };

export default async function PlatformAdminFeedbackPage({ searchParams }: { searchParams: Promise<{ source?: string; category?: string; status?: string }> }) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const source = (FEEDBACK_SOURCES as readonly string[]).includes(params.source ?? "") ? params.source! : "";
  const category = (FEEDBACK_CATEGORIES as readonly string[]).includes(params.category ?? "") ? params.category! : "";
  const status = (STATUSES as readonly string[]).includes(params.status ?? "") ? params.status! : "";

  const admin = createAdminClient();
  let query = admin.from("app_feedback").select("*").order("created_at", { ascending: false }).limit(200);
  if (source) query = query.eq("source", source as "web");
  if (category) query = query.eq("category", category as "idea");
  if (status) query = query.eq("status", status as "new");
  const { data: rows } = await query;

  const orgIds = [...new Set((rows ?? []).map((r) => r.organization_id).filter((id): id is string => !!id))];
  const { data: orgs } = orgIds.length ? await admin.from("organizations").select("id, name").in("id", orgIds) : { data: [] };
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  // Averages over everything (not just the filtered page), per source.
  const { data: all } = await admin.from("app_feedback").select("source, rating, status").limit(5000);
  const stat = (src?: string) => {
    const list = (all ?? []).filter((r) => !src || r.source === src);
    return { count: list.length, avg: list.length ? list.reduce((sum, r) => sum + r.rating, 0) / list.length : 0 };
  };
  const unread = (all ?? []).filter((r) => r.status === "new").length;

  const items: FeedbackItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    source: r.source,
    rating: r.rating,
    category: r.category,
    message: r.message,
    status: r.status,
    userName: r.user_name,
    userEmail: r.user_email,
    role: r.role,
    church: r.organization_id ? (orgName.get(r.organization_id) ?? null) : null,
    screen: r.screen,
    appVersion: r.app_version,
    device: r.device,
    createdAt: r.created_at,
  }));

  const href = (patch: Record<string, string>) => {
    const next = new URLSearchParams({ ...(source && { source }), ...(category && { category }), ...(status && { status }), ...patch });
    for (const [k, v] of [...next]) if (!v) next.delete(k);
    const qs = next.toString();
    return qs ? `/platform-admin/feedback?${qs}` : "/platform-admin/feedback";
  };
  const chip = (label: string, active: boolean, to: string) => (
    <Link key={label} href={to} className={`rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent"}`}>
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Feedback</h1>
        <p className="mt-1 text-muted-foreground">What people send from inside the web app and the mobile apps. A rating of 1 or 2 also emails you straight away.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "All", ...stat() },
          { label: "Web", ...stat("web") },
          { label: "Android", ...stat("android") },
          { label: "iPhone", ...stat("ios") },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="font-heading text-2xl font-bold">{s.count ? s.avg.toFixed(1) : "–"}<span className="text-sm font-normal text-muted-foreground"> / 5</span></p>
            <p className="text-xs text-muted-foreground">{s.count} {s.count === 1 ? "response" : "responses"}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {chip(`New (${unread})`, status === "new", href({ status: "new" }))}
          {chip("Reviewed", status === "reviewed", href({ status: "reviewed" }))}
          {chip("Archived", status === "archived", href({ status: "archived" }))}
          {chip("Any status", !status, href({ status: "" }))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FEEDBACK_SOURCES.map((s) => chip(SOURCE_LABELS[s], source === s, href({ source: source === s ? "" : s })))}
          <span className="px-1 text-muted-foreground">·</span>
          {FEEDBACK_CATEGORIES.map((c) => chip(FEEDBACK_LABELS[c], category === c, href({ category: category === c ? "" : c })))}
        </div>
      </div>

      <FeedbackList items={items} />
    </div>
  );
}
