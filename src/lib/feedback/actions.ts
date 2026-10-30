"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasGivenFeedback, saveFeedback } from "./service";
import { parseFeedback } from "./validation";

export async function submitWebFeedback(input: { rating: number; category: string; message: string; screen: string }): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = parseFeedback(input);
  if (!parsed.ok) return { error: parsed.error };
  const result = await saveFeedback("web", user.id, parsed.feedback);
  return result.ok ? {} : { error: result.error };
}

export async function hasGivenFeedbackAction(): Promise<boolean> {
  const user = await requireUser();
  return hasGivenFeedback(user.id);
}

export async function setFeedbackStatus(id: string, status: "new" | "reviewed" | "archived"): Promise<{ error?: string }> {
  await requirePlatformAdmin();
  if (!["new", "reviewed", "archived"].includes(status)) return { error: "Invalid status." };
  const { error } = await createAdminClient().from("app_feedback").update({ status }).eq("id", id);
  if (error) return { error: "Couldn't update that." };
  revalidatePath("/platform-admin/feedback");
  return {};
}
