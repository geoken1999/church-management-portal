import { describe, expect, it } from "vitest";
import { buildPushBatches } from "@/lib/push/messages";

const rows = [
  { token: "a1", platform: "android" },
  { token: "i1", platform: "ios" },
];

describe("buildPushBatches", () => {
  it("sends one normal notification to everyone when there is no button", () => {
    const batches = buildPushBatches(rows, { title: "T", body: "B", data: { link: "https://x.com" } });
    expect(batches).toHaveLength(1);
    expect(batches[0].tokens).toEqual(["a1", "i1"]);
    expect(batches[0].message.notification).toEqual({ title: "T", body: "B" });
  });
  it("sends Android a data-only message when there is a link and a button", () => {
    const batches = buildPushBatches(rows, { title: "T", body: "B", data: { link: "https://x.com", buttonLabel: "Join" } });
    expect(batches).toHaveLength(2);
    expect(batches[0].tokens).toEqual(["i1"]);
    expect(batches[1].tokens).toEqual(["a1"]);
    expect(batches[1].message.notification).toBeUndefined();
    expect(batches[1].message.data).toMatchObject({ title: "T", body: "B", buttonLabel: "Join", link: "https://x.com" });
    // The iPhone gets a notification with the Join button category.
    expect(batches[0].message.apns?.payload.aps.category).toBe("btn_join");
    expect(batches[0].message.data?.payload).toContain("https://x.com");
  });
  it("falls back to the Open button for a label the iPhone doesn't know", () => {
    const batches = buildPushBatches([{ token: "i1", platform: "ios" }], { title: "T", body: "B", data: { link: "https://x.com", buttonLabel: "Come along" } });
    expect(batches[0].message.apns?.payload.aps.category).toBe("btn_open");
  });
  it("needs a link as well as a button label", () => {
    expect(buildPushBatches(rows, { title: "T", body: "B", data: { buttonLabel: "Join" } })).toHaveLength(1);
  });

  it("asks iPhones to play a sound and deliver at once, with or without a button", () => {
    const plain = buildPushBatches([{ token: "ios1", platform: "ios" }], { title: "Hi", body: "There" });
    expect(plain[0].message.apns).toEqual({ headers: { "apns-priority": "10" }, payload: { aps: { sound: "default" } } });
    const button = buildPushBatches([{ token: "ios1", platform: "ios" }], { title: "Hi", body: "There", data: { link: "/x", buttonLabel: "Join" } });
    expect(button[0].message.apns?.payload.aps).toMatchObject({ sound: "default", category: "btn_join" });
  });
});