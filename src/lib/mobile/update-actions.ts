"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { compareVersions, isVersion, type PlatformUpdate, type UpdateConfig } from "@/lib/mobile/update-config";
import { saveUpdateConfig } from "@/lib/mobile/update-store";

function check(name: string, p: PlatformUpdate): string | null {
  const latest = p.latest.trim();
  const minimum = p.minimum.trim();
  if (!latest && !minimum) return null;
  if (latest && !isVersion(latest)) return `${name}: the latest version should look like 1.2.3.`;
  if (minimum && !isVersion(minimum)) return `${name}: the minimum version should look like 1.2.3.`;
  if (minimum && !latest) return `${name}: set the latest version too.`;
  if (minimum && compareVersions(minimum, latest) > 0) return `${name}: the minimum version can't be newer than the latest.`;
  if (latest) {
    let url: URL | null = null;
    try {
      url = new URL(p.storeUrl.trim());
    } catch {
      /* handled below */
    }
    if (!url || url.protocol !== "https:") return `${name}: add the https store link people should be sent to.`;
  }
  if (p.notes.length > 500) return `${name}: keep the release notes under 500 characters.`;
  return null;
}

export async function saveUpdateConfigAction(config: UpdateConfig): Promise<{ error?: string; success?: boolean }> {
  await requirePlatformAdmin();
  const clean = (p: PlatformUpdate): PlatformUpdate => ({ latest: p.latest.trim(), minimum: p.minimum.trim(), storeUrl: p.storeUrl.trim(), notes: p.notes.trim() });
  const next: UpdateConfig = { android: clean(config.android), ios: clean(config.ios) };
  const problem = check("Android", next.android) ?? check("iPhone", next.ios);
  if (problem) return { error: problem };
  const error = await saveUpdateConfig(next);
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/platform-admin/versions");
  return { success: true };
}
