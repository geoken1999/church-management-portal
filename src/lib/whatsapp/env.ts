import "server-only";

// One platform-wide WhatsApp Business number via Meta's Cloud API,
// shared by every org on KingdomFlow — there's no per-org "own number"
// concept anymore (see migration 0097), so these are plain env vars, not
// a per-org connection table.
export function getMetaWhatsAppEnv() {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const businessAccountId = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID;
  const appSecret = process.env.META_WHATSAPP_APP_SECRET;
  const apiVersion = process.env.META_WHATSAPP_API_VERSION || "v21.0";

  if (!accessToken || !phoneNumberId || !businessAccountId || !appSecret) {
    throw new Error(
      "META_WHATSAPP_ACCESS_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID, META_WHATSAPP_BUSINESS_ACCOUNT_ID, and META_WHATSAPP_APP_SECRET must be set to use WhatsApp.",
    );
  }

  return { accessToken, phoneNumberId, businessAccountId, appSecret, apiVersion };
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.META_WHATSAPP_ACCESS_TOKEN &&
      process.env.META_WHATSAPP_PHONE_NUMBER_ID &&
      process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID &&
      process.env.META_WHATSAPP_APP_SECRET,
  );
}

export function getMetaWhatsAppWebhookVerifyToken(): string | undefined {
  return process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
}
