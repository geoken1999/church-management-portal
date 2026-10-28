import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { SupportTicketBoard } from "@/components/support/SupportTicketBoard";

export const metadata: Metadata = {
  title: "Support | KingdomFlow Super Admin",
};

export default async function PlatformAdminSupportPage() {
  await requirePlatformAdmin();
  return <SupportTicketBoard />;
}
