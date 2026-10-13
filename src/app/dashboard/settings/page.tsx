import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getPlanUsage } from "@/lib/plans/dal";
import { getEmailSmtpSummary, getEmailTemplates, isEmailAvailable } from "@/lib/email/dal";
import { getWhatsAppTemplates } from "@/lib/whatsapp/dal";
import { getWhatsAppConnectionSummary } from "@/lib/whatsapp/credentials";
import { getPlatformTemplatesForOwnNumber, syncPlatformTemplatesForOrg } from "@/lib/whatsapp/platform-templates";
import { getOrganizationPayoutDetails } from "@/lib/organizations/payout-details-dal";
import { getGivingConfig } from "@/lib/finance/giving-config";
import { getMembershipFeeSettings } from "@/lib/membership-fees/dal";
import { getSiteUrl } from "@/lib/site-url";
import { isSettingsSection, SettingsNav, type SettingsSectionKey } from "@/components/settings/SettingsNav";
import { SmtpSection } from "@/components/settings/SmtpSection";
import { EmailTemplatesManager } from "@/components/settings/EmailTemplatesManager";
import { PayoutDetailsCard } from "@/components/billing/PayoutDetailsCard";
import { GatewayAccountsCard } from "@/components/finance/GatewayAccountsCard";
import { MembershipFeeSettingsForm } from "@/components/membership/MembershipFeeSettingsForm";
import { WhatsAppConnectionCard } from "@/components/whatsapp/WhatsAppConnectionCard";
import { WhatsAppFallbackCard } from "@/components/whatsapp/WhatsAppFallbackCard";
import { PlatformTemplatesCard } from "@/components/whatsapp/PlatformTemplatesCard";
import { TemplatesManager } from "@/components/whatsapp/WhatsAppManager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Church settings | KingdomFlow",
};

function LinkCards({ items }: { items: { href: string; title: string; description: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="group rounded-lg border border-border p-4 transition-colors hover:bg-accent/50">
          <p className="flex items-center justify-between gap-2 text-sm font-medium">
            {item.title}
            <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
        </Link>
      ))}
    </div>
  );
}

const SECTION_TITLES: Record<SettingsSectionKey, { title: string; blurb: string }> = {
  church: { title: "Church & app", blurb: "Your church's details, and how it looks to members." },
  payments: { title: "Payments & payouts", blurb: "How money reaches you, and the monthly membership fee." },
  email: { title: "Email", blurb: "Where your emails are sent from, and the templates you start them from." },
  whatsapp: { title: "WhatsApp", blurb: "Your WhatsApp number, what happens when a message can't be delivered, and message templates." },
  automations: { title: "Automations & AI", blurb: "The messages your automations send, and how the AI assistant behaves." },
  accounts: { title: "Connected accounts", blurb: "Your social accounts." },
};

export default async function ChurchSettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const membership = await requireOrganization();
  if (membership.role !== "owner" && membership.role !== "admin") redirect("/dashboard");

  const { section: requested } = await searchParams;
  const section: SettingsSectionKey = isSettingsSection(requested) ? requested : "church";
  const organizationId = membership.organization.id;
  const head = SECTION_TITLES[section];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Church settings</h1>
        <p className="mt-1 text-muted-foreground">Everything that is set up once for {membership.organization.name}, in one place.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <SettingsNav active={section} />

        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="font-heading text-xl font-bold">{head.title}</h2>
            <p className="text-sm text-muted-foreground">{head.blurb}</p>
          </div>

          {section === "church" && (
            <LinkCards
              items={[
                { href: "/dashboard/profile", title: "Church profile", description: "Name, address, country, time zone, logo and your own account." },
                { href: "/dashboard/branches", title: "Branches", description: "Your campuses, with their own leader, country and phone format." },
                { href: "/dashboard/mobile", title: "Mobile app", description: "Which features members see, and the design of their Home screen." },
                { href: "/dashboard/mobile/giving", title: "Online giving", description: "Let members give from the app, and which kinds of gifts." },
                { href: "/dashboard/widget", title: "Website widget", description: "The chat-style form for your church website." },
                { href: "/dashboard/team", title: "Team & permissions", description: "Who can sign in and what each person can do." },
                { href: "/dashboard/billing", title: "Plan & billing", description: "Your subscription, add-on packs and usage." },
              ]}
            />
          )}

          {section === "payments" && <PaymentsSection organizationId={organizationId} canWriteDonations={membership.tabAccess.donations.write} />}

          {section === "email" && <EmailSection organizationId={organizationId} canWrite={membership.tabAccess.email.write} />}

          {section === "whatsapp" && <WhatsAppSection organizationId={organizationId} fallback={membership.organization.whatsapp_fallback ?? "none"} />}

          {section === "automations" && (
            <LinkCards
              items={[
                { href: "/dashboard/automations/templates", title: "Automation message templates", description: "The messages birthday, anniversary and staff digest automations send." },
                { href: "/dashboard/automations", title: "Automations", description: "Your birthday and anniversary automations." },
                { href: "/dashboard/automation/followup", title: "Member follow-up", description: "Tasks (and WhatsApp messages) for members who have stopped coming." },
                { href: "/dashboard/ai-rules", title: "AI rules", description: "What the AI assistant may and may not say when it replies for you." },
              ]}
            />
          )}

          {section === "accounts" && (
            <LinkCards
              items={[
                { href: "/dashboard/instagram", title: "Instagram", description: "Connect your account to manage messages and posts." },
                { href: "/dashboard/youtube", title: "YouTube", description: "Connect your channel and see your videos." },
                { href: "/dashboard/facebook", title: "Facebook", description: "Connect your page." },
              ]}
            />
          )}
        </div>
      </div>
    </div>
  );
}

