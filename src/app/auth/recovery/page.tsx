"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useRecoveryHash } from "@/components/auth/RecoveryHashHandler";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";
import { Button } from "@/components/ui/button";

// The redirectTo target for a password-reset link (see requestPasswordReset
// in src/lib/auth/actions.ts) — a plain page outside the (auth) route
// group's normal login/signup/forgot-password/reset-password set, since
// this one is Supabase-flow plumbing (parallel to src/app/auth/callback)
// rather than a page a user navigates to directly.
export default function RecoveryPage() {
  const router = useRouter();
  const status = useRecoveryHash(() => router.replace("/reset-password"));

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 sm:px-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(ellipse_60%_60%_at_50%_-10%,var(--color-accent),transparent)]"
        aria-hidden
      />
      <div className="w-full max-w-md">
        <Card size="lg">
          <CardHeader>
            <AuthBrandHeader />
            <CardTitle className="text-xl">
              {status === "error" || status === "none" ? "This link isn't valid" : "Verifying your link"}
            </CardTitle>
            <CardDescription>
              {status === "checking" && "Hang on a moment..."}
              {status === "success" && "You're verified — taking you to set a new password."}
              {(status === "error" || status === "none") &&
                "This password reset link is invalid or has expired. Request a new one to continue."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status === "checking" || status === "success" ? (
              <div className="flex justify-center py-4">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Button className="w-full" nativeButton={false} render={<Link href="/forgot-password">Request a new link</Link>} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
