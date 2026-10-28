import type { Metadata } from "next";
import { AppsPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Mobile apps | KingdomFlow",
  description:
    "The KingdomFlow app for church teams and members, on Android and iPhone.",
};

export default function Page() {
  return <AppsPage />;
}
