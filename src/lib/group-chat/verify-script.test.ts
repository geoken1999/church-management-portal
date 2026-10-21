import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The verify script for migrations 0199 to 0207 (supabase/setup) must run as written. Here it runs against the
// group chat migrations in PGlite: what is applied reads OK, and what this small database does not have (the
// older tables, the Realtime publication) reads MISSING, which proves the script tells the two apart.
describe("verify-migrations-0199-0207.sql", () => {
  it("runs, and tells applied from missing", async () => {
    const db = new PGlite();
    await db.exec(
      readFileSync("src/lib/lms/test-support/supabase-stub.sql", "utf8"),
    );
    await db.exec(
      readFileSync("supabase/migrations/0206_church_group_chats.sql", "utf8"),
    );
    await db.exec(
      readFileSync("supabase/migrations/0207_group_chat_team_view.sql", "utf8"),
    );
    const { rows } = await db.query<{
      migration: string;
      status: string;
      missing: string;
    }>(readFileSync("supabase/setup/verify-migrations-0199-0207.sql", "utf8"));
    const by = Object.fromEntries(rows.map((r) => [r.migration, r]));
    expect(rows.map((r) => r.migration)).toEqual([
      "0199_prayer_voice",
      "0200_change_tickets",
      "0201_notification_target",
      "0202_lms_quizzes_certificates",
      "0203_lms_assignments",
      "0204_kconnect_minutes",
      "0205_platform_service_users",
      "0206_church_group_chats",
      "0207_group_chat_team_view",
    ]);
    expect(by["0207_group_chat_team_view"].status).toBe("OK");
    // Everything but the Realtime publication (a Supabase feature this test database lacks).
    expect(by["0206_church_group_chats"].status).toBe("MISSING 1 of 12");
    expect(by["0206_church_group_chats"].missing).toContain("Realtime");
    expect(by["0205_platform_service_users"].status).toMatch(/^MISSING/);
  });
});
