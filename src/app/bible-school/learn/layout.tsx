import type { Metadata } from "next";
import { PortalShell } from "@/components/bible-school/portal/PortalShell";

export const metadata: Metadata = {
  title: "My courses | KingdomFlow Bible School",
  robots: { index: false },
};

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalShell>{children}</PortalShell>;
}
