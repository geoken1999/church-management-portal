import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/dal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AcceptInvitationForm } from "@/components/organizations/AcceptInvitationForm";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";

export const metadata: Metadata = {
  title: "You're invited | KingdomFlow",
};

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invitation_preview", { invite_token: token }).maybeSingle();
  const user = await getAuthUser();

  if (!data || data.status !== "pending" || new Date(data.expires_at) < new Date()) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 sm:px-6">
        <Card size="lg">
          <CardHeader>
            <AuthBrandHeader />
            <CardTitle className="text-xl">Invitation not found</CardTitle>
            <CardDescription>
              This invitation link is invalid, has already been used, or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login" className="text-sm font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const next = `/invite/${token}`;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <Card size="lg">
        <CardHeader>
          <AuthBrandHeader />
          <CardTitle className="text-xl">You&apos;re invited to {data.organization_name}</CardTitle>
          <CardDescription>Invitation sent to {data.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="flex-1"
                nativeButton={false}
                render={<Link href={`/signup?next=${encodeURIComponent(next)}`}>Create account</Link>}
              />
              <Button
                variant="outline"
                className="flex-1"
                nativeButton={false}
                render={<Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>}
              />
            </div>
          )}

          {user && user.email?.toLowerCase() !== data.email.toLowerCase() && (
            <Alert variant="destructive">
              <AlertDescription>
                This invite was sent to {data.email}, but you&apos;re signed in as {user.email}.
              </AlertDescription>
            </Alert>
          )}

          {user && user.email?.toLowerCase() === data.email.toLowerCase() && (
            <AcceptInvitationForm token={token} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
