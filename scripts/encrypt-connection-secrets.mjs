// One-off: encrypts the connection secrets that were stored as plain text before CONNECTION_SECRETS_KEY
// existed (social media tokens, churches' own payment-gateway keys, SMTP passwords). Safe to run again: values
// that are already encrypted are skipped.
//
//   node --env-file=.env.local scripts/encrypt-connection-secrets.mjs          # dry run: only counts
//   node --env-file=.env.local scripts/encrypt-connection-secrets.mjs --apply  # encrypts
//
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CONNECTION_SECRETS_KEY.
// Deploy the app version that understands encrypted values BEFORE running this with --apply.
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "cs1";
const apply = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rawKey = process.env.CONNECTION_SECRETS_KEY;
if (!url || !serviceRole || !rawKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CONNECTION_SECRETS_KEY first.");
  process.exit(1);
}
const key = Buffer.from(rawKey, "base64");
if (key.length !== 32) {
  console.error("CONNECTION_SECRETS_KEY must be 32 bytes, base64-encoded.");
  process.exit(1);
}

function seal(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

const TARGETS = [
  { table: "instagram_connections", id: "id", columns: ["access_token"] },
  { table: "youtube_connections", id: "id", columns: ["access_token", "refresh_token"] },
  { table: "facebook_connections", id: "organization_id", columns: ["access_token"] },
  { table: "email_smtp_settings", id: "organization_id", columns: ["password"] },
  { table: "organization_razorpay_accounts", id: "organization_id", columns: ["key_secret"] },
  { table: "organization_gateway_accounts", id: "id", columns: ["key_secret"] },
];

const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });
let total = 0;
for (const target of TARGETS) {
  const { data, error } = await supabase.from(target.table).select([target.id, ...target.columns].join(", "));
  if (error) {
    console.error(`${target.table}: ${error.message}`);
    process.exitCode = 1;
    continue;
  }
  let changed = 0;
  for (const row of data ?? []) {
    const patch = {};
    for (const column of target.columns) {
      const value = row[column];
      if (typeof value === "string" && value && !value.startsWith(`${PREFIX}.`)) patch[column] = seal(value);
    }
    if (Object.keys(patch).length === 0) continue;
    changed += 1;
    if (apply) {
      const { error: updateError } = await supabase.from(target.table).update(patch).eq(target.id, row[target.id]);
      if (updateError) {
        console.error(`${target.table} ${row[target.id]}: ${updateError.message}`);
        process.exitCode = 1;
        changed -= 1;
      }
    }
  }
  total += changed;
  console.log(`${target.table}: ${changed} row(s) ${apply ? "encrypted" : "to encrypt"} (of ${(data ?? []).length})`);
}
console.log(apply ? `Done. ${total} row(s) encrypted.` : `Dry run: ${total} row(s) would be encrypted. Run again with --apply.`);
