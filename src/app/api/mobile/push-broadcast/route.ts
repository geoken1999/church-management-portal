import { NextResponse } from "next/server";
import { requireMobileAdmin } from "@/lib/mobile/staff-auth";
import { sendBroadcast } from "@/lib/push/broadcast";

// The staff mobile app's Configuration > Notifications: an owner or admin
// sends a push to the whole church, a branch, a group or one person.
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

  const auth = await requireMobileAdmin(request, text("organizationId"));
  if (auth instanceof NextResponse) return auth;

  const result = await sendBroadcast({
    organizationId: text("organizationId"),
    userId: auth.userId,
    audienceType: text("audience"),
    groupKey: text("groupKey"),
    memberId: text("memberId"),
    branchId: text("branchId"),
    title: text("title"),
    body: text("message"),
    linkUrl: text("linkUrl"),
    buttonLabel: text("buttonLabel"),
    pin: body.pin === true,
  });
  if (result.error)
    return NextResponse.json({ ok: false, error: result.error });
  return NextResponse.json({ ok: true, sent: result.sent });
}
