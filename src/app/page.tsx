import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/dal";
import { LandingPage } from "@/components/landing/LandingPage";
import { RecoveryHashRedirect } from "@/components/auth/RecoveryHashHandler";

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
  return (
    <>
      {/* Defensive fallback: if Supabase's own Redirect URL allowlist ever
          rejects the app's intended /auth/recovery destination (see
          requestPasswordReset in src/lib/auth/actions.ts), it falls back to
          the bare Site URL — this domain's root — with the recovery
          session still sitting in the URL hash. Without this, that hash
          just sits there unread and the visitor sees a plain landing page. */}
      <RecoveryHashRedirect />
      <LandingPage />
    </>
  );
}
