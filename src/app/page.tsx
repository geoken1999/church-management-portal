import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/dal";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "KingdomFlow — Church management, connected",
  description:
    "Members, ministries, giving, and communication in one platform built for churches. Free to start.",
};

export default async function Home() {
  const user = await getAuthUser();
  if (user) {
    redirect("/dashboard");
  }
  return <LandingPage />;
}
