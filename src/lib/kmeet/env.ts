import "server-only";

export function getVideoSdkEnv() {
  const apiKey = process.env.VIDEOSDK_API_KEY;
  const secret = process.env.VIDEOSDK_SECRET;

  if (!apiKey || !secret) {
    throw new Error("VIDEOSDK_API_KEY and VIDEOSDK_SECRET must be set to use K-Meet.");
  }

  return { apiKey, secret };
}

export function isVideoSdkConfigured(): boolean {
  return Boolean(process.env.VIDEOSDK_API_KEY && process.env.VIDEOSDK_SECRET);
}
