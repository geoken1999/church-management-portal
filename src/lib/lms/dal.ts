import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  LmsCourse,
  LmsCourseInstructor,
  LmsEnrollment,
  LmsLesson,
  LmsModule,
  LmsProgram,
  LmsSettings,
} from "@/types/database";

// Reads for the Bible School screens. They use the service role, so every function takes the church
// id and filters by it; the pages call them only after checking the signed-in user's access on the
// Bible School tab (and, for instructors, which courses they teach).

const PAGE_SIZE = 20;

export async function getLmsSettings(
  organizationId: string,
): Promise<LmsSettings> {
  const { data } = await createAdminClient()
    .from("lms_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (
    data ?? {
      organization_id: organizationId,
      school_name: "",
      tagline: null,
      default_language: "en",
      enrollment_requires_approval: true,
      allow_self_enrollment: true,
      updated_at: new Date(0).toISOString(),
    }
  );
}

export interface LmsOverview {
  courses: { draft: number; published: number; archived: number };
  programs: { draft: number; published: number; archived: number };
  enrollments: {
    pending: number;
    approved: number;
    active: number;
    completed: number;
  };
  instructors: number;
}

async function countRows(
  table: "lms_courses" | "lms_programs" | "lms_enrollments",
  organizationId: string,
  status: string,
  courseIds?: string[],
): Promise<number> {
  let query = createAdminClient()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", status as never);
  if (courseIds && table === "lms_enrollments")
    query = query.in("course_id", courseIds);
  if (courseIds && table === "lms_courses") query = query.in("id", courseIds);
  const { count } = await query;
  return count ?? 0;
}

// Real counts for the overview. With `courseIds` it covers only those courses (an instructor's own).
export async function getOverview(
  organizationId: string,
  courseIds?: string[],
): Promise<LmsOverview> {
  const scoped = courseIds !== undefined;
  if (scoped && courseIds.length === 0) {
    return {
      courses: { draft: 0, published: 0, archived: 0 },
      programs: { draft: 0, published: 0, archived: 0 },
      enrollments: { pending: 0, approved: 0, active: 0, completed: 0 },
      instructors: 0,
    };
  }
  const admin = createAdminClient();
  const [cd, cp, ca, pd, pp, pa, ep, eap, eac, eco, ins] = await Promise.all([
    countRows("lms_courses", organizationId, "draft", courseIds),
    countRows("lms_courses", organizationId, "published", courseIds),
    countRows("lms_courses", organizationId, "archived", courseIds),
    scoped
      ? Promise.resolve(0)
      : countRows("lms_programs", organizationId, "draft"),
    scoped
      ? Promise.resolve(0)
      : countRows("lms_programs", organizationId, "published"),
    scoped
      ? Promise.resolve(0)
      : countRows("lms_programs", organizationId, "archived"),
    countRows("lms_enrollments", organizationId, "pending", courseIds),
    countRows("lms_enrollments", organizationId, "approved", courseIds),
    countRows("lms_enrollments", organizationId, "active", courseIds),
    countRows("lms_enrollments", organizationId, "completed", courseIds),
    (async () => {
      let q = admin
        .from("lms_course_instructors")
        .select("member_id", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      if (courseIds) q = q.in("course_id", courseIds);
      const { count } = await q;
      return count ?? 0;
    })(),
  ]);
  return {
    courses: { draft: cd, published: cp, archived: ca },
    programs: { draft: pd, published: pp, archived: pa },
    enrollments: { pending: ep, approved: eap, active: eac, completed: eco },
    instructors: ins,
  };
}

// The ids of the courses a login teaches (for an instructor-only view).
export async function getTaughtCourseIds(
  organizationId: string,
  authUserId: string,
): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("lms_course_instructors")
    .select("course_id")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", authUserId);
  return (data ?? []).map((row) => row.course_id);
}

export interface CourseListRow extends LmsCourse {
  enrolled: number;
  pending: number;
  instructorNames: string[];
}

export interface CourseListResult {
  rows: CourseListRow[];
  total: number;
  page: number;
  pageCount: number;
}

