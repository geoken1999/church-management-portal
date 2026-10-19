import { describe, expect, it } from "vitest";
import {
  isOwnPrayerAudioPath,
  MAX_PRAYER_AUDIO_BYTES,
  parseAudioSeconds,
  prayerAudioPath,
  prayerAudioProblem,
} from "./audio";
import { parsePrayerRequestInput } from "./validation";

const org = "11111111-1111-1111-1111-111111111111";
const member = "22222222-2222-2222-2222-222222222222";
const id = "33333333-3333-3333-3333-333333333333";

describe("voice message rules", () => {
  it("accepts a normal recording and refuses odd ones", () => {
    expect(prayerAudioProblem({ type: "audio/mp4", size: 200_000 })).toBeNull();
    expect(
      prayerAudioProblem({ type: "video/mp4", size: 200_000 }),
    ).not.toBeNull();
    expect(prayerAudioProblem({ type: "audio/mp4", size: 0 })).not.toBeNull();
    expect(
      prayerAudioProblem({
        type: "audio/mp4",
        size: MAX_PRAYER_AUDIO_BYTES + 1,
      }),
    ).not.toBeNull();
  });
  it("reads the length as whole seconds in range", () => {
    expect(parseAudioSeconds(12.4)).toBe(12);
    expect(parseAudioSeconds(0)).toBeNull();
    expect(parseAudioSeconds("5")).toBeNull();
    expect(parseAudioSeconds(500)).toBeNull();
    expect(parseAudioSeconds(92)).toBe(90);
  });
  it("only accepts a path inside the member's own folder", () => {
    const path = prayerAudioPath(org, member, "audio/mp4", id);
    expect(path).toBe(`${org}/${member}/${id}.m4a`);
    expect(isOwnPrayerAudioPath(path, org, member)).toBe(true);
    expect(
      isOwnPrayerAudioPath(path, org, "44444444-4444-4444-4444-444444444444"),
    ).toBe(false);
    expect(isOwnPrayerAudioPath(`${org}/${member}/../x.m4a`, org, member)).toBe(
      false,
    );
    expect(
      isOwnPrayerAudioPath(`${org}/${member}/${id}.m4a/extra`, org, member),
    ).toBe(false);
  });
});

describe("a request with a voice message", () => {
  const audio = { audioPath: `${org}/${member}/${id}.m4a`, audioSeconds: 20 };
  it("needs no words", () => {
    expect(
      parsePrayerRequestInput({ request: "", ...audio }).input,
    ).toMatchObject({ request: "", audioSeconds: 20 });
  });
  it("still needs words or a recording", () => {
    expect(parsePrayerRequestInput({ request: "" }).error).toBeDefined();
  });
  it("refuses a recording with no usable length", () => {
    expect(
      parsePrayerRequestInput({
        request: "",
        audioPath: audio.audioPath,
        audioSeconds: 0,
      }).error,
    ).toBeDefined();
  });
});
