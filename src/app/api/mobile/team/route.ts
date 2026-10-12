import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMobileAdmin } from "@/lib/mobile/staff-auth";
import { generatePassword } from "@/lib/auth/password";
import { validateName, validatePhone } from "@/lib/auth/validation";
import { TAB_KEYS } from "@/lib/permissions/tabs";
import { checkTeamMemberQuota, getPlanUsage } from "@/lib/plans/dal";
import type { OrganizationRole, TabPermissions } from "@/types/database";

// The staff mobile app's Team: who has access, new logins and what a team member
// can do. Owner and admin only, with the same seat limits and rules as the web.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readPermissions(raw: unknown): TabPermissions {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const result: TabPermissions = {};
  for (const tab of TAB_KEYS) {
    result[tab] = { read: source[tab]?.read === true, write: source[tab]?.write === true, delete: source[tab]?.delete === true };
  }
  return result;
}

export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
  const auth = await requireMobileAdmin(request, organizationId);
  if (auth instanceof NextResponse) return auth;
  const admin = createAdminClient();
  const [{ data }, usage] = await Promise.all([
    admin
      .from("organization_members")
      .select("id, role, title, auth_user_id, tab_permissions, profiles!inner(first_name, last_name, email)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    getPlanUsage(organizationId),
  ]);
  const members = (data ?? []).map((m) => {
    const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      id: m.id,
      role: m.role,
      title: m.title,
      isYou: m.auth_user_id === auth.userId,
      name: `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim(),
      email: profile?.email ?? "",
      tabPermissions: m.tab_permissions,
    };
  });
  return NextResponse.json({
    ok: true,
    members,
    seats: {
      plan: usage.plan.name,
      admins: usage.additionalAdmins,
      maxAdmins: usage.plan.maxAdditionalAdmins,
      staff: usage.additionalStaff,
      maxStaff: usage.plan.maxAdditionalStaff,
    },
    tabs: TAB_KEYS,
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : "");
  const organizationId = text("organizationId");
  const auth = await requireMobileAdmin(request, organizationId);
  if (auth instanceof NextResponse) return auth;
  const admin = createAdminClient();

  if (body.action === "create_login") {
    const firstName = text("firstName");
    const lastName = text("lastName");
    const email = text("email").toLowerCase();
    const phone = text("phone");
    const role: OrganizationRole = text("role") === "admin" ? "admin" : "member";
    const problem = validateName(firstName, "First name") ?? validateName(lastName, "Last name") ?? (!EMAIL_RE.test(email) ? "Enter a valid email address." : null) ?? validatePhone(phone);
    if (problem) return NextResponse.json({ ok: false, error: problem });
    const quotaError = await checkTeamMemberQuota(organizationId, role);
    if (quotaError) return NextResponse.json({ ok: false, error: quotaError });

    const password = generatePassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, phone: phone || null },
    });
    if (createError || !created.user) {
      const exists = createError?.message.toLowerCase().includes("already");
      return NextResponse.json({ ok: false, error: exists ? "A user with that email already exists." : "Couldn't create that login. Please try again." });
    }
    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: organizationId,
      auth_user_id: created.user.id,
      role,
      tab_permissions: role === "member" ? readPermissions(body.tabPermissions) : null,
    });
    if (memberError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ ok: false, error: "Couldn't add that user to your organization. Please try again." });
    }
    return NextResponse.json({ ok: true, email, password });
  }

  if (body.action === "permissions") {
    const { error } = await admin
      .from("organization_members")
      .update({ tab_permissions: readPermissions(body.tabPermissions) })
      .eq("id", text("memberId"))
      .eq("organization_id", organizationId)
      .eq("role", "member");
    return NextResponse.json(error ? { ok: false, error: "Couldn't save those permissions." } : { ok: true });
  }

  if (body.action === "remove") {
    const { data: target } = await admin.from("organization_members").select("role, auth_user_id").eq("id", text("memberId")).eq("organization_id", organizationId).maybeSingle();
    if (!target) return NextResponse.json({ ok: false, error: "That person is no longer on the team." });
    if (target.role === "owner") return NextResponse.json({ ok: false, error: "The owner can't be removed." });
    if (target.auth_user_id === auth.userId) return NextResponse.json({ ok: false, error: "You can't remove yourself." });
    const { error } = await admin.from("organization_members").delete().eq("id", text("memberId")).eq("organization_id", organizationId);
    return NextResponse.json(error ? { ok: false, error: "Couldn't remove that person." } : { ok: true });
  }

  return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
}
