import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanUsage } from "@/lib/plans/dal";
import { createCheckout } from "@/lib/razorpay/platform";
import type { RazorpayCheckout } from "@/lib/razorpay/checkout";
import { getSiteUrl } from "@/lib/site-url";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { pushToTeam } from "@/lib/push/team";
import { isBibleSchoolOpen } from "@/lib/lms/public-school";
import { emailStudentApproved } from "@/lib/lms/student-email";
import { LMS_BASE_PATH } from "@/lib/lms/constants";

// Program fees are collected on KingdomFlow's shared Razorpay account, like paid events, and the church is
// paid out from the Payouts page (2.5% service fee). Enrollment and payment are at program level:
// paying enrolls the person in the program and so in every course of it. The order row is written
// first and is the only thing the return route trusts, after it has verified Razorpay's signature.

export interface OrderResult {
  error?: string;
  orderId?: string;
}

interface OrderInput {
  organizationId: string;
  programId: string;
  payer: { name: string; email: string | null; phone: string | null };
  memberId?: string;
  applicationId?: string;
}

// The address the browser opens to pay: a page that opens the Razorpay payment window.
export function checkoutUrl(orderId: string): string {
  return `${getSiteUrl()}/bible-school/checkout/${orderId}`;
}

export async function createProgramOrder(
  input: OrderInput,
): Promise<OrderResult> {
  try {
    return await buildProgramOrder(input);
  } catch (err) {
    console.error("createProgramOrder failed:", err);
    return { error: "Couldn't start the payment. Please try again." };
  }
}

async function buildProgramOrder(input: OrderInput): Promise<OrderResult> {
  if (!input.memberId && !input.applicationId)
    return { error: "Something went wrong. Please try again." };
  const admin = createAdminClient();

  if (!(await isBibleSchoolOpen(input.organizationId)))
    return { error: "The Bible School isn't open right now." };

  const { data: program } = await admin
    .from("lms_programs")
    .select("id, title, price_amount, capacity, status, visibility")
    .eq("id", input.programId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!program || program.status !== "published")
    return { error: "That program isn't available." };
  const amount = Number(program.price_amount ?? 0);
  if (!(amount > 0)) return { error: "This program is free." };
  if (input.applicationId && program.visibility !== "public")
    return { error: "That program isn't available." };

  const { plan } = await getPlanUsage(input.organizationId);
  if (!plan.financeEnabled)
    return {
      error: "Online payment is temporarily unavailable for this program.",
    };

  if (program.capacity !== null) {
    const { count } = await admin
      .from("lms_program_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id)
      .in("status", ["approved", "active"]);
    if ((count ?? 0) >= program.capacity)
      return { error: "This program is full." };
  }

  if (input.memberId) {
    // A student from outside the church can only buy public programs.
    const { data: buyer } = await admin
      .from("members")
      .select("status")
      .eq("id", input.memberId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    if (!buyer || !["active", "student"].includes(buyer.status))
      return { error: "That program isn't available." };
    if (buyer.status === "student" && program.visibility !== "public")
      return { error: "That program isn't available." };
    const { count } = await admin
      .from("lms_program_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id)
      .eq("member_id", input.memberId)
      .in("status", ["pending", "approved", "active", "completed"]);
    if ((count ?? 0) > 0)
      return { error: "You have already joined this program." };
  }

  const txnid = `lms${Date.now()}${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const { data: order, error } = await admin
    .from("lms_payment_orders")
    .insert({
      organization_id: input.organizationId,
      program_id: program.id,
      member_id: input.memberId ?? null,
      application_id: input.applicationId ?? null,
      amount,
      payu_txnid: txnid,
      payer_name: input.payer.name.slice(0, 120),
      payer_email: input.payer.email,
      payer_phone: input.payer.phone,
    })
    .select("id")
    .single();
  if (error || !order) {
    console.error("lms_payment_orders insert failed:", error?.message);
    return { error: "Couldn't start the payment. Please try again." };
  }
  return { orderId: order.id };
}

export interface CheckoutData {
  title: string;
  organizationName: string;
  amount: number;
  checkout: RazorpayCheckout;
}

// The Razorpay order the checkout page opens, created fresh each time it is opened. Null when the order is
// unknown or has already been paid.
export async function getCheckoutData(
  orderId: string,
): Promise<CheckoutData | null> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("lms_payment_orders")
    .select(
      "id, organization_id, program_id, amount, status, payu_txnid, payer_name, payer_email, payer_phone",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status === "paid") return null;
  const [{ data: program }, { data: org }] = await Promise.all([
    order.program_id
      ? admin
          .from("lms_programs")
          .select("title")
          .eq("id", order.program_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("organizations")
      .select("name")
      .eq("id", order.organization_id)
      .maybeSingle(),
  ]);
  try {
    const checkout = await createCheckout({
      receipt: order.payu_txnid,
      amountRupees: Number(order.amount),
      name: org?.name || "KingdomFlow",
      description: `Program: ${program?.title ?? "Bible School"}`.slice(0, 100),
      prefill: {
        name: order.payer_name,
        email: order.payer_email ?? undefined,
        contact: order.payer_phone ?? undefined,
      },
      callbackUrl: `${getSiteUrl()}/api/razorpay/bible-school/return?orderId=${order.id}`,
      notes: { kind: "bible_school_program", order_id: order.id },
    });
    return {
      title: program?.title ?? "Bible School program",
      organizationName: org?.name ?? "",
      amount: Number(order.amount),
      checkout,
    };
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "bible_school_payment",
      message: `Razorpay order creation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      organizationId: order.organization_id,
      metadata: { orderId },
    });
    return null;
  }
}

