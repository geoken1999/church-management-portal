import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { cleanTheme } from "@/lib/projection/theme";
import type { ProjectionScreen, ProjectionSlide, ProjectionTheme } from "@/types/database";

/** The church's projector, created the first time it is needed. */
export async function ensureScreen(organizationId: string): Promise<ProjectionScreen> {
  const admin = createAdminClient();
  const { data } = await admin.from("projection_screens").select("*").eq("organization_id", organizationId).maybeSingle();
  if (data) return data as ProjectionScreen;
  const { data: created, error } = await admin.from("projection_screens").insert({ organization_id: organizationId }).select("*").single();
  if (created) return created as ProjectionScreen;
  // A second tab created it a moment earlier.
  if (error?.code === "23505") {
    const { data: again } = await admin.from("projection_screens").select("*").eq("organization_id", organizationId).single();
    return again as ProjectionScreen;
  }
  throw new Error("Couldn't set up the projector.");
}

export interface PublicScreenState {
  visible: boolean;
  mode: "full" | "lower_third";
  slide: ProjectionSlide | null;
  theme: ProjectionTheme;
  updatedAt: string;
}

const toPublic = (screen: ProjectionScreen): PublicScreenState => ({
  visible: screen.visible,
  mode: screen.mode,
  // A hidden screen shows nothing, whatever slide was last on it.
  slide: screen.visible ? screen.slide : null,
  theme: cleanTheme(screen.theme),
  updatedAt: screen.updated_at,
});

/** What the projector page shows, by the secret in its address. Null for an address that isn't a projector. */
export async function screenByToken(token: string): Promise<PublicScreenState | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await createAdminClient().from("projection_screens").select("*").eq("token", token).maybeSingle();
  return data ? toPublic(data as ProjectionScreen) : null;
}

/** The slide members watching in the app should see, or null when nothing is projected. */
export async function viewerSlide(organizationId: string): Promise<{ slide: ProjectionSlide; updatedAt: string } | null> {
  const { data } = await createAdminClient().from("projection_screens").select("visible, slide, updated_at").eq("organization_id", organizationId).maybeSingle();
  if (!data?.visible || !data.slide) return null;
  return { slide: data.slide as ProjectionSlide, updatedAt: data.updated_at };
}

export async function updateScreen(organizationId: string, patch: Partial<Pick<ProjectionScreen, "visible" | "mode" | "slide" | "theme" | "token">>): Promise<ProjectionScreen> {
  await ensureScreen(organizationId);
  const { data, error } = await createAdminClient()
    .from("projection_screens")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .select("*")
    .single();
  if (error || !data) throw new Error("Couldn't update the projector.");
  return data as ProjectionScreen;
}
