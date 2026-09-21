import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isEmailConfigured } from "@/lib/email/env";
import { getPlanUsage } from "@/lib/plans/dal";

export const getEmailCampaigns = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_campaigns")
    .select("*, profiles(first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
});

// Returns the full row, including the password — this file is server-only
// and every caller must be careful never to forward it into a Client
// Component prop (see EmailSmtpSummary below for the client-safe shape).
export const getEmailSmtpSettings = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_smtp_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data;
});

export interface EmailSmtpSummary {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string | null;
}

export const getEmailSmtpSummary = cache(async (organizationId: string): Promise<EmailSmtpSummary | null> => {
  const settings = await getEmailSmtpSettings(organizationId);
  if (!settings) return null;

  return {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    username: settings.username,
    fromEmail: settings.from_email,
    fromName: settings.from_name,
  };
});

// An org can send either through its own SMTP config (always available,
// unmetered) or the shared Resend account (available only while this
// month's plan quota isn't exhausted).
export async function isEmailAvailable(organizationId: string): Promise<boolean> {
  const settings = await getEmailSmtpSettings(organizationId);
  if (settings) return true;

  if (!isEmailConfigured()) return false;

  const usage = await getPlanUsage(organizationId);
  return usage.emailsRemaining > 0;
}

// Only the latest request matters for the UI — it decides whether to show
// "Raise a ticket" or "Request sent, we'll be in touch".
export const getLatestEmailSetupRequest = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_setup_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
});
