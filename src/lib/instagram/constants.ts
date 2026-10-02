// Shared between client.ts (server-only) and the Instagram dashboard's
// Client Component — kept in their own file, with no "server-only" import,
// since a Client Component can't import real (non-type) values out of a
// server-only module.

// How far outside the 24-hour window Meta still allows a reply, as long as
// it's tagged HUMAN_AGENT (a real staff member responding, never automated).
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000;