export interface FinalizeResult {
  error?: string;
  success?: boolean;
  slug?: string | null;
  kind?: "application" | "member";
}

// Called by the Razorpay return route once it has verified the signature. The status claim ("created" to
// "paid") only matches once, so a replayed return cannot enrol twice.
export async function finalizeProgramPayment(
  txnid: string,
  mihpayid: string,
): Promise<FinalizeResult> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("lms_payment_orders")
    .select(
      "id, organization_id, program_id, member_id, application_id, status, payer_name, payer_email",
    )
    .eq("payu_txnid", txnid)
    .maybeSingle();
  if (!order) return { error: "That payment could not be found." };
  const [{ data: program }, { data: org }] = await Promise.all([
    order.program_id
      ? admin
          .from("lms_programs")
          .select("title")
          .eq("id", order.program_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("organizations")
      .select("name, slug")
      .eq("id", order.organization_id)
      .maybeSingle(),
  ]);
  const base: FinalizeResult = {
    success: true,
    slug: org?.slug ?? null,
    kind: order.application_id ? "application" : "member",
  };
  if (order.status === "paid") return base;

  const now = new Date().toISOString();
  const { data: claimed } = await admin
    .from("lms_payment_orders")
    .update({
      status: "paid",
      payu_mihpayid: mihpayid,
      paid_at: now,
      updated_at: now,
    })
    .eq("id", order.id)
    .eq("status", "created")
    .select("id")
    .maybeSingle();
  if (!claimed) return base;

  // Money has been taken: from here a failure is logged loudly for the team to settle by hand.
  const problem = async (message: string) => {
    await logPlatformEvent({
      level: "error",
      source: "bible_school_payment",
      message: `Program fee paid but enrolment failed: ${message}`,
      organizationId: order.organization_id,
      metadata: { orderId: order.id, txnid },
    });
  };

  try {
    if (order.application_id) {
      await admin
        .from("lms_student_applications")
        .update({ payment_status: "paid" })
        .eq("id", order.application_id);
      const { error } = await admin.rpc("lms_approve_application", {
        p_org: order.organization_id,
        p_application: order.application_id,
        p_course: null,
        p_actor: null,
        p_program: order.program_id,
      });
      if (error) {
        await problem(error.message);
        return base;
      }
      await emailStudentApproved(
        org?.name ?? "the church",
        order.payer_email ?? "",
        order.payer_name.split(" ")[0],
        program?.title ?? null,
        { paid: true, learnUrl: `${getSiteUrl()}/bible-school/learn` },
      );
    } else if (order.member_id && order.program_id) {
      const { error } = await admin.rpc("lms_enroll_program", {
        p_organization_id: order.organization_id,
        p_program_id: order.program_id,
        p_member_id: order.member_id,
        p_status: "approved",
        p_source: "payment",
        p_actor: null,
      });
      if (error && !error.message.includes("already has an open enrollment")) {
        await problem(error.message);
        return base;
      }
    }

    // Telling the team is best effort: the person is enrolled either way.
    try {
      await pushToTeam({
        organizationId: order.organization_id,
        tab: "bibleschool",
        title: "Program fee received",
        body: `${order.payer_name} paid for ${program?.title ?? "a program"}.`,
        link: `${LMS_BASE_PATH}/programs`,
      });
    } catch {
      /* ignored */
    }
  } catch (err) {
    await problem(err instanceof Error ? err.message : "unexpected error");
  }
  return base;
}
