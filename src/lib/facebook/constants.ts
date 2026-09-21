// Split out from actions.ts — a "use server" file may only export async
// functions, so this plain constant (needed by both actions.ts and the
// OAuth callback route) lives here instead.
export const PENDING_PAGES_COOKIE = "fb_pending_pages";
