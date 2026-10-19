import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createProgramOrder, checkoutUrl } from "@/lib/lms/payments";

// The app (or web portal) asks to pay for a course: the signed-in member or student gets a checkout
// address to open. The person is worked out from the session token, never from the request body.
export async function POST(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(
    /^Bearer /,
    "",
  );
  if (!token)
    return NextResponse.json(
      { ok: false, error: "Missing session." },
      { status: 401 },
    );
  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user)
    return NextResponse.json(
      { ok: false, error: "That session could not be verified." },
      { status: 401 },
    );

  let programId = "";
  try {
    const body = await request.json();
    programId = typeof body.programId === "string" ? body.programId : "";
  } catch {
    /* handled below */
  }
  if (!/^[0-9a-f-]{36}$/i.test(programId))
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );

  const { data: program } = await admin
    .from("lms_programs")
    .select("organization_id")
    .eq("id", programId)
    .maybeSingle();
  if (!program)
    return NextResponse.json({
      ok: false,
      error: "That program could not be found.",
    });

  const { data: member } = await admin
    .from("members")
    .select("id, first_name, last_name, email, phone, status")
    .eq("organization_id", program.organization_id)
    .eq("auth_user_id", userData.user.id)
    .in("status", ["active", "student"])
    .maybeSingle();
  if (!member)
    return NextResponse.json({
      ok: false,
      error: "You need to be a member or student of this church.",
    });

  const order = await createProgramOrder({
    organizationId: program.organization_id,
    programId,
    memberId: member.id,
    payer: {
      name: `${member.first_name} ${member.last_name}`.trim(),
      email: member.email,
      phone: member.phone,
    },
  });
  if (order.error || !order.orderId)
    return NextResponse.json({ ok: false, error: order.error });
  return NextResponse.json({ ok: true, url: checkoutUrl(order.orderId) });
}
