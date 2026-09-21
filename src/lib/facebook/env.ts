export function getFacebookEnv() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      "Missing Facebook environment variables. Set FACEBOOK_APP_ID and " +
        "FACEBOOK_APP_SECRET in .env.local (see .env.example) — these are the " +
        "Meta app's own top-level App ID/Secret (Settings -> Basic), not the " +
        "Instagram-product-specific ones used for INSTAGRAM_APP_ID/SECRET.",
    );
  }

  return { appId, appSecret };
}
