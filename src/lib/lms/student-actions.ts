"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAttemptLimit, recordAttempt } from "@/lib/auth/rate-limit";
import { STUDENT_APPLICATION_RULE } from "@/lib/auth/rate-limit-rules";
import { pushToTeam } from "@/lib/push/team";
import { nationalTail } from "@/lib/whatsapp/phone-match";
import { authorizeTab } from "@/lib/lms/authz";
import { logLmsEvent } from "@/lib/lms/audit";
import { LMS_BASE_PATH } from "@/lib/lms/constants";
import {
  explainExistingPerson,
  validateApplication,
  type ApplicationErrors,
} from "@/lib/lms/students";
import { isBibleSchoolOpen } from "@/lib/lms/public-school";
import { createProgramOrder, checkoutUrl } from "@/lib/lms/payments";
import { emailStudentApproved } from "@/lib/lms/student-email";
import { getSiteUrl } from "@/lib/site-url";
import type { LmsResult } from "@/lib/lms/actions";

export interface ApplicationState {
  errors?: ApplicationErrors;
  error?: string;
  success?: boolean;
  message?: string;
  // Set when the chosen course has a fee: the page opens this to pay.
  checkoutUrl?: string;
}

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// Public: someone from outside the church applies to the Bible School. No sign-in; a hidden field, a
// limit per phone number and per IP, and a human who approves each application keep it honest.
export async function submitStudentApplication(
  orgSlug: string,
  _prev: ApplicationState,
  formData: FormData,
): Promise<ApplicationState> {
  if (read(formData, "website"))
    return { success: true, message: "Thank you. Your application was sent." };

  const input = {
    firstName: read(formData, "firstName").trim(),
    lastName: read(formData, "lastName").trim(),
    phone: read(formData, "phone").trim(),
    email: read(formData, "email").trim(),
    message: read(formData, "message").trim(),
    courseId: read(formData, "courseId"),
  };
  const errors = validateApplication(input);
  if (Object.keys(errors).length > 0) return { errors };

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (!org || !(await isBibleSchoolOpen(org.id)))
    return { error: "This Bible School isn't taking applications right now." };

  const limited = await checkAttemptLimit(
    STUDENT_APPLICATION_RULE,
    nationalTail(input.phone),
  );
  if (limited) return { error: limited };
  await recordAttempt(STUDENT_APPLICATION_RULE, nationalTail(input.phone));

  // What they asked for, if anything: a public program (the usual case) or a public course that is not
  // part of a program. The value looks like "program:<id>" or "course:<id>".
  let courseId: string | null = null;
  let programId: string | null = null;
  let fee = 0;
  if (input.courseId) {
    const [kind, id] = input.courseId.split(":");
    if (kind === "program" && id) {
      const { data: program } = await admin
        .from("lms_programs")
        .select("id, price_amount")
        .eq("id", id)
        .eq("organization_id", org.id)
        .eq("status", "published")
        .eq("visibility", "public")
        .maybeSingle();
      if (!program)
        return { errors: { courseId: "That program isn't available." } };
      programId = program.id;
      fee = Number(program.price_amount ?? 0);
    } else if (kind === "course" && id) {
      const { data: course } = await admin
        .from("lms_courses")
        .select("id")
        .eq("id", id)
        .eq("organization_id", org.id)
        .eq("status", "published")
        .eq("visibility", "public")
        .is("price_amount", null)
        .maybeSingle();
      if (!course)
        return { errors: { courseId: "That course isn't available." } };
      courseId = course.id;
    } else {
      return { errors: { courseId: "Choose a program from the list." } };
    }
  }

  // Someone already known to this church by that number.
  const tail = nationalTail(input.phone);
  const { data: people } = await admin
    .from("members")
    .select("phone, status")
    .eq("organization_id", org.id)
    .like("phone", `%${tail}`);
  const known = (people ?? []).find(
    (p) => p.phone && nationalTail(p.phone) === tail,
  );
  const explained = explainExistingPerson(known?.status ?? null);
  if (explained) return { error: explained };

  const { data: created, error } = await admin
    .from("lms_student_applications")
    .insert({
      organization_id: org.id,
      course_id: courseId,
      program_id: programId,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      email: input.email || null,
      message: input.message || null,
      payment_status: fee > 0 ? "awaiting" : "none",
    })
    .select("id")
    .single();

  // A program with a fee is paid for right away: the person goes on to checkout, and is enrolled when
  // the payment is confirmed.
  const startPayment = async (
    applicationId: string,
  ): Promise<ApplicationState> => {
    const order = await createProgramOrder({
      organizationId: org.id,
      programId: programId!,
      applicationId,
      payer: {
        name: `${input.firstName} ${input.lastName}`.trim(),
        email: input.email || null,
        phone: input.phone,
      },
    });
    if (order.error || !order.orderId) return { error: order.error };
    return { checkoutUrl: checkoutUrl(order.orderId) };
  };

  if (error?.code === "23505") {
    // Already waiting: for a program that was not paid yet, offer the payment again.
    if (fee > 0) {
      const { data: waiting } = await admin
        .from("lms_student_applications")
        .select("id, phone, program_id, payment_status")
        .eq("organization_id", org.id)
        .eq("status", "pending");
      const mine = (waiting ?? []).find(
        (a) =>
          nationalTail(a.phone) === tail &&
          a.payment_status === "awaiting" &&
          a.program_id === programId,
      );
      if (mine) return startPayment(mine.id);
    }
    return {
      success: true,
      message:
        "We already have your application. The church will contact you once it is reviewed.",
    };
  }
  if (error || !created) {
    console.error("lms_student_applications insert failed:", error?.message);
    return { error: "Something went wrong. Please try again." };
  }
  if (fee > 0) return startPayment(created.id);

  try {
    await pushToTeam({
      organizationId: org.id,
      tab: "bibleschool",
      title: "New Bible School application",
      body: `${input.firstName} ${input.lastName} would like to join the Bible School.`,
      link: `${LMS_BASE_PATH}/applications`,
    });
  } catch {
    // The application is saved; telling the team is best effort.
  }
  return {
    success: true,
    message:
      "Thank you. Your application was sent. The church will review it and contact you.",
  };
}

