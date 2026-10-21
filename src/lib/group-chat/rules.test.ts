import { describe, expect, it } from "vitest";
import {
  attachmentKind,
  attachmentPath,
  attachmentProblem,
  isOwnAttachmentPath,
  messageProblem,
  notificationRecipients,
  previewOf,
  safeFileName,
} from "./rules";

describe("attachments", () => {
  it("tells pictures from files and refuses programs", () => {
    expect(attachmentKind("photo.JPG")).toBe("image");
    expect(attachmentKind("plan.pdf")).toBe("file");
    expect(attachmentKind("run.exe")).toBeNull();
    expect(attachmentProblem({ name: "run.exe", size: 10 })).toMatch(
      /isn't accepted/,
    );
  });
  it("limits size by kind", () => {
    expect(
      attachmentProblem({ name: "a.png", size: 11 * 1024 * 1024 }),
    ).toMatch(/under 10 MB/);
    expect(
      attachmentProblem({ name: "a.pdf", size: 11 * 1024 * 1024 }),
    ).toBeNull();
    expect(
      attachmentProblem({ name: "a.pdf", size: 26 * 1024 * 1024 }),
    ).toMatch(/under 25 MB/);
    expect(attachmentProblem({ name: "a.pdf", size: 0 })).toMatch(/empty/);
  });
  it("keeps paths inside the sender's own folder", () => {
    expect(safeFileName("../My photo (1).jpg")).toBe("My-photo-1.jpg");
    const path = attachmentPath("org", "grp", "usr", "a b.png", "id1");
    expect(path).toBe("org/grp/usr/id1-a-b.png");
    expect(isOwnAttachmentPath(path, "org", "grp", "usr")).toBe(true);
    expect(isOwnAttachmentPath(path, "org", "grp", "someone-else")).toBe(false);
    expect(
      isOwnAttachmentPath("org/grp/usr/../other/x.png", "org", "grp", "usr"),
    ).toBe(false);
    expect(
      isOwnAttachmentPath("org/grp/usr/sub/x.png", "org", "grp", "usr"),
    ).toBe(false);
  });
});

describe("messages", () => {
  it("needs words or a file, and not too many words", () => {
    expect(
      messageProblem({ body: "  ", hasAttachment: false, announcement: false }),
    ).toMatch(/Write a message/);
    expect(
      messageProblem({ body: "", hasAttachment: true, announcement: false }),
    ).toBeNull();
    expect(
      messageProblem({
        body: "x".repeat(4001),
        hasAttachment: false,
        announcement: false,
      }),
    ).toMatch(/under 4000/);
    expect(
      messageProblem({ body: "", hasAttachment: true, announcement: true }),
    ).toMatch(/announcement needs/);
  });
  it("previews text, a photo or a file", () => {
    expect(previewOf("  hello   world ", null)).toBe("hello world");
    expect(previewOf("", "image")).toBe("Photo");
    expect(previewOf(null, "file")).toBe("File");
    expect(previewOf("x".repeat(200), null, 10)).toHaveLength(10);
  });
});

describe("who is notified", () => {
  const now = new Date("2025-03-01T12:00:00Z");
  const people = [
    { authUserId: "sender", notifyMode: "all" as const, mutedUntil: null },
    { authUserId: "all", notifyMode: "all" as const, mutedUntil: null },
    {
      authUserId: "mentions",
      notifyMode: "mentions" as const,
      mutedUntil: null,
    },
    { authUserId: "none", notifyMode: "none" as const, mutedUntil: null },
    {
      authUserId: "muted",
      notifyMode: "all" as const,
      mutedUntil: "2025-03-01T13:00:00Z",
    },
    {
      authUserId: "mute-over",
      notifyMode: "all" as const,
      mutedUntil: "2025-03-01T11:00:00Z",
    },
    { authUserId: null, notifyMode: "all" as const, mutedUntil: null },
  ];
  it("sends an ordinary message to people on 'all' whose mute has run out, never to the sender", () => {
    expect(
      notificationRecipients(
        people,
        { senderAuthUserId: "sender", mentions: [], announcement: false },
        now,
      ),
    ).toEqual(["all", "mute-over"]);
  });
  it("adds people on 'mentions' only when mentioned or for an announcement", () => {
    expect(
      notificationRecipients(
        people,
        {
          senderAuthUserId: "sender",
          mentions: ["mentions"],
          announcement: false,
        },
        now,
      ),
    ).toContain("mentions");
    expect(
      notificationRecipients(
        people,
        { senderAuthUserId: "sender", mentions: [], announcement: true },
        now,
      ),
    ).toContain("mentions");
  });
  it("never reaches someone on 'none' or muted, even when mentioned", () => {
    const out = notificationRecipients(
      people,
      {
        senderAuthUserId: "sender",
        mentions: ["none", "muted"],
        announcement: true,
      },
      now,
    );
    expect(out).not.toContain("none");
    expect(out).not.toContain("muted");
  });
});
