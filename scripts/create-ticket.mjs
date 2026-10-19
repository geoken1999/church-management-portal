// Logs a ticket in Super Admin → Tickets from the command line. Used whenever a bug is fixed or a feature is
// built, so the board is the record of what changed and why.
//
//   node --env-file=.env.local scripts/create-ticket.mjs --type bug --area mobile \
//     --title "Bell did not open" --description "Cause and fix..." [--status done] [--priority medium] \
//     [--assignee Claude] [--release "web 1.0.38"] [--refs "abc1234, migration 0200"]
//
// Types: bug, feature, improvement, change_request, security, task. Status defaults to "done".
import { createClient } from "@supabase/supabase-js";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const title = arg("title");
if (!url || !key || !title) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and --title.");
  process.exit(1);
}
const status = arg("status", "done");
const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supabase
  .from("change_tickets")
  .insert({
    type: arg("type", "bug"),
    title,
    description: arg("description") || null,
    status,
    priority: arg("priority", "medium"),
    area: arg("area", "general"),
    reported_by: arg("reported-by", "Platform team"),
    assignee: arg("assignee", "Claude") || null,
    release: arg("release") || null,
    references_text: arg("refs") || null,
    resolved_at: ["done", "closed", "wont_do"].includes(status) ? new Date().toISOString() : null,
  })
  .select("number")
  .single();
if (error) {
  console.error(
    error.message.includes("change_tickets")
      ? "The tickets table is missing: apply migration 0200_change_tickets_and_program_request_notice.sql first."
      : error.message,
  );
  process.exit(1);
}
console.log(`Created KF-${data.number}: ${title}`);
