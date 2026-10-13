"use client";

import { useRouter } from "next/navigation";
import { SmtpSettingsCard } from "@/components/email/EmailManager";
import type { EmailSmtpSummary } from "@/lib/email/dal";

// The church's own mail server: shown here so every church-level setting is in one place.
export function SmtpSection({ summary, emailAvailable, customSmtpEnabled, planName }: { summary: EmailSmtpSummary | null; emailAvailable: boolean; customSmtpEnabled: boolean; planName: string }) {
  const router = useRouter();
  if (!customSmtpEnabled) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        Sending from your own mail server isn&apos;t included on the {planName} plan. Upgrade to unlock it. Until then email goes out through the shared KingdomFlow service.
      </div>
    );
  }
  return <SmtpSettingsCard summary={summary} emailAvailable={emailAvailable} onChanged={() => router.refresh()} />;
}