async function PaymentsSection({ organizationId, canWriteDonations }: { organizationId: string; canWriteDonations: boolean }) {
  const [payoutDetails, giving, feeSettings, { plan }] = await Promise.all([
    getOrganizationPayoutDetails(organizationId),
    getGivingConfig(organizationId),
    getMembershipFeeSettings(organizationId),
    getPlanUsage(organizationId),
  ]);
  return (
    <div className="space-y-6">
      <PayoutDetailsCard organizationId={organizationId} defaultValues={payoutDetails} />
      {giving.ownGatewayAvailable && giving.financeAvailable ? (
        <GatewayAccountsCard connected={giving.connected} active={giving.ownGateway} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Your own payment gateway</CardTitle>
            <CardDescription>Collecting gifts into your own Razorpay or PayU account isn&apos;t included on the {plan.name} plan. Upgrade to unlock it; until then gifts go through KingdomFlow&apos;s shared account.</CardDescription>
          </CardHeader>
        </Card>
      )}
      {plan.financeEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Monthly membership fee</CardTitle>
            <CardDescription>
              {feeSettings?.enabled ? "Collecting monthly fees." : "Off. Nothing is requested from members until you turn this on."} See who has paid on the{" "}
              <Link href="/dashboard/membership-fees" className="underline underline-offset-2">
                Membership fees
              </Link>{" "}
              page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MembershipFeeSettingsForm settings={feeSettings} canWrite={canWriteDonations} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function EmailSection({ organizationId, canWrite }: { organizationId: string; canWrite: boolean }) {
  const [smtpSummary, emailAvailable, templates, { plan }] = await Promise.all([
    getEmailSmtpSummary(organizationId),
    isEmailAvailable(organizationId),
    getEmailTemplates(organizationId),
    getPlanUsage(organizationId),
  ]);
  return (
    <div className="space-y-6">
      <SmtpSection summary={smtpSummary} emailAvailable={emailAvailable} customSmtpEnabled={plan.customSmtpEnabled} planName={plan.name} />
      <EmailTemplatesManager templates={templates} canManage={canWrite} />
    </div>
  );
}

async function WhatsAppSection({ organizationId, fallback }: { organizationId: string; fallback: "none" | "sms" | "email" }) {
  // KingdomFlow's ready-made templates, copied in for churches on the shared number before the list is read.
  await syncPlatformTemplatesForOrg(organizationId);
  const [templates, connection] = await Promise.all([getWhatsAppTemplates(organizationId), getWhatsAppConnectionSummary(organizationId, true)]);
  return (
    <div className="space-y-6">
      <WhatsAppConnectionCard connection={connection} isOrgAdmin webhookUrl={`${getSiteUrl()}/api/whatsapp/webhook`} />
      <WhatsAppFallbackCard initial={fallback} />
      {connection && <PlatformTemplatesCard templates={await getPlatformTemplatesForOwnNumber(templates.map((t) => t.name))} />}
      <TemplatesManager organizationId={organizationId} templates={templates} canManage />
    </div>
  );
}
