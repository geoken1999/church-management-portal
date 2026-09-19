import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/dal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";

export const metadata: Metadata = {
  title: "Set a new password | KingdomFlow",
};

export default async function ResetPasswordPage() {
  // Reachable only via the recovery link in /auth/callback, which
  // establishes a short-lived authenticated session first.
  const user = await getAuthUser();
  if (!user) {
    redirect("/forgot-password");
  }

  return (
    <Card size="lg">
      <CardHeader>
        <AuthBrandHeader />
        <CardTitle className="text-xl">Set a new password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
