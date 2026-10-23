import { NextResponse } from "next/server";
import { withAdminScope } from "@/lib/admin-app/auth";
import { getAllTenants, getTenantUsage } from "@/lib/platform-admin/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBibleSchoolAccess } from "@/lib/lms/access";
import { getLiveStreamAccess } from "@/lib/livestream/access";
import { isPlanId, PLANS } from "@/lib/plans/config";
import { logPlatformEvent } from "@/lib/platform-events/log";

export const dynamic = "force-dynamic";

// The list of churches, or one church's details with ?id=.
export const GET = (request: Request) =>
  withAdminScope(request, "churches", async () => {
    const id = new URL(request.url).searchParams.get("id");
    if (!id)
      return NextResponse.json({ ok: true, churches: await getAllTenants() });
    if (!/^[0-9a-f-]{36}$/i.test(id))
      return NextResponse.json(
        { ok: false, error: "That church could not be found." },
        { status: 404 },
      );
    const usage = await getTenantUsage(id);
    if (!usage)
      return NextResponse.json(
        { ok: false, error: "That church could not be found." },
        { status: 404 },
      );
    const { data: listing } = await createAdminClient()
      .from("organizations")
      .select("landing_listed")
      .eq("id", id)
      .maybeSingle();
    const [bibleSchool, liveStream] = await Promise.all([
      getBibleSchoolAccess(id),
      getLiveStreamAccess(id),
    ]);
    return NextResponse.json({
      ok: true,
      church: usage,
      landingListed: listing?.landing_listed === true,
      bibleSchool: { enabled: bibleSchool.enabled, requested: Boolean(bibleSchool.requestedAt) },
      liveStream: { enabled: liveStream.enabled, requested: Boolean(liveStream.requestedAt) },
      plans: Object.values(PLANS).map((p) => ({ id: p.id, name: p.name })),
    });
  });

const fail = (error: string, status = 400) =>
  NextResponse.json({ ok: false, error }, { status });

// POST {id, action}: extend_trial {days}, set_plan {planId} (comps a plan for free), landing_listed {listed},
// bible_school {enabled}, live_stream {enabled}.
export const POST = (request: Request) =>
  withAdminScope(request, "churches", async (caller) => {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return fail("Invalid request.");
    }
    const id = typeof body.id === "string" ? body.id : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("That church could not be found.", 404);
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select("id, name, trial_ends_at")
      .eq("id", id)
      .maybeSingle();
    if (!org) return fail("That church could not be found.", 404);

    switch (body.action) {
      case "extend_trial": {
        const days = Number(body.days);
        if (!Number.isFinite(days) || days <= 0 || days > 3650)
          return fail("Enter a number of days greater than 0.");
        // Adds to whichever is later: now, or the trial's current end.
        const base =
          org.trial_ends_at && new Date(org.trial_ends_at) > new Date()
            ? new Date(org.trial_ends_at)
            : new Date();
        const next = new Date(base.getTime() + days * 86_400_000);
        const { error } = await admin
          .from("organizations")
          .update({ trial_ends_at: next.toISOString() })
          .eq("id", id);
        if (error) return fail("Couldn't extend that trial. Please try again.");
        await logPlatformEvent({
          level: "info",
          source: "platform_admin",
          message: `Platform admin (${caller.email}) extended trial by ${days} days (admin app)`,
          organizationId: id,
          metadata: { days, newTrialEndsAt: next.toISOString() },
        });
        return NextResponse.json({ ok: true, message: `Trial now ends ${next.toDateString()}.` });
      }
      case "set_plan": {
        const planId = String(body.planId ?? "");
        if (!isPlanId(planId)) return fail("Select a valid plan.");
        const { error } = await admin
          .from("organization_subscriptions")
          .upsert({ organization_id: id, plan_id: planId, status: "active" }, { onConflict: "organization_id" });
        if (error) return fail("Couldn't update that church's plan. Please try again.");
        await admin.from("organizations").update({ plan: planId }).eq("id", id);
        await logPlatformEvent({
          level: "info",
          source: "platform_admin",
          message: `Platform admin (${caller.email}) set tenant plan to ${planId} (admin app)`,
          organizationId: id,
          metadata: { planId },
        });
        return NextResponse.json({ ok: true, message: "Plan updated." });
      }
      case "landing_listed": {
        const { error } = await admin
          .from("organizations")
          .update({ landing_listed: body.listed === true })
          .eq("id", id);
        if (error) return fail("Couldn't save that.");
        return NextResponse.json({ ok: true, message: body.listed === true ? "Listed on the landing page." : "Removed from the landing page." });
      }
      case "bible_school":
      case "live_stream": {
        const enabled = body.enabled === true;
        const now = new Date().toISOString();
        const table = body.action === "bible_school" ? "bible_school_access" : "live_stream_access";
        const { error } = await admin
          .from(table)
          .upsert(
            { organization_id: id, enabled, updated_at: now, ...(enabled ? { enabled_at: now } : {}) },
            { onConflict: "organization_id" },
          );
        if (error) return fail("Couldn't save that.");
        await logPlatformEvent({
          level: "info",
          source: "platform_admin",
          message: `Platform admin (${caller.email}) ${enabled ? "turned on" : "turned off"} ${body.action === "bible_school" ? "Bible School" : "live streaming"} (admin app)`,
          organizationId: id,
        });
        return NextResponse.json({ ok: true, message: enabled ? "Turned on." : "Turned off." });
      }
      default:
        return fail("Unknown action.");
    }
  });
