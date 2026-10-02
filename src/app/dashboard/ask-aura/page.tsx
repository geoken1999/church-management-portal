import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { requireOrganization } from "@/lib/organizations/dal";
import { getAuraMessages } from "@/lib/aura/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { AuraChat } from "@/components/aura/AuraChat";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Ask Aura | KingdomFlow",
};

export default async function AskAuraPage() {
  const user = await requireUser();
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.aitools.read) {
    return <AccessRestricted label="AI Tools" />;
  }

  const [messages, planUsage] = await Promise.all([getAuraMessages(organizationId, user.id), getPlanUsage(organizationId)]);

  return (
    <div className="flex h-full min-h-0 flex-col space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Ask Aura</h1>
        <p className="mt-1 text-muted-foreground">
          Your organization&apos;s AI assistant — ask about attendance, members, events, or giving and get a real answer from your own data.
        </p>
      </div>

      <AuraChat
        initialMessages={messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
        aiRepliesRemaining={planUsage.aiRepliesRemaining}
        canWrite={membership.tabAccess.aitools.write}
      />
    </div>
  );
}
