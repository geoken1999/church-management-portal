import "server-only";

import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import { requireUser } from "@/lib/auth/dal";

// What every Design Studio page needs first: the person's church, a plan that includes the studio, and Read access.
export async function requireStudio() {
  const membership = await requireOrganization();
  if (membership.lockedTabs.includes("designer")) redirect("/dashboard/unlock/designer");
  const user = await requireUser();
  return { membership, user, allowed: membership.tabAccess.designer.read };
}
