import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizationPayoutLedger, PAYOUT_STREAMS } from "@/lib/payouts/ledger";
import { isPlatformAdminEmail } from "@/lib/platform-admin/auth-helpers";

// Every storage bucket that keeps a church's files under a folder named by its id.
const BUCKETS = [
  "organization-logos",
  "worship-documents",
  "media-documents",
  "shared-documents",
  "email-images",
  "event-pass-backgrounds",
  "member-home-images",
  "instagram-post-uploads",
  "whatsapp-template-headers",
  "report-images",
];

/** How much a church is still owed by KingdomFlow (fundraisers, paid events, membership fees). */
export async function amountOwedToChurch(organizationId: string): Promise<number> {
  const ledger = await getOrganizationPayoutLedger(organizationId, PAYOUT_STREAMS.map((s) => s.key));
  return ledger.totals.owed;
}

async function listAllFiles(bucket: string, prefix: string, depth = 0): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  const files: string[] = [];
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`;
    // A folder has no id; look inside it (a few levels at most).
    if (entry.id === null && depth < 4) files.push(...(await listAllFiles(bucket, path, depth + 1)));
    else files.push(path);
  }
  return files;
}

export interface PurgeResult {
  ok: boolean;
  error?: string;
  summary: { files: number; usersDeleted: number; usersKept: number };
}

/**
 * Deletes a church and everything in it, permanently: the church itself (its tables
 * cascade from it), its uploaded files, and the logins that belonged only to it.
 * A login that is also part of another church, or a platform admin, is left alone.
 * The caller has already checked that deletion is allowed.
 */
export async function purgeOrganization(organizationId: string): Promise<PurgeResult> {
  const admin = createAdminClient();
  const summary = { files: 0, usersDeleted: 0, usersKept: 0 };

  // Who might need deleting afterwards: the team, and members who signed in to the app.
  const [{ data: team }, { data: appMembers }] = await Promise.all([
    admin.from("organization_members").select("auth_user_id").eq("organization_id", organizationId),
    admin.from("members").select("auth_user_id").eq("organization_id", organizationId).not("auth_user_id", "is", null),
  ]);
  const candidates = [...new Set([...(team ?? []).map((t) => t.auth_user_id), ...(appMembers ?? []).map((m) => m.auth_user_id).filter((id): id is string => Boolean(id))])];

  // The church first: if this fails, nothing else has been touched.
  const { error } = await admin.from("organizations").delete().eq("id", organizationId);
  if (error) return { ok: false, error: error.message, summary };

  // Its files.
  for (const bucket of BUCKETS) {
    try {
      const files = await listAllFiles(bucket, organizationId);
      for (let i = 0; i < files.length; i += 100) await admin.storage.from(bucket).remove(files.slice(i, i + 100));
      summary.files += files.length;
    } catch {
      // A bucket that can't be listed is skipped; the church itself is already gone.
    }
  }

  // Logins that belonged only to this church.
  for (const userId of candidates) {
    try {
      const [{ count: otherTeams }, { count: otherMembers }, { data: user }] = await Promise.all([
        admin.from("organization_members").select("id", { count: "exact", head: true }).eq("auth_user_id", userId),
        admin.from("members").select("id", { count: "exact", head: true }).eq("auth_user_id", userId),
        admin.auth.admin.getUserById(userId),
      ]);
      if ((otherTeams ?? 0) > 0 || (otherMembers ?? 0) > 0 || isPlatformAdminEmail(user.user?.email)) {
        summary.usersKept += 1;
        continue;
      }
      await admin.auth.admin.deleteUser(userId);
      summary.usersDeleted += 1;
    } catch {
      summary.usersKept += 1;
    }
  }

  return { ok: true, summary };
}
