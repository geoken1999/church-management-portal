import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isBibleSchoolEnabled } from "@/lib/lms/access";
import { getOrgFeatureState } from "@/lib/plans/dal";

// Whether a church's public Bible School page is open: the module has been moved out of testing by the
// platform admin (beta or live), and the church's plan has not switched it off. Mirrors
// lms_feature_available in the database, which governs the app.
export async function isBibleSchoolOpen(
  organizationId: string,
): Promise<boolean> {
  if (!(await isBibleSchoolEnabled(organizationId))) return false;
  const admin = createAdminClient();
  const { data: flag } = await admin
    .from("platform_feature_flags")
    .select("enabled, status")
    .eq("tab_key", "bibleschool")
    .maybeSingle();
  if (!flag || !flag.enabled || !["beta", "live"].includes(flag.status))
    return false;
  const state = await getOrgFeatureState(organizationId);
  return state.tabs.bibleschool;
}

export interface PublicSchool {
  organization: { id: string; name: string; logo_url: string | null };
  schoolName: string;
  tagline: string | null;
  courses: {
    id: string;
    title: string;
    code: string | null;
    description: string | null;
    cover_image_url: string | null;
    level: string;
    delivery_mode: string;
    estimated_hours: number | null;
    language: string;
  }[];
  // Public programs: what people join and pay for. Each holds courses.
  programs: {
    id: string;
    title: string;
    description: string | null;
    objectives: string | null;
    price_amount: number | null;
    capacity: number | null;
    courseTitles: string[];
  }[];
}

// What the public page shows: the school's name and its public, published courses. Nothing about
// students, other courses or the church's members.
export async function getPublicSchool(
  slug: string,
): Promise<PublicSchool | null> {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, logo_url")
    .eq("slug", slug)
    .maybeSingle();
  if (!org || !(await isBibleSchoolOpen(org.id))) return null;
  const [
    { data: settings },
    { data: courses },
    { data: programs },
    { data: links },
  ] = await Promise.all([
    admin
      .from("lms_settings")
      .select("school_name, tagline")
      .eq("organization_id", org.id)
      .maybeSingle(),
    admin
      .from("lms_courses")
      .select(
        "id, title, code, description, cover_image_url, level, delivery_mode, estimated_hours, language, price_amount, status, visibility",
      )
      .eq("organization_id", org.id)
      .eq("status", "published")
      .order("title"),
    admin
      .from("lms_programs")
      .select("id, title, description, objectives, price_amount, capacity")
      .eq("organization_id", org.id)
      .eq("status", "published")
      .eq("visibility", "public")
      .order("title"),
    admin
      .from("lms_program_courses")
      .select("program_id, course_id, position")
      .eq("organization_id", org.id)
      .order("position"),
  ]);
  const publishedCourses = courses ?? [];
  const titleOf = new Map(publishedCourses.map((c) => [c.id, c.title]));
  const inAnyProgram = new Set((links ?? []).map((l) => l.course_id));
  return {
    organization: org,
    schoolName: settings?.school_name || `${org.name} Bible School`,
    tagline: settings?.tagline ?? null,
    // Public courses outside any program, free: these can still be joined on their own.
    courses: publishedCourses
      .filter(
        (c) =>
          !inAnyProgram.has(c.id) &&
          c.price_amount === null &&
          c.visibility === "public",
      )
      .map((c) => ({
        id: c.id,
        title: c.title,
        code: c.code,
        description: c.description,
        cover_image_url: c.cover_image_url,
        level: c.level,
        delivery_mode: c.delivery_mode,
        estimated_hours: c.estimated_hours,
        language: c.language,
      })),
    programs: (programs ?? []).map((p) => ({
      ...p,
      courseTitles: (links ?? [])
        .filter((l) => l.program_id === p.id)
        .map((l) => titleOf.get(l.course_id))
        .filter((t): t is string => Boolean(t)),
    })),
  };
}
