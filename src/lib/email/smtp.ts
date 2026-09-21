import "server-only";

import nodemailer from "nodemailer";
import type { SendBulkEmailResult, EmailAttachment } from "@/lib/email/client";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

function buildTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: config.password },
  });
}

// Used both by the "Test connection" button before saving a config and as
// a pre-flight check before a real send, so a typo'd host/password shows
// up as a clear error immediately rather than as N per-recipient failures.
export async function verifySmtpConnection(config: SmtpConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await buildTransport(config).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't connect to that SMTP server." };
  }
}

// Nodemailer has no batch endpoint like Resend's — each recipient is its
// own sendMail() call over the same connection/pool, sequentially, since
// most SMTP servers (especially personal/shared ones like Gmail) rate-limit
// or reject bursts of concurrent connections.
export async function sendBulkEmailViaSmtp(
  config: SmtpConfig,
  params: {
    subject: string;
    html: string;
    recipients: string[];
    replyTo?: string;
    attachments?: EmailAttachment[];
  },
): Promise<SendBulkEmailResult> {
  const transport = buildTransport(config);
  const from = `${config.fromName} <${config.fromEmail}>`;

  let sentCount = 0;
  const failed: { email: string; error: string }[] = [];

  for (const email of params.recipients) {
    try {
      await transport.sendMail({
        from,
        to: email,
        subject: params.subject,
        html: params.html,
        replyTo: params.replyTo,
        attachments: params.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      sentCount += 1;
    } catch (err) {
      failed.push({ email, error: err instanceof Error ? err.message : "Send failed." });
    }
  }

  transport.close();
  return { sentCount, failed };
}
