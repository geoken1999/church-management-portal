import "server-only";

import { generateServerToken } from "@/lib/kmeet/token";

// Creates a new VideoSDK room — called once per meeting, either
// immediately (an instant meeting) or lazily, the first time anyone joins
// a scheduled one (see kmeet/actions.ts's joinMeetingAction).
export async function createVideoSdkRoom(): Promise<string> {
  const res = await fetch("https://api.videosdk.live/v2/rooms", {
    method: "POST",
    headers: {
      Authorization: generateServerToken(),
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Couldn't create a video room (${res.status}).`);
  }

  const data = (await res.json()) as { roomId?: string };
  if (!data.roomId) throw new Error("VideoSDK did not return a room id.");
  return data.roomId;
}
