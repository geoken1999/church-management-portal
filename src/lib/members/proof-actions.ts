"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { checkTabAccess } from "@/lib/permissions/dal";
import { notifyMember } from "@/lib/push/member-notice";
import { PROOF_BUCKET } from "@/lib/members/proof";

// The member's proof document, for the church to look at: a link that stops working after a few minutes. The
// member's church is worked out from the member itself, then the caller's access to Members is checked.
export async function getProofDocumentLink(
  memberId: string,
): Promise<{ url?: string; error?: string }> {
  await requireUser();
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("organization_id, proof_document_path")
    .eq("id", memberId)
    .maybeSingle();
  if (!member?.proof_document_path) return { error: "No document was sent." };
  const access = await checkTabAccess(member.organization_id, "members", "read");
  if (!access.ok) return { error: "You don't have access to this." };
  const { data, error } = await admin.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(member.proof_document_path, 300);
  if (error || !data) return { error: "Couldn't open the document." };
  return { url: data.signedUrl };
}

export async function reviewProofDocument(
  memberId: string,
  decision: "verify" | "reject",
  note: string,
): Promise<{ error?: string }> {
  await requireUser();
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("organization_id, status, self_registered")
    .eq("id", memberId)
    .maybeSingle();
  if (!member || !member.self_registered) return { error: "Member not found." };
  const access = await checkTabAccess(member.organization_id, "members", "write");
  if (!access.ok) return { error: "You don't have access to this." };

  if (decision === "reject") {
    const reason = note.trim().slice(0, 300);
    if (!reason) return { error: "Say why, so they know what to send instead." };
    const { error } = await admin
      .from("members")
      .update({ verification_status: "rejected", verification_note: reason })
      .eq("id", memberId);
    if (error) return { error: "Couldn't save. Please try again." };
    await notifyMember(
      memberId,
      "Your proof document needs another look",
      `${reason} Open Profile → Verification to send a new one.`,
    );
  } else {
    const { error } = await admin
      .from("members")
      .update({
        verification_status: "verified",
        verification_note: null,
        verified_at: new Date().toISOString(),
        // Verifying the proof also approves a person still waiting on the join request.
        ...(member.status === "pending" ? { status: "active" } : {}),
      })
      .eq("id", memberId);
    if (error) return { error: "Couldn't save. Please try again." };
    await notifyMember(
      memberId,
      "You're verified",
      "Your church verified your document. Everything in the app is open to you.",
    );
  }
  revalidatePath("/dashboard/members");
  return {};
}
