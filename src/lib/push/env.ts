import "server-only";

// Same shape Firebase's console hands you when you generate a service
// account key (Project Settings -> Service Accounts -> Generate new
// private key) — stored whole, as one JSON string, in
// FIREBASE_SERVICE_ACCOUNT_JSON rather than as separate env vars, since
// that's the format Firebase itself gives you and it saves re-assembling
// it from parts.
export function getPushEnv(): { projectId: string; clientEmail: string; privateKey: string } {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be set to send push notifications.");
  }

  let parsed: { project_id?: string; client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }

  const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = parsed;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id, client_email, or private_key.");
  }

  // Env vars can't hold literal newlines — the key is stored with escaped
  // "\n" sequences, same fix Vercel's own Firebase docs call out.
  return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
}
