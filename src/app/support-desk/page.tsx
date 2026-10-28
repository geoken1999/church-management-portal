import type { Metadata } from "next";
import { SupportTicketBoard } from "@/components/support/SupportTicketBoard";

export const metadata: Metadata = { title: "Support console | KingdomFlow" };
export const dynamic = "force-dynamic";

// Access is checked by the layout (and again by every action on the page).
export default function SupportDeskPage() {
  return <SupportTicketBoard />;
}
