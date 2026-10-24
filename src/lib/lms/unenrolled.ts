import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { enrolPaidOrder } from "@/lib/lms/payments";

// Bible School program fees that were paid but whose student was not enrolled. The payment goes through first and
// the enrolment second, so a failure in between (a database error, a rule that stopped the enrolment) leaves a church
// with the money taken and the student outside the program. These are listed for Super Admin to retry.

export interface UnenrolledOrder {
  id: string;
  churchName: string;
  programTitle: string;
  payerName: string;
  payerPhone: string | null;
  payerEmail: string | null;
  amount: number;
  paidAt: string | null;
  kind: "application" | "member";
  /** Why it counts as not enrolled. */
  reason: string;
}

export async function getPaidButNotEnrolled(): Promise<UnenrolledOrder[]> {
  const admin = createAdminClient();
  const { data: orders } = await admin
    .from("lms_payment_orders")
    .select("id, organization_id, program_id, member_id, application_id, amount, payer_name, payer_email, payer_phone, paid_at")
    .eq("status", "paid")
    .not("program_id", "is", null)
    .order("paid_at", { ascending: false })
    .limit(500);
  const paid = orders ?? [];
  if (paid.length === 0) return [];

  const applicationIds = paid.map((o) => o.application_id).filter((id): id is string => Boolean(id));
  const memberIds = paid.map((o) => o.member_id).filter((id): id is string => Boolean(id));
  const programIds = [...new Set(paid.map((o) => o.program_id as string))];
  const orgIds = [...new Set(paid.map((o) => o.organization_id))];
  const [{ data: applications }, { data: enrollments }, { data: programs }, { data: orgs }] = await Promise.all([
    applicationIds.length ? admin.from("lms_student_applications").select("id, status").in("id", applicationIds) : Promise.resolve({ data: [] }),
    memberIds.length
      ? admin.from("lms_program_enrollments").select("member_id, program_id, status").in("member_id", memberIds).in("status", ["approved", "active", "completed", "withdrawn"])
      : Promise.resolve({ data: [] }),
    admin.from("lms_programs").select("id, title").in("id", programIds),
    admin.from("organizations").select("id, name").in("id", orgIds),
  ]);
  const applicationStatus = new Map((applications ?? []).map((a) => [a.id, a.status]));
  const enrolled = new Set((enrollments ?? []).map((e) => `${e.member_id}:${e.program_id}`));
  const programTitle = new Map((programs ?? []).map((p) => [p.id, p.title]));
  const churchName = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  const rows: UnenrolledOrder[] = [];
  for (const o of paid) {
    let reason: string | null = null;
    if (o.application_id) {
      const status = applicationStatus.get(o.application_id);
      if (status !== "approved") reason = `The application is ${status ?? "missing"}, not approved.`;
    } else if (o.member_id) {
      if (!enrolled.has(`${o.member_id}:${o.program_id}`)) reason = "The member isn't enrolled in the program.";
    } else {
      reason = "The order has no member or application to enrol.";
    }
    if (!reason) continue;
    rows.push({
      id: o.id,
      churchName: churchName.get(o.organization_id) ?? "Church",
      programTitle: programTitle.get(o.program_id as string) ?? "Program",
      payerName: o.payer_name,
      payerPhone: o.payer_phone,
      payerEmail: o.payer_email,
      amount: Number(o.amount),
      paidAt: o.paid_at,
      kind: o.application_id ? "application" : "member",
      reason,
    });
  }
  return rows;
}

/** Tries the enrolment again for one paid order. */
export async function retryEnrolment(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("lms_payment_orders")
    .select("id, organization_id, program_id, member_id, application_id, payer_name, payer_email, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status !== "paid") return { ok: false, error: "That paid order could not be found." };
  const [{ data: program }, { data: org }] = await Promise.all([
    order.program_id ? admin.from("lms_programs").select("title").eq("id", order.program_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("organizations").select("name").eq("id", order.organization_id).maybeSingle(),
  ]);
  const result = await enrolPaidOrder(order, program?.title ?? null, org?.name ?? "the church");
  return result.error ? { ok: false, error: result.error } : { ok: true };
}
