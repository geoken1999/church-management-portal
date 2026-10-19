// Changes the key that protects the churches' connection secrets (see docs/security.md).
//
//   1. Generate the new key:            openssl rand -base64 32
//   2. Dry run:                         CONNECTION_SECRETS_KEY_OLD=<current> CONNECTION_SECRETS_KEY=<new> \
//                                         node --env-file=.env.local scripts/rotate-connection-secrets.mjs
//   3. Apply:                           ... same command with --apply
//   4. Put the NEW key in the app's environment as CONNECTION_SECRETS_KEY and deploy. Keep the old key until
//      you have checked that connections still work.
//
// Between step 3 and step 4 the app (still on the old key) cannot read re-encrypted rows, so do both within a
// few minutes, or pause social posting and the daily jobs. Safe to run again: rows already on the new key are
// skipped, and a value that opens with neither key is reported and left untouched.
//
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CONNECTION_SECRETS_KEY_OLD, CONNECTION_SECRETS_KEY.
import { createClient } from "@supabase/supabase-js";
import { parseKey, rekey, TARGETS } from "./connection-secrets-lib.mjs";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
let oldKey;
let newKey;
try {
  oldKey = parseKey(process.env.CONNECTION_SECRETS_KEY_OLD, "CONNECTION_SECRETS_KEY_OLD");
  newKey = parseKey(process.env.CONNECTION_SECRETS_KEY, "CONNECTION_SECRETS_KEY");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
if (oldKey.equals(newKey)) {
  console.error("The old and the new key are the same.");
  process.exit(1);
}

const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });
const totals = { rotate: 0, seal: 0, keep: 0, unreadable: 0 };
for (const target of TARGETS) {
  const { data, error } = await supabase.from(target.table).select([target.id, ...target.columns].join(", "));
  if (error) {
    console.error(`${target.table}: ${error.message}`);
    process.exitCode = 1;
    continue;
  }
  for (const row of data ?? []) {
    const patch = {};
    for (const column of target.columns) {
      const value = row[column];
      if (typeof value !== "string" || !value) continue;
      const result = rekey(value, oldKey, newKey);
      totals[result.action] += 1;
      if (result.action === "unreadable") console.error(`${target.table} ${row[target.id]} ${column}: opens with neither key (left as is)`);
      else if (result.value) patch[column] = result.value;
    }
    if (apply && Object.keys(patch).length > 0) {
      const { error: updateError } = await supabase.from(target.table).update(patch).eq(target.id, row[target.id]);
      if (updateError) {
        console.error(`${target.table} ${row[target.id]}: ${updateError.message}`);
        process.exitCode = 1;
      }
    }
  }
}
console.log(
  `${apply ? "Done" : "Dry run"}: ${totals.rotate} re-encrypted, ${totals.seal} encrypted from plain text, ${totals.keep} already on the new key, ${totals.unreadable} unreadable.`,
);
if (totals.unreadable > 0) process.exitCode = 1;
if (!apply) console.log("Run again with --apply to make the changes.");