// A page of courses, filtered and searched on the server. `onlyIds` limits it to an instructor's courses.
export async function getCourses(
  organizationId: string,
  options: {
    q?: string;
    status?: string;
    page?: number;
    onlyIds?: string[];
  } = {},
): Promise<CourseListResult> {
  const admin = createAdminClient();
  const page = Math.max(1, options.page ?? 1);
  if (options.onlyIds && options.onlyIds.length === 0)
    return { rows: [], total: 0, page, pageCount: 1 };

  let query = admin
    .from("lms_courses")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId);
  if (
    options.status &&
    ["draft", "published", "archived"].includes(options.status)
  )
    query = query.eq("status", options.status as never);
  if (options.onlyIds) query = query.in("id", options.onlyIds);
  const term = (options.q ?? "")
    .trim()
    .replace(/[%,()]/g, " ")
    .slice(0, 80);
  if (term) query = query.or(`title.ilike.%${term}%,code.ilike.%${term}%`);
  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const courses = (data ?? []) as LmsCourse[];
  const ids = courses.map((c) => c.id);
  const [{ data: enrollments }, { data: instructors }] = ids.length
    ? await Promise.all([
        admin
          .from("lms_enrollments")
          .select("course_id, status")
          .eq("organization_id", organizationId)
          .in("course_id", ids)
          .in("status", ["pending", "approved", "active"]),
        admin
          .from("lms_course_instructors")
          .select("course_id, member_id")
          .eq("organization_id", organizationId)
          .in("course_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  const memberIds = [...new Set((instructors ?? []).map((i) => i.member_id))];
  const nameById = await memberNames(memberIds);
  const rows: CourseListRow[] = courses.map((course) => {
    const mine = (enrollments ?? []).filter((e) => e.course_id === course.id);
    const names = (instructors ?? [])
      .filter((i) => i.course_id === course.id)
      .map((i) => nameById.get(i.member_id) ?? "")
      .filter(Boolean);
    return {
      ...course,
      enrolled: mine.filter((e) => e.status !== "pending").length,
      pending: mine.filter((e) => e.status === "pending").length,
      instructorNames: names,
    };
  });

  const total = count ?? 0;
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

// Names for a set of member ids, in one query.
async function memberNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await createAdminClient()
    .from("members")
    .select("id, first_name, last_name")
    .in("id", ids);
  for (const m of data ?? [])
    map.set(m.id, `${m.first_name} ${m.last_name}`.trim());
  return map;
}

export async function getCourse(
  organizationId: string,
  courseId: string,
): Promise<LmsCourse | null> {
  const { data } = await createAdminClient()
    .from("lms_courses")
    .select("*")
    .eq("id", courseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as LmsCourse | null) ?? null;
}

// A small list of every course in the church, for pickers.
export async function getCourseOptions(
  organizationId: string,
): Promise<
  { id: string; title: string; code: string | null; status: string }[]
> {
  const { data } = await createAdminClient()
    .from("lms_courses")
    .select("id, title, code, status")
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .order("title")
    .limit(500);
  return data ?? [];
}

export interface ModuleWithLessons extends LmsModule {
  lessons: LmsLesson[];
}

// The whole curriculum of one course in one go (two queries), in order.
export async function getCurriculum(
  organizationId: string,
  courseId: string,
): Promise<ModuleWithLessons[]> {
  const admin = createAdminClient();
  const [{ data: modules }, { data: lessons }] = await Promise.all([
    admin
      .from("lms_modules")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("course_id", courseId)
      .order("position")
      .order("created_at"),
    admin
      .from("lms_lessons")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("course_id", courseId)
      .order("position")
      .order("created_at"),
  ]);
  return ((modules ?? []) as LmsModule[]).map((m) => ({
    ...m,
    lessons: ((lessons ?? []) as LmsLesson[]).filter(
      (l) => l.module_id === m.id,
    ),
  }));
}

export interface InstructorRow extends LmsCourseInstructor {
  name: string;
  loginName: string | null;
}

export async function getInstructors(
  organizationId: string,
  courseId: string,
): Promise<InstructorRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("lms_course_instructors")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("course_id", courseId)
    .order("created_at");
  const rows = data ?? [];
  const names = await memberNames(rows.map((r) => r.member_id));
  const loginIds = rows
    .map((r) => r.auth_user_id)
    .filter((id): id is string => Boolean(id));
  const { data: profiles } = loginIds.length
    ? await admin
        .from("profiles")
        .select("auth_user_id, first_name, last_name, email")
        .in("auth_user_id", loginIds)
    : { data: [] };
  return rows.map((row) => {
    const p = (profiles ?? []).find((x) => x.auth_user_id === row.auth_user_id);
    return {
      ...(row as LmsCourseInstructor),
      name: names.get(row.member_id) ?? "Unknown",
      loginName: p ? `${p.first_name} ${p.last_name}`.trim() || p.email : null,
    };
  });
}

// The team logins of a church, for linking an instructor to a login.
export async function getTeamLogins(
  organizationId: string,
): Promise<{ authUserId: string; name: string }[]> {
  const { data } = await createAdminClient()
    .from("organization_members")
    .select("auth_user_id, profiles(first_name, last_name, email)")
    .eq("organization_id", organizationId);
  return (data ?? []).map((row) => {
    const p = row.profiles as {
      first_name: string;
      last_name: string;
      email: string;
    } | null;
    return {
      authUserId: row.auth_user_id,
      name: p
        ? `${p.first_name} ${p.last_name}`.trim() || p.email
        : "Team member",
    };
  });
}

export interface MemberOption {
  id: string;
  name: string;
  phone: string | null;
}

// Active members to pick from (students, instructors). Capped; the pickers filter by name.
export async function getMemberOptions(
  organizationId: string,
): Promise<MemberOption[]> {
  const { data } = await createAdminClient()
    .from("members")
    .select("id, first_name, last_name, phone")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("first_name")
    .limit(2000);
  return (data ?? []).map((m) => ({
    id: m.id,
    name: `${m.first_name} ${m.last_name}`.trim(),
    phone: m.phone,
  }));
}

export async function getPrerequisites(
  organizationId: string,
  courseId: string,
): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("lms_course_prerequisites")
    .select("prerequisite_course_id")
    .eq("organization_id", organizationId)
    .eq("course_id", courseId);
  return (data ?? []).map((r) => r.prerequisite_course_id);
}

