// Rules for group chats that do not need a database, so they can be tested alone.

export const GROUP_CHAT_BUCKET = "group-chat";
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "heic"];
const FILE_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "txt",
  "rtf",
  "csv",
  "zip",
  "mp3",
  "m4a",
  "mp4",
];

export type AttachmentKind = "image" | "file";

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function attachmentKind(name: string): AttachmentKind | null {
  const ext = extensionOf(name);
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (FILE_EXTENSIONS.includes(ext)) return "file";
  return null;
}

// What to check before a file is accepted for upload; null when it is fine.
export function attachmentProblem(file: {
  name: string;
  size: number;
}): string | null {
  const kind = attachmentKind(file.name);
  if (!kind)
    return "That file type isn't accepted. Send a picture, a PDF, a Word, PowerPoint or Excel file, text, audio or a zip.";
  if (!(file.size > 0)) return "That file is empty.";
  if (kind === "image" && file.size > MAX_IMAGE_BYTES)
    return "That picture is too large. Keep it under 10 MB.";
  if (file.size > MAX_FILE_BYTES)
    return "That file is too large. Keep it under 25 MB.";
  return null;
}

// A name safe to keep in a storage path.
export function safeFileName(name: string): string {
  const ext = extensionOf(name);
  const base = (ext ? name.slice(0, -(ext.length + 1)) : name)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "file"}${ext ? `.${ext}` : ""}`;
}

// Where an upload goes: a folder per church, group and sender, so a path says whose it is.
export function attachmentPath(
  organizationId: string,
  groupId: string,
  authUserId: string,
  name: string,
  id: string,
): string {
  return `${organizationId}/${groupId}/${authUserId}/${id}-${safeFileName(name)}`;
}

/** Whether a path the app sends back lies in this person's own folder of this group. */
export function isOwnAttachmentPath(
  path: string,
  organizationId: string,
  groupId: string,
  authUserId: string,
): boolean {
  const prefix = `${organizationId}/${groupId}/${authUserId}/`;
  return (
    path.startsWith(prefix) &&
    !path.slice(prefix.length).includes("/") &&
    !path.includes("..")
  );
}

export interface MessageInput {
  body: string;
  hasAttachment: boolean;
  announcement: boolean;
}

// What to check before a message is posted; null when it is fine.
export function messageProblem(input: MessageInput): string | null {
  const body = input.body.trim();
  if (!body && !input.hasAttachment) return "Write a message or attach a file.";
  if (body.length > MAX_MESSAGE_CHARS)
    return `Keep the message under ${MAX_MESSAGE_CHARS} characters.`;
  if (input.announcement && !body) return "An announcement needs some words.";
  return null;
}

export interface Participant {
  authUserId: string | null;
  notifyMode: "all" | "mentions" | "none";
  mutedUntil: string | null;
}

/**
 * Who gets a push notification for a new message: everyone in the group with a login except the sender, then
 * each person's own setting. "all" gets every message, "mentions" only a message that @mentions them or an
 * announcement, "none" nothing, and a mute that has not run out silences everything.
 */
export function notificationRecipients(
  participants: Participant[],
  message: {
    senderAuthUserId: string | null;
    mentions: string[];
    announcement: boolean;
  },
  now: Date,
): string[] {
  const out: string[] = [];
  for (const p of participants) {
    if (!p.authUserId || p.authUserId === message.senderAuthUserId) continue;
    if (p.mutedUntil && new Date(p.mutedUntil).getTime() > now.getTime())
      continue;
    if (p.notifyMode === "none") continue;
    if (
      p.notifyMode === "mentions" &&
      !message.announcement &&
      !message.mentions.includes(p.authUserId)
    )
      continue;
    out.push(p.authUserId);
  }
  return out;
}

/** The words a notification shows for a message. */
export function previewOf(
  body: string | null,
  attachmentKind: AttachmentKind | null,
  max = 120,
): string {
  const text = (body ?? "").trim().replace(/\s+/g, " ");
  const shown =
    text ||
    (attachmentKind === "image"
      ? "Photo"
      : attachmentKind === "file"
        ? "File"
        : "");
  return shown.length > max ? `${shown.slice(0, max - 1)}…` : shown;
}
