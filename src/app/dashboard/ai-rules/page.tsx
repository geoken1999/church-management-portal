import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getAiDataAccessRules } from "@/lib/ai-rules/dal";
import { AiRulesManager } from "@/components/ai-rules/AiRulesManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "AI Rules | KingdomFlow",
};

export default async function AiRulesPage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.airules.read) {
    return <AccessRestricted label="AI Rules" />;
  }

  const rules = await getAiDataAccessRules(organizationId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">AI Rules</h1>
        <p className="mt-1 text-muted-foreground">Control what data your AI features are allowed to use when answering questions.</p>
      </div>

      <AiRulesManager rules={rules} canWrite={membership.tabAccess.airules.write} />
    </div>
  );
}