// Approves an application: creates the student (or reuses the person), enrolls them in the course the
// team chooses, and tells the applicant if they gave an email.
export async function approveApplicationAction(
  organizationId: string,
  applicationId: string,
  target: string,
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return { error: access.message };
  const admin = createAdminClient();
  const { data: application } = await admin
    .from("lms_student_applications")
    .select("first_name, email")
    .eq("id", applicationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!application) return { error: "That application could not be found." };

  // The team chooses a program (or a course outside any program), or none.
  const [kind, id] = target ? target.split(":") : ["", ""];
  let programId: string | null = null;
  let courseId: string | null = null;
  let title: string | null = null;
  if (kind === "program" && id) {
    const { data: program } = await admin
      .from("lms_programs")
      .select("id, title")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("status", "published")
      .maybeSingle();
    if (!program) return { error: "Choose a published program, or none." };
    programId = program.id;
    title = program.title;
  } else if (kind === "course" && id) {
    const { data: course } = await admin
      .from("lms_courses")
      .select("id, title")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("status", "published")
      .maybeSingle();
    if (!course) return { error: "Choose a published course, or none." };
    courseId = course.id;
    title = course.title;
  } else if (target) {
    return { error: "Choose a program, a course, or none." };
  }

  const { error } = await admin.rpc("lms_approve_application", {
    p_org: organizationId,
    p_application: applicationId,
    p_course: courseId,
    p_actor: access.userId,
    p_program: programId,
  });
  if (error) {
    const known = [
      "could not be found",
      "already decided",
      "10-digit",
      "another church",
      "waiting membership request",
      "waiting for the course fee",
      "full",
      "closed",
    ];
    return {
      error: known.some((k) => error.message.includes(k))
        ? error.message
        : "Couldn't approve the application. Please try again.",
    };
  }
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "student.approved",
    entityType: "application",
    entityId: applicationId,
    metadata: { programId, courseId },
  });
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  await emailStudentApproved(
    org?.name ?? "the church",
    application.email ?? "",
    application.first_name,
    title,
    { learnUrl: `${getSiteUrl()}/bible-school/learn` },
  );
  revalidatePath(`${LMS_BASE_PATH}/applications`);
  revalidatePath(`${LMS_BASE_PATH}/enrollments`);
  return { success: true };
}

export async function rejectApplicationAction(
  organizationId: string,
  applicationId: string,
  note: string,
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return { error: access.message };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lms_student_applications")
    .update({
      status: "rejected",
      decided_by: access.userId,
      decided_at: new Date().toISOString(),
      decision_note: note.trim().slice(0, 300) || null,
    })
    .eq("id", applicationId)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data)
    return {
      error: "That application could not be found or was already decided.",
    };
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "student.rejected",
    entityType: "application",
    entityId: applicationId,
  });
  revalidatePath(`${LMS_BASE_PATH}/applications`);
  return { success: true };
}

// Takes a student's access away: they can no longer sign in to the Bible School. Their records stay.
export async function removeStudentAction(
  organizationId: string,
  memberId: string,
): Promise<LmsResult> {
  const access = await authorizeTab(organizationId, "write");
  if (!access.ok) return { error: access.message };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("members")
    .update({ status: "left" })
    .eq("id", memberId)
    .eq("organization_id", organizationId)
    .eq("status", "student")
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "That student could not be found." };
  await logLmsEvent({
    organizationId,
    actorAuthUserId: access.userId,
    action: "student.removed",
    entityType: "student",
    entityId: memberId,
  });
  revalidatePath(`${LMS_BASE_PATH}/applications`);
  return { success: true };
}
