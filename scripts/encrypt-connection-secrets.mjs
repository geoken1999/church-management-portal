// One-off: encrypts the connection secrets that were stored as plain text before CONNECTION_SECRETS_KEY
// existed (social media tokens, churches' own payment-gateway keys, SMTP passwords). Safe to run again: values
// that are already encrypted are skipped.
//
//   node --env-file=.env.local scripts/encrypt-connection-secrets.mjs          # dry run: only counts
//   node --env-file=.env.local scripts/encrypt-connection-secrets.mjs --apply  # encrypts
//
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CONNECTION_SECRETS_KEY.
// Deploy the app version that understands encrypted values BEFORE running this with --apply.
import { createClient } from "@supabase/supabase-js";
import { isSealed, parseKey, seal, TARGETS } from "./connection-secrets-lib.mjs";

const apply = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CONNECTION_SECRETS_KEY first.");
  process.exit(1);
}
let key;
try {
  key = parseKey(process.env.CONNECTION_SECRETS_KEY, "CONNECTION_SECRETS_KEY");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

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
      if (typeof value === "string" && value && !isSealed(value)) patch[column] = seal(value, key);
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
