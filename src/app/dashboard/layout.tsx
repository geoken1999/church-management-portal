import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization, getUserOrganizations } from "@/lib/organizations/dal";
import { getNotifications } from "@/lib/notifications/dal";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireUser();
  const [membership, memberships] = await Promise.all([
    requireOrganization(),
    getUserOrganizations(),
  ]);
  const canManage = membership.role === "owner" || membership.role === "admin";
  const notifications = await getNotifications(membership.organization.id);

  return (
    <DashboardShell
      organization={membership.organization}
      canManage={canManage}
      memberships={memberships}
      notifications={notifications}
      tabAccess={membership.tabAccess}
    >
      {children}
    </DashboardShell>
  );
}
