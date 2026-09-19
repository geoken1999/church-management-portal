import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { getActiveOrganization, getPendingInvitationsForMe } from "@/lib/organizations/dal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreateOrganizationForm } from "@/components/organizations/CreateOrganizationForm";
import { PendingInvitations } from "@/components/organizations/PendingInvitations";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";

export const metadata: Metadata = {
  title: "Set up your organization | KingdomFlow",
};

export default async function OnboardingPage() {
  await requireUser();

  const activeOrg = await getActiveOrganization();
  if (activeOrg) {
    redirect("/dashboard");
  }

  const invitations = await getPendingInvitationsForMe();

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12 sm:px-6">
      <div className="space-y-6">
        <PendingInvitations invitations={invitations} />

        <Card size="lg">
          <CardHeader>
            <AuthBrandHeader />
            <CardTitle className="text-xl">
              {invitations.length > 0 ? "Or set up your own church" : "Tell us about your church"}
            </CardTitle>
            <CardDescription>
              A few details to set up your church&apos;s workspace. You can invite your team once
              it&apos;s created.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateOrganizationForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
