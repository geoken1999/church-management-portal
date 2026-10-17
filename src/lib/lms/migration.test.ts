import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Structural checks on the Bible School migration. They cannot replace running it against a
// database, but they catch the mistakes that matter most for a multi-tenant module: a table with no
// row level security, a table that cannot be tied to a church, a database function anyone could call.
const sql = readFileSync("supabase/migrations/0190_lms_foundation.sql", "utf8");

const TABLES = [
  "lms_settings",
  "lms_programs",
  "lms_courses",
  "lms_program_courses",
  "lms_course_prerequisites",
  "lms_course_instructors",
  "lms_modules",
  "lms_lessons",
  "lms_enrollments",
  "lms_audit_events",
];

function tableBody(name: string): string {
  const start = sql.indexOf(`create table if not exists public.${name} (`);
  expect(start, `${name} is created`).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf("\n);", start));
}

describe("0190_lms_foundation.sql", () => {
  it.each(TABLES)("%s ties every row to a church", (name) => {
    expect(tableBody(name)).toMatch(
      /organization_id uuid (not null )?(primary key )?references public\.organizations \(id\) on delete cascade/,
    );
  });

  it.each(TABLES)("%s has row level security switched on", (name) => {
    expect(sql).toContain(
      `alter table public.${name} enable row level security;`,
    );
  });

  it("never lets a student write to anything", () => {
    const studentPolicies = sql
      .split("\n")
      .filter((line) => /create policy "(Members|Students) can/.test(line));
    expect(studentPolicies.length).toBeGreaterThan(0);
    for (const policy of studentPolicies)
      expect(policy).not.toMatch(/for (insert|update|delete)/);
  });

  it("only lets the service role call the transactional functions", () => {
    for (const fn of [
      "lms_create_enrollment",
      "lms_decide_enrollment",
      "lms_move_module",
      "lms_move_lesson",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`,
        ),
      );
    }
  });

  it("keeps one open enrollment per student and course", () => {
    expect(sql).toMatch(
      /lms_enrollments_one_open_idx[\s\S]*\(course_id, member_id\) where status in \('pending', 'approved', 'active'\)/,
    );
  });

  it("is additive: no drops or destructive changes outside the commented reversal", () => {
    const live = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    // Dropping a policy or trigger before re-creating it is the repo's re-run convention.
    expect(live).not.toMatch(
      /drop table|drop column|truncate|delete from|alter table [^;]* rename/i,
    );
  });
});
