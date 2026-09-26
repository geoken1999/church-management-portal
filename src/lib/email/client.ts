import "server-only";

import { Resend } from "resend";
import { getEmailEnv } from "@/lib/email/env";

// Resend's batch endpoint accepts a bounded number of emails per call —
// chunking keeps every call well under that regardless of the exact limit.
const BATCH_SIZE = 100;

export interface SendBulkEmailResult {
  sentCount: number;
  failed: { email: string; error: string }[];
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
  // Set to embed this attachment inline (referenced in `html` via
  // `cid:<contentId>`) rather than only offering it as a separate
  // downloadable file — Resend still keeps it as a real attachment either
  // way, just also inline-renderable.
  contentId?: string;
}

interface SendBulkEmailParams {
  fromName: string;
  subject: string;
  html: string;
  recipients: string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
  // Carried through to Resend as a tag so the delivery-status webhook
  // (src/app/api/resend/webhook) can attribute a later bounce/failure
  // event back to the right org — Resend's webhooks are account-wide, not
  // per-org, so there's no other way to know whose email a given event
  // belongs to. Optional since not every caller (e.g. platform-admin's own
  // notification emails) has an organization to attribute to.
  organizationId?: string;
}

export async function sendBulkEmail(params: SendBulkEmailParams): Promise<SendBulkEmailResult> {
  const { apiKey, fromAddress } = getEmailEnv();
  const resend = new Resend(apiKey);
  const from = `${params.fromName} <${fromAddress}>`;

  // Resend's batch endpoint explicitly doesn't support attachments — fall
  // back to one emails.send() call per recipient when there are any.
  if (params.attachments && params.attachments.length > 0) {
    return sendIndividually(resend, from, params);
  }

  let sentCount = 0;
  const failed: { email: string; error: string }[] = [];

  for (let i = 0; i < params.recipients.length; i += BATCH_SIZE) {
    const chunk = params.recipients.slice(i, i + BATCH_SIZE);

    const { data, error } = await resend.batch.send(
      chunk.map((email) => ({
        from,
        to: [email],
        subject: params.subject,
        html: params.html,
        replyTo: params.replyTo,
        tags: params.organizationId ? [{ name: "organization_id", value: params.organizationId }] : undefined,
      })),
      // "permissive" lets valid recipients in a chunk send even if a few
      // addresses in the same chunk fail validation — without it, one bad
      // address 400s the whole chunk instead of just itself.
      { batchValidation: "permissive" },
    );

    if (error) {
      // The call itself failed (auth, rate limit, network) — every
      // recipient in this chunk counts as failed with the same reason.
      for (const email of chunk) failed.push({ email, error: error.message });
      continue;
    }

    sentCount += data.data.length;
    for (const failure of data.errors ?? []) {
      const email = chunk[failure.index];
      if (email) failed.push({ email, error: failure.message });
    }
  }

  return { sentCount, failed };
}

async function sendIndividually(
  resend: Resend,
  from: string,
  params: SendBulkEmailParams,
): Promise<SendBulkEmailResult> {
  let sentCount = 0;
  const failed: { email: string; error: string }[] = [];

  for (const email of params.recipients) {
    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        contentId: a.contentId,
      })),
      tags: params.organizationId ? [{ name: "organization_id", value: params.organizationId }] : undefined,
    });

    if (error) failed.push({ email, error: error.message });
    else sentCount += 1;
  }

  return { sentCount, failed };
}
