export function getYouTubeEnv() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing YouTube environment variables. Set YOUTUBE_CLIENT_ID and " +
        "YOUTUBE_CLIENT_SECRET in .env.local (see .env.example) — these come " +
        "from an OAuth 2.0 Client ID in Google Cloud Console.",
    );
  }

  return { clientId, clientSecret };
}
