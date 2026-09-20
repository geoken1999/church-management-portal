export function getInstagramEnv() {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      "Missing Instagram environment variables. Set INSTAGRAM_APP_ID and " +
        "INSTAGRAM_APP_SECRET in .env.local (see .env.example) — these come " +
        "from your Meta app's Instagram API product settings.",
    );
  }

  return { appId, appSecret };
}
