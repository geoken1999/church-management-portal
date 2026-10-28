import type { Metadata } from "next";
import { PricingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Pricing | KingdomFlow",
  description:
    "Simple, transparent pricing for churches of every size. 14-day free trial.",
};

export default function Page() {
  return <PricingPage />;
}
