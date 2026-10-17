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

const learning = readFileSync(
  "supabase/migrations/0191_lms_learning.sql",
  "utf8",
);

describe("0191_lms_learning.sql", () => {
  const STUDENT_FUNCTIONS = [
    "lms_catalog",
    "lms_my_courses",
    "lms_course_outline",
    "lms_request_enrollment",
    "lms_get_lesson",
    "lms_complete_lesson",
    "lms_save_note",
    "lms_lesson_file_access",
  ];

  it.each(["lms_lesson_progress", "lms_lesson_notes"])(
    "%s has row level security and a church id",
    (name) => {
      expect(learning).toContain(
        `alter table public.${name} enable row level security;`,
      );
      const start = learning.indexOf(
        `create table if not exists public.${name} (`,
      );
      expect(learning.slice(start, learning.indexOf("\n);", start))).toContain(
        "organization_id uuid not null references public.organizations",
      );
    },
  );

  it("gives students no write policy on progress or notes", () => {
    const policies = learning
      .split("\n")
      .filter((line) => line.includes("create policy"));
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies)
      expect(policy).not.toMatch(/for (insert|update|delete)/);
  });

  it.each(STUDENT_FUNCTIONS)(
    "%s is closed to anonymous callers and open to signed-in users",
    (fn) => {
      expect(learning).toMatch(
        new RegExp(
          `revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`,
        ),
      );
      expect(learning).toMatch(
        new RegExp(
          `grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`,
        ),
      );
    },
  );

  it.each([
    "lms_feature_available",
    "lms_my_member_in_org",
    "lms_required_lessons",
  ])("%s is internal only", (fn) => {
    expect(learning).toMatch(
      new RegExp(
        `revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`,
      ),
    );
  });

  it("works out who the student is from the session, never from an argument", () => {
    for (const fn of [
      "lms_get_lesson",
      "lms_complete_lesson",
      "lms_save_note",
      "lms_request_enrollment",
    ]) {
      const start = learning.indexOf(
        `create or replace function public.${fn}(`,
      );
      const signature = learning.slice(
        start,
        learning.indexOf("returns", start),
      );
      expect(signature).not.toMatch(/member/i);
    }
    expect(learning).toContain("auth.uid()");
  });

  it("never deletes student progress when a lesson is deleted", () => {
    expect(learning).toMatch(
      /lesson_id uuid not null references public\.lms_lessons \(id\) on delete restrict/,
    );
  });

  it("keeps lesson files in a private bucket", () => {
    expect(learning).toMatch(
      /values \('lms-lesson-files', 'lms-lesson-files', false/,
    );
  });
});

const video = readFileSync(
  "supabase/migrations/0192_lms_video_progress.sql",
  "utf8",
);

describe("0192_lms_video_progress.sql", () => {
  it("only lets signed-in users report playback, and takes no member id", () => {
    expect(video).toMatch(
      /revoke all on function public\.lms_save_playback\(uuid, integer, integer\) from public, anon;/,
    );
    expect(video).toMatch(
      /grant execute on function public\.lms_save_playback\(uuid, integer, integer\) to authenticated;/,
    );
    const start = video.indexOf(
      "create or replace function public.lms_save_playback(",
    );
    expect(video.slice(start, video.indexOf("returns", start))).not.toMatch(
      /member/i,
    );
  });
  it("credits only real watching: bounded by elapsed time, and completes through the shared function", () => {
    expect(video).toContain("floor(v_elapsed * 2)");
    expect(video).toContain("public.lms_complete_lesson(p_lesson, true)");
  });
  it("keeps the lesson bucket private while allowing large videos of known types only", () => {
    expect(video).toMatch(/file_size_limit = 524288000/);
    expect(video).toContain("'video/mp4'");
    expect(video).not.toMatch(/public\s*=\s*true/);
  });
  it("is additive", () => {
    const live = video
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(live).not.toMatch(/drop table|drop column|truncate|delete from/i);
  });
});

const live = readFileSync(
  "supabase/migrations/0193_lms_live_classes.sql",
  "utf8",
);

describe("0193_lms_live_classes.sql", () => {
  it.each(["lms_live_sessions", "lms_session_attendance"])(
    "%s has row level security and a church id",
    (name) => {
      expect(live).toContain(
        `alter table public.${name} enable row level security;`,
      );
      const start = live.indexOf(`create table if not exists public.${name} (`);
      expect(live.slice(start, live.indexOf("\n);", start))).toContain(
        "organization_id uuid not null references public.organizations",
      );
    },
  );

  it("gives students no write policy", () => {
    const studentPolicies = live
      .split("\n")
      .filter((line) => /create policy "Students can/.test(line));
    expect(studentPolicies.length).toBeGreaterThan(0);
    for (const policy of studentPolicies)
      expect(policy).not.toMatch(/for (insert|update|delete|all)/);
  });

  it.each(["lms_my_sessions", "lms_join_session"])(
    "%s is closed to anonymous callers, open to signed-in users, and takes no member id",
    (fn) => {
      expect(live).toMatch(
        new RegExp(
          `revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`,
        ),
      );
      expect(live).toMatch(
        new RegExp(
          `grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`,
        ),
      );
      const start = live.indexOf(`create or replace function public.${fn}(`);
      expect(live.slice(start, live.indexOf("returns", start))).not.toMatch(
        /member/i,
      );
    },
  );

  it("only opens a class to enrolled students within its window", () => {
    expect(live).toContain("e.status in ('approved', 'active', 'completed')");
    expect(live).toContain("interval '15 minutes'");
    expect(live).toContain("This class was cancelled.");
  });

  it("is additive", () => {
    const code = live
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(code).not.toMatch(/drop table|drop column|truncate|delete from/i);
  });
});
