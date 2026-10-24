import { NextResponse } from "next/server";
import { withCronLogging } from "@/lib/cron/run-logger";
import { sendFeedbackRequests } from "@/lib/visitors/service";

// The day after a first visit, WhatsApp each guest who scanned the church's visitor QR code a link to give
// feedback and say whether they would like a follow-up. Safe to run twice: a message is never sent twice for
// the same visitor (the notice log's unique key), and one that couldn't go (template not approved yet) is
// tried again on the next run for a week.
async function run(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return NextResponse.json(await sendFeedbackRequests());
}

export const GET = withCronLogging("visitor-feedback", run);
