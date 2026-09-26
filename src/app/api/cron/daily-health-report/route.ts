import { NextResponse } from "next/server";
import { buildDailyHealthReport } from "@/lib/platform-admin/daily-report";
import { sendBulkEmail } from "@/lib/email/client";
import { isEmailConfigured } from "@/lib/email/env";
import { logPlatformEvent } from "@/lib/platform-events/log";

// Vercel Cron hits this at 30 4 * * * UTC = 10:00 AM IST every day (see
// vercel.json) — no user session exists on a cron-triggered request, so
// this checks CRON_SECRET (the same pattern as
// src/app/api/instagram/cron/refresh-tokens) rather than
// requirePlatformAdmin(), which needs a signed-in user.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const recipient = process.env.HEALTH_REPORT_EMAIL;
  if (!recipient) {
    return NextResponse.json({ error: "HEALTH_REPORT_EMAIL is not set." }, { status: 500 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "Email sending is not configured." }, { status: 500 });
  }

  const { subject, html, issueCount } = await buildDailyHealthReport();

  const result = await sendBulkEmail({
    fromName: "KingdomFlow Monitoring",
    subject,
    html,
    recipients: [recipient],
  });

  if (result.failed.length > 0) {
    await logPlatformEvent({
      level: "warning",
      source: "platform_admin",
      message: `Daily health report email failed to send: ${result.failed[0]?.error ?? "unknown error"}`,
    });
  }

  return NextResponse.json({ sent: result.sentCount, failed: result.failed, issueCount });
}
