import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanUsage } from "@/lib/plans/dal";
import {
  buildPaymentRequestFields,
  type PayUFormFields,
} from "@/lib/payu/client";
import { getSiteUrl } from "@/lib/site-url";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { pushToTeam } from "@/lib/push/team";
import { isBibleSchoolOpen } from "@/lib/lms/public-school";
import { emailStudentApproved } from "@/lib/lms/student-email";
import { LMS_BASE_PATH } from "@/lib/lms/constants";

// Course fees are collected on KingdomFlow's shared PayU account, like paid events, and the church is
// paid out from the Payouts page (2.5% service fee). The order row is written first and is the only
// thing the return route trusts, after it has checked PayU's hash.

export interface OrderResult {
  error?: string;
  orderId?: string;
}

interface OrderInput {
  organizationId: string;
  courseId: string;
  amount?: never;
  payer: { name: string; email: string | null; phone: string | null };
  memberId?: string;
  applicationId?: string;
}

// The address the browser opens to pay: a page that sends the person on to PayU.
export function checkoutUrl(orderId: string): string {
  return `${getSiteUrl()}/bible-school/checkout/${orderId}`;
}

export async function createCourseOrder(
  input: OrderInput,
): Promise<OrderResult> {
  if (!input.memberId && !input.applicationId)
    return { error: "Something went wrong. Please try again." };
  const admin = createAdminClient();

  if (!(await isBibleSchoolOpen(input.organizationId)))
    return { error: "The Bible School isn't open right now." };

  const { data: course } = await admin
    .from("lms_courses")
    .select("id, title, price_amount, capacity, status, visibility")
    .eq("id", input.courseId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!course || course.status !== "published")
    return { error: "That course isn't available." };
  const amount = Number(course.price_amount ?? 0);
  if (!(amount > 0)) return { error: "This course is free." };
  if (input.applicationId && course.visibility !== "public")
    return { error: "That course isn't available." };

  const { plan } = await getPlanUsage(input.organizationId);
  if (!plan.financeEnabled)
    return {
      error: "Online payment is temporarily unavailable for this course.",
    };

  if (course.capacity !== null) {
    const { count } = await admin
      .from("lms_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", course.id)
      .in("status", ["approved", "active"]);
    if ((count ?? 0) >= course.capacity)
      return { error: "This course is full." };
  }

  if (input.memberId) {
    // A student from outside the church can only buy public courses.
    const { data: buyer } = await admin
      .from("members")
      .select("status")
      .eq("id", input.memberId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    if (!buyer || !["active", "student"].includes(buyer.status))
      return { error: "That course isn't available." };
    if (buyer.status === "student" && course.visibility !== "public")
      return { error: "That course isn't available." };
    const { count } = await admin
      .from("lms_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", course.id)
      .eq("member_id", input.memberId)
      .in("status", ["pending", "approved", "active", "completed"]);
    if ((count ?? 0) > 0)
      return { error: "You have already joined this course." };
  }

  const txnid = `lms${Date.now()}${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const { data: order, error } = await admin
    .from("lms_payment_orders")
    .insert({
      organization_id: input.organizationId,
      course_id: course.id,
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
  payuFields: PayUFormFields;
  payuActionUrl: string;
}

// What the checkout page posts to PayU, built fresh each time it is opened. Null when the order is
// unknown or has already been paid.
export async function getCheckoutData(
  orderId: string,
): Promise<CheckoutData | null> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("lms_payment_orders")
    .select(
      "id, organization_id, course_id, amount, status, payu_txnid, payer_name, payer_email, payer_phone",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status === "paid") return null;
  const [{ data: course }, { data: org }] = await Promise.all([
    admin
      .from("lms_courses")
      .select("title")
      .eq("id", order.course_id)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("name")
      .eq("id", order.organization_id)
      .maybeSingle(),
  ]);
  const returnUrl = `${getSiteUrl()}/api/payu/bible-school/return?orderId=${order.id}`;
  try {
    const built = buildPaymentRequestFields({
      txnid: order.payu_txnid,
      amountRupees: Number(order.amount),
      productinfo: `Course: ${course?.title ?? "Bible School"}`.slice(0, 100),
      firstname: order.payer_name.split(" ")[0] || "Student",
      email: order.payer_email || "noreply@kingdomflow.in",
      phone: order.payer_phone || "9999999999",
      surl: returnUrl,
      furl: returnUrl,
      udf1: `lms:${order.id}`,
    });
    return {
      title: course?.title ?? "Bible School course",
      organizationName: org?.name ?? "",
      amount: Number(order.amount),
      payuFields: built.fields,
      payuActionUrl: built.actionUrl,
    };
  } catch (err) {
    await logPlatformEvent({
      level: "error",
      source: "bible_school_payment",
      message: `PayU field build failed: ${err instanceof Error ? err.message : "unknown error"}`,
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

// Called by the PayU return route once it has verified PayU's hash. The status claim ("created" to
// "paid") only matches once, so a replayed return cannot enrol twice.
export async function finalizeCoursePayment(
  txnid: string,
  mihpayid: string,
): Promise<FinalizeResult> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("lms_payment_orders")
    .select(
      "id, organization_id, course_id, member_id, application_id, status, payer_name, payer_email",
    )
    .eq("payu_txnid", txnid)
    .maybeSingle();
  if (!order) return { error: "That payment could not be found." };
  const [{ data: course }, { data: org }] = await Promise.all([
    admin
      .from("lms_courses")
      .select("title")
      .eq("id", order.course_id)
      .maybeSingle(),
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
      message: `Course fee paid but enrolment failed: ${message}`,
      organizationId: order.organization_id,
      metadata: { orderId: order.id, txnid },
    });
  };

  if (order.application_id) {
    await admin
      .from("lms_student_applications")
      .update({ payment_status: "paid" })
      .eq("id", order.application_id);
    const { error } = await admin.rpc("lms_approve_application", {
      p_org: order.organization_id,
      p_application: order.application_id,
      p_course: order.course_id,
      p_actor: null,
    });
    if (error) {
      await problem(error.message);
      return base;
    }
    await emailStudentApproved(
      org?.name ?? "the church",
      order.payer_email ?? "",
      order.payer_name.split(" ")[0],
      course?.title ?? null,
      { paid: true, learnUrl: `${getSiteUrl()}/bible-school/learn` },
    );
  } else if (order.member_id) {
    const { data: enrollmentId, error } = await admin.rpc(
      "lms_create_enrollment",
      {
        p_organization_id: order.organization_id,
        p_course_id: order.course_id,
        p_member_id: order.member_id,
        p_status: "approved",
        p_source: "payment",
        p_actor: null,
        p_ignore_window: true,
      },
    );
    if (error && !error.message.includes("already has an open enrollment")) {
      await problem(error.message);
      return base;
    }
    if (enrollmentId)
      await admin
        .from("lms_payment_orders")
        .update({ enrollment_id: enrollmentId })
        .eq("id", order.id);
  }

  await pushToTeam({
    organizationId: order.organization_id,
    tab: "bibleschool",
    title: "Course fee received",
    body: `${order.payer_name} paid for ${course?.title ?? "a course"}.`,
    link: `${LMS_BASE_PATH}/enrollments`,
  });
  return base;
}
