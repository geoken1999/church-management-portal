"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrganization } from "@/lib/organizations/dal";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { notifyPlatformAdmins } from "@/lib/platform-admin/notify";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { ENCRYPTED_SUFFIX, encryptBytes, parseProofKey } from "@/lib/organizations/proof-crypto";
import {
  PROOF_BUCKET,
  isOwnProofPath,
  proofContentType,
  proofPath,
  proofProblem,
} from "@/lib/organizations/proof";

async function requireOwnerOrAdmin() {
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") return null;
  return membership;
}

// Step one of sending the document: a one-time upload link for a path inside this church's own folder.
export async function startProofUpload(
  fileName: string,
  size: number,
): Promise<{ path?: string; token?: string; error?: string }> {
  const membership = await requireOwnerOrAdmin();
  if (!membership) return { error: "Only an owner or admin can send this." };
  if (membership.organization.verification_status === "verified") return { error: "Your church is already verified." };
  const type = proofContentType(fileName) ?? "";
  const problem = proofProblem({ type, size });
  if (problem) return { error: problem };
  const path = proofPath(membership.organization.id, type, crypto.randomUUID());
  const { data, error } = await createAdminClient().storage.from(PROOF_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Couldn't start the upload. Please try again." };
  return { path, token: data.token };
}

// Step two: the file is in storage; record it and tell the platform admin there is something to check.
export async function submitProof(path: string, fileName: string): Promise<{ error?: string }> {
  const membership = await requireOwnerOrAdmin();
  if (!membership) return { error: "Only an owner or admin can send this." };
  const org = membership.organization;
  if (org.verification_status === "verified") return { error: "Your church is already verified." };
  if (!isOwnProofPath(path, org.id)) return { error: "Invalid request." };

  const admin = createAdminClient();
  const file = path.slice(path.lastIndexOf("/") + 1);
  const { data: found } = await admin.storage.from(PROOF_BUCKET).list(org.id, { search: file });
  if (!found?.some((f) => f.name === file)) return { error: "The file didn't finish uploading. Please try again." };

  // Encrypt it before keeping it: read the uploaded file, store an encrypted copy, remove the plain one. If the key is
  // not set up, or anything fails, the plain file is kept (it is still in a private bucket) and the platform is told.
  let storedPath = path;
  const key = parseProofKey(process.env.PROOF_ENCRYPTION_KEY);
  if (!key) {
    await logPlatformEvent({ level: "warning", source: "platform_admin", message: "PROOF_ENCRYPTION_KEY is not set: a proof document was kept without our own encryption", organizationId: org.id });
  } else {
    try {
      const { data: blob, error: readError } = await admin.storage.from(PROOF_BUCKET).download(path);
      if (readError || !blob) throw new Error(readError?.message ?? "download failed");
      const sealed = encryptBytes(Buffer.from(await blob.arrayBuffer()), key);
      const { error: writeError } = await admin.storage
        .from(PROOF_BUCKET)
        .upload(path + ENCRYPTED_SUFFIX, sealed, { contentType: "application/octet-stream", upsert: true });
      if (writeError) throw new Error(writeError.message);
      await admin.storage.from(PROOF_BUCKET).remove([path]);
      storedPath = path + ENCRYPTED_SUFFIX;
    } catch (err) {
      await logPlatformEvent({ level: "warning", source: "platform_admin", message: `Proof document could not be encrypted: ${err instanceof Error ? err.message : "unknown error"}`, organizationId: org.id });
    }
  }

  const previousPath = org.proof_document_path ?? null;
  const { error } = await admin
    .from("organizations")
    .update({
      proof_document_path: storedPath,
      proof_document_name: fileName.slice(0, 200),
      proof_submitted_at: new Date().toISOString(),
      verification_status: "under_review",
      verification_note: null,
    })
    .eq("id", org.id);
  if (error) return { error: "Couldn't save your document. Please try again." };
  // A replaced (rejected) document is not kept.
  if (previousPath && previousPath !== storedPath) await admin.storage.from(PROOF_BUCKET).remove([previousPath]);

  await notifyPlatformAdmins(
    `Proof document to check: ${org.name}`,
    `<p><strong>${org.name.replace(/</g, "&lt;")}</strong> sent its registration document. Open Super Admin → Verification to check it.</p>`,
  );
  revalidatePath("/dashboard", "layout");
  return {};
}

// ---------------------------------------------------------------------------
// Super Admin
// ---------------------------------------------------------------------------

// The document opens through our own page (it is decrypted there), so the link is just that page.
export async function getOrgProofLink(organizationId: string): Promise<{ url?: string; error?: string }> {
  await requirePlatformAdmin();
  const { data: org } = await createAdminClient().from("organizations").select("proof_document_path").eq("id", organizationId).maybeSingle();
  if (!org?.proof_document_path) return { error: "No document was sent." };
  return { url: `/platform-admin/verification/${organizationId}/document` };
}

export async function reviewOrgProof(
  organizationId: string,
  decision: "verify" | "reject",
  note: string,
): Promise<{ error?: string }> {
  const platformAdmin = await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id, name").eq("id", organizationId).maybeSingle();
  if (!org) return { error: "Church not found." };

  if (decision === "reject") {
    const reason = note.trim().slice(0, 300);
    if (!reason) return { error: "Say why, so the church knows what to send instead." };
    const { error } = await admin
      .from("organizations")
      .update({ verification_status: "rejected", verification_note: reason })
      .eq("id", organizationId);
    if (error) return { error: "Couldn't save. Please try again." };
    await admin.from("notifications").insert({
      organization_id: organizationId,
      type: "verification",
      title: "Your registration document needs another look",
      body: reason,
      link: "/dashboard/profile",
    });
  } else {
    const { error } = await admin
      .from("organizations")
      .update({ verification_status: "verified", verification_note: null, verified_at: new Date().toISOString() })
      .eq("id", organizationId);
    if (error) return { error: "Couldn't save. Please try again." };
    await admin.from("notifications").insert({
      organization_id: organizationId,
      type: "verification",
      title: "Your church is verified",
      body: "Everything in KingdomFlow is open to you.",
      link: "/dashboard/profile",
    });
  }
  await logPlatformEvent({
    level: "info",
    source: "platform_admin",
    message: `Platform admin (${platformAdmin.email ?? "unknown"}) ${decision === "verify" ? "verified" : "rejected the proof document of"} ${org.name}`,
    organizationId,
  });
  revalidatePath("/platform-admin/verification");
  return {};
}
