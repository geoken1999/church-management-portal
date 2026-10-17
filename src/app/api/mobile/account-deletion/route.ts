import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationForWebhook } from "@/lib/notifications/create";
import { sendPushToUsers } from "@/lib/push/client";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { DeletionRequesterKind } from "@/lib/account-deletion/rules";

// A person asking, from the mobile app, for their account to be deleted.
// Nothing is deleted here: it records a request for an admin to process, and
// tells the admins. The person is identified from their own session token,
// never from anything in the request body.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (!token)
    return NextResponse.json(
      { ok: false, error: "Missing session." },
      { status: 401 },
    );

  let reason: string | null = null;
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body.reason === "string" && body.reason.trim())
      reason = body.reason.trim().slice(0, 500);
  } catch {
    // No body is fine: the reason is optional.
  }

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user)
    return NextResponse.json(
      { ok: false, error: "That session could not be verified." },
      { status: 401 },
    );
  const user = userData.user;

  // Who they are: a church member signed in with their phone, or a team
  // member (and, among those, a church owner).
  let kind: DeletionRequesterKind;
  let organizationId: string | null = null;
  let memberId: string | null = null;
  let displayName = user.email ?? user.phone ?? "Unknown";
  let contact = user.email ?? user.phone ?? null;

  const { data: member } = await admin
    .from("members")
    .select("id, first_name, last_name, organization_id, phone, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (member) {
    kind = "member";
    organizationId = member.organization_id;
    memberId = member.id;
    displayName = `${member.first_name} ${member.last_name}`.trim();
    contact = member.phone ?? member.email ?? contact;
  } else {
    const { data: memberships } = await admin
      .from("organization_members")
      .select("organization_id, role")
      .eq("auth_user_id", user.id);
    if (!memberships || memberships.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No account was found for this sign-in." },
        { status: 404 },
      );
    }
    const owned = memberships.find((m) => m.role === "owner");
    const chosen = owned ?? memberships[0];
    kind = owned ? "owner" : "team";
    organizationId = chosen.organization_id;
    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (profile)
      displayName =
        `${profile.first_name} ${profile.last_name}`.trim() || displayName;
  }

  const { error: insertError } = await admin
    .from("account_deletion_requests")
    .insert({
      auth_user_id: user.id,
      organization_id: organizationId,
      requester_kind: kind,
      member_id: memberId,
      display_name: displayName,
      contact,
      reason,
    });
  if (insertError) {
    // 23505: they already have a request waiting.
    if (insertError.code === "23505")
      return NextResponse.json({ ok: true, alreadyRequested: true });
    console.error(
      "account_deletion_requests insert failed:",
      insertError.message,
    );
    return NextResponse.json(
      { ok: false, error: "Couldn't send your request. Please try again." },
      { status: 500 },
    );
  }

  // Telling the admins is best-effort: the request is saved either way.
  try {
    if (organizationId) {
      const where =
        kind === "owner"
          ? "a platform admin needs to process it"
          : "review it under Members";
      await createNotificationForWebhook({
        organizationId,
        type: "account_deletion_request",
        title: "Account deletion request",
        body: `${displayName} asked to delete their account (${where}).`,
        link: kind === "owner" ? "/dashboard" : "/dashboard/members",
      });
      const { data: team } = await admin
        .from("organization_members")
        .select("auth_user_id, role")
        .eq("organization_id", organizationId)
        .in("role", ["owner", "admin"]);
      await sendPushToUsers(
        (team ?? [])
          .map((row) => row.auth_user_id)
          .filter((id) => id !== user.id),
        "account_deletion",
        {
          title: "Account deletion request",
          body: `${displayName} asked to delete their account.`,
          data: {
            type: "account_deletion_request",
            link: "/dashboard/members",
          },
        },
      );
    }
  } catch (err) {
    await logPlatformEvent({
      level: "warning",
      source: "member_mobile_login",
      message: `Account deletion request saved but notifying admins failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId,
    });
  }

  return NextResponse.json({ ok: true });
}