export interface ProgramRow extends LmsProgram {
  courseIds: string[];
}

export async function getPrograms(
  organizationId: string,
): Promise<ProgramRow[]> {
  const admin = createAdminClient();
  const [{ data: programs }, { data: links }] = await Promise.all([
    admin
      .from("lms_programs")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("lms_program_courses")
      .select("program_id, course_id, position")
      .eq("organization_id", organizationId)
      .order("position"),
  ]);
  return ((programs ?? []) as LmsProgram[]).map((p) => ({
    ...p,
    courseIds: (links ?? [])
      .filter((l) => l.program_id === p.id)
      .map((l) => l.course_id),
  }));
}

export interface EnrollmentRow extends LmsEnrollment {
  requiredDone: number;
  requiredTotal: number;
  studentName: string;
  studentPhone: string | null;
  courseTitle: string;
}

export interface EnrollmentListResult {
  rows: EnrollmentRow[];
  total: number;
  page: number;
  pageCount: number;
}

// A page of enrollments, newest first, filtered by course and status on the server.
export async function getEnrollments(
  organizationId: string,
  options: {
    courseId?: string;
    status?: string;
    page?: number;
    onlyCourseIds?: string[];
  } = {},
): Promise<EnrollmentListResult> {
  const page = Math.max(1, options.page ?? 1);
  if (options.onlyCourseIds && options.onlyCourseIds.length === 0)
    return { rows: [], total: 0, page, pageCount: 1 };
  const admin = createAdminClient();
  let query = admin
    .from("lms_enrollments")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId);
  if (options.courseId) query = query.eq("course_id", options.courseId);
  if (options.onlyCourseIds)
    query = query.in("course_id", options.onlyCourseIds);
  if (
    options.status &&
    [
      "pending",
      "approved",
      "active",
      "completed",
      "withdrawn",
      "rejected",
    ].includes(options.status)
  )
    query = query.eq("status", options.status as never);
  const { data, count } = await query
    .order("requested_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const list = data ?? [];
  const memberIds = [...new Set(list.map((r) => r.member_id))];
  const courseIds = [...new Set(list.map((r) => r.course_id))];
  const [{ data: members }, { data: courses }] = await Promise.all([
    memberIds.length
      ? admin
          .from("members")
          .select("id, first_name, last_name, phone")
          .in("id", memberIds)
      : Promise.resolve({ data: [] }),
    courseIds.length
      ? admin.from("lms_courses").select("id, title").in("id", courseIds)
      : Promise.resolve({ data: [] }),
  ]);
  // How far each student has got: required lessons done, out of the course's required lessons.
  const enrollmentIds = list.map((r) => r.id);
  const [{ data: doneRows }, { data: lessonRows }] = await Promise.all([
    enrollmentIds.length
      ? admin
          .from("lms_lesson_progress")
          .select("enrollment_id, lesson_id")
          .in("enrollment_id", enrollmentIds)
          .not("completed_at", "is", null)
      : Promise.resolve({ data: [] }),
    courseIds.length
      ? admin
          .from("lms_lessons")
          .select("id, course_id, module_id")
          .in("course_id", courseIds)
          .eq("status", "published")
          .eq("is_required", true)
      : Promise.resolve({ data: [] }),
  ]);
  const moduleIds = [...new Set((lessonRows ?? []).map((l) => l.module_id))];
  const { data: publishedModules } = moduleIds.length
    ? await admin
        .from("lms_modules")
        .select("id")
        .in("id", moduleIds)
        .eq("status", "published")
    : { data: [] };
  const publishedModuleIds = new Set((publishedModules ?? []).map((m) => m.id));
  const requiredByCourse = new Map<string, Set<string>>();
  for (const lesson of lessonRows ?? []) {
    if (!publishedModuleIds.has(lesson.module_id)) continue;
    if (!requiredByCourse.has(lesson.course_id))
      requiredByCourse.set(lesson.course_id, new Set());
    requiredByCourse.get(lesson.course_id)!.add(lesson.id);
  }

  const rows: EnrollmentRow[] = list.map((row) => {
    const m = (members ?? []).find((x) => x.id === row.member_id);
    const c = (courses ?? []).find((x) => x.id === row.course_id);
    const required = requiredByCourse.get(row.course_id) ?? new Set<string>();
    const done = (doneRows ?? []).filter(
      (d) => d.enrollment_id === row.id && required.has(d.lesson_id),
    ).length;
    return {
      ...(row as LmsEnrollment),
      requiredDone: done,
      requiredTotal: required.size,
      studentName: m ? `${m.first_name} ${m.last_name}`.trim() : "Unknown",
      studentPhone: m?.phone ?? null,
      courseTitle: c?.title ?? "Unknown course",
    };
  });
  const total = count ?? 0;
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
