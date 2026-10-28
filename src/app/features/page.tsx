import type { Metadata } from "next";
import { FeaturesPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Features | KingdomFlow",
  description:
    "Every module a church needs — members, events, giving, communication, Bible School and more — in one connected platform.",
};

export default function Page() {
  return <FeaturesPage />;
}
