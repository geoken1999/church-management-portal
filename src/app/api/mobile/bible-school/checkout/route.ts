import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCourseOrder, checkoutUrl } from "@/lib/lms/payments";

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

  let courseId = "";
  try {
    const body = await request.json();
    courseId = typeof body.courseId === "string" ? body.courseId : "";
  } catch {
    /* handled below */
  }
  if (!/^[0-9a-f-]{36}$/i.test(courseId))
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );

  const { data: course } = await admin
    .from("lms_courses")
    .select("organization_id")
    .eq("id", courseId)
    .maybeSingle();
  if (!course)
    return NextResponse.json({
      ok: false,
      error: "That course could not be found.",
    });

  const { data: member } = await admin
    .from("members")
    .select("id, first_name, last_name, email, phone, status")
    .eq("organization_id", course.organization_id)
    .eq("auth_user_id", userData.user.id)
    .in("status", ["active", "student"])
    .maybeSingle();
  if (!member)
    return NextResponse.json({
      ok: false,
      error: "You need to be a member or student of this church.",
    });

  const order = await createCourseOrder({
    organizationId: course.organization_id,
    courseId,
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
