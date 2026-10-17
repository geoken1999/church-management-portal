import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgFeatureState } from "@/lib/plans/dal";

// Whether a church's public Bible School page is open: the module has been moved out of testing by the
// platform admin (beta or live), and the church's plan has not switched it off. Mirrors
// lms_feature_available in the database, which governs the app.
export async function isBibleSchoolOpen(
  organizationId: string,
): Promise<boolean> {
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
  const [{ data: settings }, { data: courses }] = await Promise.all([
    admin
      .from("lms_settings")
      .select("school_name, tagline")
      .eq("organization_id", org.id)
      .maybeSingle(),
    admin
      .from("lms_courses")
      .select(
        "id, title, code, description, cover_image_url, level, delivery_mode, estimated_hours, language",
      )
      .eq("organization_id", org.id)
      .eq("status", "published")
      .eq("visibility", "public")
      .order("title"),
  ]);
  return {
    organization: org,
    schoolName: settings?.school_name || `${org.name} Bible School`,
    tagline: settings?.tagline ?? null,
    courses: (courses ?? []) as PublicSchool["courses"],
  };
}
