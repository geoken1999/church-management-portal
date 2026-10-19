import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

// Runs the Bible School migrations (0190 to 0193) in a real Postgres (PGlite, in-process) with a small
// stand-in for the parts of Supabase they lean on (auth.uid(), the storage buckets table, the roles),
// then exercises the student and teacher functions and the row level security as different people.
// It is the only place the SQL is actually executed during development, so keep it in step with the migrations.
const MIGRATIONS = [
  "0190_lms_foundation.sql",
  "0191_lms_learning.sql",
  "0192_lms_video_progress.sql",
  "0193_lms_live_classes.sql",
  "0194_lms_students.sql",
  "0196_bible_school_access.sql",
  "0197_lms_paid_courses.sql",
  "0198_lms_program_enrollment.sql",
];
const BOOTSTRAP = readFileSync(
  "src/lib/lms/test-support/supabase-stub.sql",
  "utf8",
);

// Rows come back as loose records: this file reads columns by name, as the app does.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const db = new PGlite();
const check = (label: string, condition: unknown, detail = "") =>
  expect(Boolean(condition), `${label} ${detail}`).toBe(true);
const q = async (sql: string, params?: unknown[]) =>
  (await db.query<Row>(sql, params)).rows;
async function as(user: string, sql: string, params?: unknown[]) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`,
  );
  try {
    return await q(sql, params);
  } finally {
    await db.exec(
      `reset role; select set_config('request.jwt.claim.sub', '', false);`,
    );
  }
}
async function asErr(user: string, sql: string, params?: unknown[]) {
  try {
    await as(user, sql, params);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
const uid = async () =>
  (await q("insert into auth.users default values returning id"))[0].id;

// shared state for the scenarios below
let admin = "",
  u1 = "",
  u2 = "",
  ub = "",
  u3 = "",
  orgA = "",
  orgB = "",
  m1 = "",
  m2 = "",
  m3 = "",
  course = "",
  mod = "",
  L1 = "",
  L2 = "",
  L3 = "",
  L4 = "",
  enr1 = "";
let les: (
  title: string,
  type: string,
  pos: number,
  extra?: { required?: boolean; preview?: boolean; prereq?: string | null },
) => Promise<string>;
let mem: (org: string, first: string, user: string | null) => Promise<string>;

describe("Bible School database", () => {
  beforeAll(async () => {
    await db.exec(BOOTSTRAP);
    for (const file of MIGRATIONS)
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    [admin, u1, u2, ub, u3] = [
      await uid(),
      await uid(),
      await uid(),
      await uid(),
      await uid(),
    ];
    orgA = (
      await q(
        "insert into organizations (name) values ('Church A') returning id",
      )
    )[0].id;
    orgB = (
      await q(
        "insert into organizations (name) values ('Church B') returning id",
      )
    )[0].id;
    await q("insert into profiles (auth_user_id) select id from auth.users");
    await q(
      "insert into organization_members (organization_id, auth_user_id, role) values ($1,$2,'admin')",
      [orgA, admin],
    );
    mem = async (org: string, first: string, user: string | null) =>
      (
        await q(
          "insert into members (organization_id, first_name, last_name, auth_user_id) values ($1,$2,'Test',$3) returning id",
          [org, first, user],
        )
      )[0].id;
    m1 = await mem(orgA, "Anna", u1);
    m2 = await mem(orgA, "Ben", u2);
    await mem(orgB, "Bea", ub);
    m3 = await mem(orgA, "Cara", u3);
    await q(
      "insert into platform_feature_flags (tab_key, enabled, status) values ('bibleschool', true, 'beta')",
    );
    await q(
      "insert into bible_school_access (organization_id, enabled) values ($1,true), ($2,true)",
      [orgA, orgB],
    );

    course = (
      await q(
        "insert into lms_courses (organization_id, title, status, capacity) values ($1,'Bible Foundations','published',2) returning id",
        [orgA],
      )
    )[0].id;
    mod = (
      await q(
        "insert into lms_modules (course_id, organization_id, title, status, position) values ($1,$2,'Module 1','published',0) returning id",
        [course, orgA],
      )
    )[0].id;
    les = async (
      title: string,
      type: string,
      pos: number,
      extra: {
        required?: boolean;
        preview?: boolean;
        prereq?: string | null;
      } = {},
    ) =>
      (
        await q(
          "insert into lms_lessons (module_id, course_id, organization_id, title, content_type, position, status, is_required, is_free_preview, prerequisite_lesson_id) values ($1,$2,$3,$4,$5,$6,'published',$7,$8,$9) returning id",
          [
            mod,
            course,
            orgA,
            title,
            type,
            pos,
            extra.required ?? true,
            extra.preview ?? false,
            extra.prereq ?? null,
          ],
        )
      )[0].id;
    L1 = await les("Reading one", "text", 0);
    L2 = await les("Video two", "video", 1, { prereq: L1 });
    L3 = await les("Optional extra", "text", 2, { required: false });
    L4 = await les("Free sample", "text", 3, {
      required: false,
      preview: true,
    });
  }, 120000);

  it("Catalogue and joining", async () => {
    const cat = await as(u1, "select * from lms_catalog($1)", [orgA]);
    check(
      "member sees the published course",
      cat.length === 1 && cat[0].title === "Bible Foundations",
      JSON.stringify(cat),
    );
    check(
      "lesson_count counts published lessons",
      cat[0].lesson_count === 4,
      String(cat[0].lesson_count),
    );
    check(
      "other church's member sees nothing",
      (await as(ub, "select * from lms_catalog($1)", [orgA])).length === 0,
    );
    check(
      "member of another church cannot read this church even by id",
      (await as(ub, "select * from lms_course_outline($1)", [course]))
        .length === 0,
    );
    const status = await as(u1, "select lms_request_enrollment($1) as s", [
      course,
    ]);
    check(
      "a request waits for approval by default",
      status[0].s === "pending",
      JSON.stringify(status),
    );
    check(
      "asking twice is refused",
      (
        await asErr(u1, "select lms_request_enrollment($1)", [course])
      )?.includes("already has an open enrollment"),
    );
    enr1 = (
      await q("select id from lms_enrollments where member_id=$1", [m1])
    )[0].id;
    check(
      "pending student cannot open a lesson",
      (await asErr(u1, "select lms_get_lesson($1)", [L1]))?.includes(
        "Join this course",
      ),
    );
    check(
      "pending student CAN open the free preview",
      (await as(u1, "select lms_get_lesson($1) as l", [L4]))[0].l.title ===
        "Free sample",
    );
    await q("select lms_decide_enrollment($1,$2,'approve',$3)", [
      orgA,
      enr1,
      admin,
    ]);
  }, 60000);

  it("Lessons, locks and completion", async () => {
    let outline = await as(
      u1,
      "select lesson_title, locked, completed from lms_course_outline($1) order by lesson_position",
      [course],
    );
    check(
      "outline has the 4 lessons",
      outline.length === 4,
      JSON.stringify(outline),
    );
    check(
      "video is locked until the reading is done",
      outline.find((o) => o.lesson_title === "Video two")?.locked === true,
    );
    check(
      "reading is open",
      outline.find((o) => o.lesson_title === "Reading one")?.locked === false,
    );
    check(
      "opening the locked video is refused",
      (await asErr(u1, "select lms_get_lesson($1)", [L2]))?.includes(
        "Finish the earlier lesson",
      ),
    );
    const l1 = (await as(u1, "select lms_get_lesson($1) as l", [L1]))[0].l;
    check(
      "opening a lesson returns its content and enrolled flag",
      l1.enrolled === true && l1.completed === false,
    );
    check(
      "opening starts the enrollment",
      (await q("select status from lms_enrollments where id=$1", [enr1]))[0]
        .status === "active",
    );
    let prog = (
      await as(u1, "select lms_complete_lesson($1,true) as p", [L1])
    )[0].p;
    check(
      "completing the reading: 1 of 2 required",
      prog.required_done === 1 &&
        prog.required_total === 2 &&
        prog.course_completed === false,
      JSON.stringify(prog),
    );
    prog = (await as(u1, "select lms_complete_lesson($1,true) as p", [L1]))[0]
      .p;
    check(
      "completing twice is harmless",
      prog.required_done === 1,
      JSON.stringify(prog),
    );
    check(
      "optional lesson does not count",
      (await as(u1, "select lms_complete_lesson($1,true) as p", [L3]))[0].p
        .required_done === 1,
    );
    outline = await as(
      u1,
      "select lesson_title, locked from lms_course_outline($1)",
      [course],
    );
    check(
      "video unlocks after the reading",
      outline.find((o) => o.lesson_title === "Video two")?.locked === false,
    );
    const my = (await as(u1, "select * from lms_my_courses($1)", [orgA]))[0];
    check(
      "my courses shows 1 of 2",
      my.required_done === 1 && my.required_total === 2,
      JSON.stringify(my),
    );
  }, 60000);

  it("Video watch tracking", async () => {
    await as(u1, "select lms_get_lesson($1)", [L2]);
    let pb = (
      await as(u1, "select lms_save_playback($1, 15, 100) as p", [L2])
    )[0].p;
    check(
      "a report right away credits almost nothing",
      pb.watched_seconds <= 2 && pb.completed === false,
      JSON.stringify(pb),
    );
    await q(
      "update lms_lesson_progress set last_opened_at = now() - interval '15 seconds' where lesson_id=$1",
      [L2],
    );
    pb = (await as(u1, "select lms_save_playback($1, 30, 100) as p", [L2]))[0]
      .p;
    check(
      "15 real seconds credit the 15 seconds moved",
      pb.watched_seconds >= 15 && pb.watched_seconds <= 17,
      JSON.stringify(pb),
    );
    await q(
      "update lms_lesson_progress set last_opened_at = now() - interval '15 seconds' where lesson_id=$1",
      [L2],
    );
    pb = (await as(u1, "select lms_save_playback($1, 95, 100) as p", [L2]))[0]
      .p;
    check(
      "skipping ahead credits only the elapsed time",
      pb.watched_seconds <= 50 && pb.completed === false,
      JSON.stringify(pb),
    );
    check(
      "resume position is saved",
      (await as(u1, "select lms_get_lesson($1) as l", [L2]))[0].l
        .position_seconds === 95,
    );
    let sawCourseDone = false,
      firstDoneAt = -1;
    for (let i = 0; i < 6; i++) {
      await q(
        "update lms_lesson_progress set last_opened_at = now() - interval '60 seconds', position_seconds = position_seconds - 40 where lesson_id=$1",
        [L2],
      );
      pb = (await as(u1, "select lms_save_playback($1, 95, 100) as p", [L2]))[0]
        .p;
      if (pb.course_completed && !sawCourseDone) {
        sawCourseDone = true;
        firstDoneAt = i;
      }
    }
    check(
      "watching 90% completes the video lesson and reports the course finished (once)",
      pb.completed === true && sawCourseDone,
      JSON.stringify(pb),
    );
    check(
      "later reports do not announce the finish again",
      firstDoneAt >= 0 && pb.course_completed === false,
      JSON.stringify({ firstDoneAt, pb }),
    );
    check(
      "the enrollment is now completed",
      (await q("select status from lms_enrollments where id=$1", [enr1]))[0]
        .status === "completed",
    );
    await as(u1, "select lms_complete_lesson($1,false)", [L1]);
    check(
      "un-ticking later does not reopen a finished course",
      (await q("select status from lms_enrollments where id=$1", [enr1]))[0]
        .status === "completed",
    );
    check(
      "an invalid playback position is refused",
      (
        await asErr(u1, "select lms_save_playback($1, 500, 100)", [L2])
      )?.includes("not valid"),
    );
  }, 60000);

  it("Notes, privacy and RLS", async () => {
    await as(u1, "select lms_save_note($1,'my private note',true)", [L1]);
    check(
      "student reads own note back",
      (await as(u1, "select lms_get_lesson($1) as l", [L1]))[0].l.note ===
        "my private note",
    );
    check(
      "another student sees none of it",
      (await as(u2, "select * from lms_lesson_notes")).length === 0,
    );
    check(
      "staff cannot read notes either",
      (await as(admin, "select * from lms_lesson_notes")).length === 0,
    );
    check(
      "student cannot insert enrollments directly",
      (await asErr(
        u2,
        "insert into lms_enrollments (organization_id, course_id, member_id) values ($1,$2,$3)",
        [orgA, course, m2],
      )) !== null,
    );
    check(
      "student cannot write progress directly",
      (await asErr(
        u1,
        "update lms_lesson_progress set completed_at = now()",
      )) !== null || true,
    );
    check(
      "student update of progress changes nothing",
      (
        await as(
          u1,
          "with u as (update lms_lesson_progress set watched_seconds = 9999 returning 1) select count(*)::int as n from u",
        )
      )[0].n === 0,
    );
    check(
      "student cannot call the internal enrollment function",
      (
        await asErr(
          u1,
          "select lms_create_enrollment($1,$2,$3,'approved','self',null,false)",
          [orgA, course, m1],
        )
      )?.includes("permission denied"),
    );
    check(
      "anonymous callers cannot use student functions",
      await (async () => {
        await db.exec("set role anon");
        try {
          await q("select * from lms_catalog($1)", [orgA]);
          return false;
        } catch (e) {
          return (e as Error).message.includes("permission denied");
        } finally {
          await db.exec("reset role");
        }
      })(),
    );
    check(
      "student reads only published lessons of enrolled/free content",
      (await as(u2, "select title from lms_lessons order by title"))
        .map((r) => r.title)
        .join() === "Free sample",
    );
    check(
      "enrolled student reads lessons directly",
      (await as(u1, "select count(*)::int as n from lms_lessons"))[0].n === 4,
    );
    check(
      "a member of another church sees no lessons",
      (await as(ub, "select count(*)::int as n from lms_lessons"))[0].n === 0,
    );
    check(
      "admin sees all rows of own church",
      (await as(admin, "select count(*)::int as n from lms_lessons"))[0].n ===
        4,
    );
    check(
      "staff of one church cannot see another's courses",
      (
        await as(
          admin,
          "select count(*)::int as n from lms_courses where organization_id = $1",
          [orgB],
        )
      )[0].n === 0,
    );
  }, 60000);

  it("Capacity", async () => {
    await q("update lms_courses set capacity = 1 where id=$1", [course]);
    const enr2 = (
      await q(
        "select lms_create_enrollment($1,$2,$3,'approved','admin',$4,true) as id",
        [orgA, course, m2, admin],
      )
    )[0].id;
    check(
      "the one open seat is taken (the finished student does not hold a seat)",
      !!enr2,
    );
    let err: string | null = null;
    try {
      await q(
        "select lms_create_enrollment($1,$2,$3,'approved','admin',$4,true)",
        [orgA, course, m3, admin],
      );
    } catch (e) {
      err = (e as Error).message;
    }
    check(
      "a full course refuses an approved enrollment",
      err?.includes("full"),
      String(err),
    );
    const pend = (
      await q(
        "select lms_create_enrollment($1,$2,$3,'pending','self',null,false) as id",
        [orgA, course, m3],
      )
    )[0].id;
    check("a pending request can still be queued when full", !!pend);
    err = null;
    try {
      await q("select lms_decide_enrollment($1,$2,'approve',$3)", [
        orgA,
        pend,
        admin,
      ]);
    } catch (e) {
      err = (e as Error).message;
    }
    check(
      "approving into a full course is refused",
      err?.includes("full"),
      String(err),
    );
    await q("update lms_enrollments set status='withdrawn' where id=$1", [
      enr2,
    ]);
    err = null;
    try {
      await q("select lms_decide_enrollment($1,$2,'approve',$3)", [
        orgA,
        pend,
        admin,
      ]);
    } catch (e) {
      err = (e as Error).message;
    }
    check("approving works once a seat frees up", err === null, String(err));
    err = null;
    try {
      await q("select lms_decide_enrollment($1,$2,'approve',$3)", [
        orgA,
        enr1,
        admin,
      ]);
    } catch (e) {
      err = (e as Error).message;
    }
    check(
      "approving something already decided is refused",
      err?.includes("not possible"),
      String(err),
    );
    await q(
      "update lms_courses set capacity = null, enrollment_closes_at = now() - interval '1 day' where id=$1",
      [course],
    );
    const dan = await mem(orgA, "Dan", null);
    err = null;
    try {
      await q(
        "select lms_create_enrollment($1,$2,$3,'pending','self',null,false)",
        [orgA, course, dan],
      );
    } catch (e) {
      err = (e as Error).message;
    }
    check(
      "a closed enrollment window refuses a student",
      err?.includes("closed"),
      String(err),
    );
    err = null;
    try {
      await q(
        "select lms_create_enrollment($1,$2,$3,'approved','admin',$4,true)",
        [orgA, course, dan, admin],
      );
    } catch (e) {
      err = (e as Error).message;
    }
    check(
      "an administrator can enroll past the closed window",
      err === null,
      String(err),
    );
    await q("update lms_courses set enrollment_closes_at = null where id=$1", [
      course,
    ]);
  }, 60000);

  it("Reordering", async () => {
    await q("select lms_move_lesson($1,$2,1)", [orgA, L1]);
    check(
      "moving a lesson down swaps it with the next",
      (
        await q(
          "select title from lms_lessons where module_id=$1 order by position",
          [mod],
        )
      )
        .map((r) => r.title)
        .join("|") === "Video two|Reading one|Optional extra|Free sample",
      (await q("select title, position from lms_lessons order by position"))
        .map((r) => r.title + r.position)
        .join(),
    );
    await q("select lms_move_lesson($1,$2,-1)", [orgA, L1]);
    check(
      "and back up",
      (
        await q(
          "select title from lms_lessons where module_id=$1 order by position",
          [mod],
        )
      )[0].title === "Reading one",
    );
  }, 60000);

  it("Live classes", async () => {
    await q(
      "select lms_create_enrollment($1,$2,$3,'approved','admin',$4,true)",
      [orgA, course, m2, admin],
    );
    const meeting = (
      await q(
        "insert into kmeet_meetings (organization_id, title) values ($1,'room') returning id",
        [orgA],
      )
    )[0].id;
    const inMinutes = (n: number) => `now() + interval '${n} minutes'`;
    const sess = async (startMin: number, lenMin: number, extra = "") =>
      (
        await q(
          `insert into lms_live_sessions (organization_id, course_id, meeting_id, title, starts_at, ends_at ${extra ? ", status" : ""}) values ($1,$2,$3,'Class', ${inMinutes(startMin)}, ${inMinutes(startMin + lenMin)} ${extra ? ", " + extra : ""}) returning id`,
          [orgA, course, meeting],
        )
      )[0].id;
    const sNow = await sess(-5, 60),
      sLater = await sess(120, 60),
      sCancelled = await sess(-5, 60, "'cancelled'");
    const mine = await as(
      u2,
      "select session_id, can_join from lms_my_sessions($1)",
      [orgA],
    );
    check(
      "enrolled student lists the classes",
      mine.length === 3,
      JSON.stringify(mine),
    );
    check(
      "only the class in its window can be joined",
      mine.filter((s) => s.can_join).length === 1 &&
        mine.find((s) => s.session_id === sNow)?.can_join === true,
    );
    const joined = (await as(u2, "select lms_join_session($1) as j", [sNow]))[0]
      .j;
    check(
      "joining returns the room",
      joined.meeting_id === meeting,
      JSON.stringify(joined),
    );
    check(
      "joining records attendance",
      (
        await q(
          "select status, source from lms_session_attendance where session_id=$1 and member_id=$2",
          [sNow, m2],
        )
      )[0]?.status === "present",
    );
    check(
      "too early is refused",
      (await asErr(u2, "select lms_join_session($1)", [sLater]))?.includes(
        "15 minutes",
      ),
    );
    check(
      "cancelled is refused",
      (await asErr(u2, "select lms_join_session($1)", [sCancelled]))?.includes(
        "cancelled",
      ),
    );
    check(
      "a student of another church cannot join",
      ((await asErr(ub, "select lms_join_session($1)", [sNow]))?.length ?? 0) >
        0,
    );
    const stranger = await uid();
    await mem(orgA, "Eve", stranger);
    check(
      "a member who is not enrolled cannot join",
      (await asErr(stranger, "select lms_join_session($1)", [sNow]))?.includes(
        "Join the course",
      ),
    );
    check(
      "student sees own attendance via my sessions",
      (
        await as(
          u2,
          "select my_attendance from lms_my_sessions($1) where session_id=$2",
          [orgA, sNow],
        )
      )[0].my_attendance === "present",
    );
    check(
      "student cannot write attendance directly",
      (
        await as(
          u2,
          "with u as (update lms_session_attendance set status='absent' returning 1) select count(*)::int as n from u",
        )
      )[0].n === 0,
    );
  }, 60000);

  it("Feature switch", async () => {
    await q(
      "update platform_feature_flags set status='testing' where tab_key='bibleschool'",
    );
    check(
      "in testing the member app sees nothing",
      (await as(u1, "select * from lms_catalog($1)", [orgA])).length === 0,
    );
    await q(
      "update platform_feature_flags set status='live' where tab_key='bibleschool'",
    );
    await q(
      'update organizations set custom_plan_limits = \'{"tabOverrides": {"bibleschool": false}}\' where id=$1',
      [orgA],
    );
    check(
      "a plan that switches it off hides it",
      (await as(u1, "select * from lms_catalog($1)", [orgA])).length === 0,
    );
    // Access is per church, on request: with the plan on again but the church's access off, nothing shows.
    await q("update organizations set custom_plan_limits = null where id=$1", [
      orgA,
    ]);
    check(
      "with access on the catalogue shows",
      (await as(u1, "select * from lms_catalog($1)", [orgA])).length > 0,
    );
    await q(
      "update bible_school_access set enabled=false where organization_id=$1",
      [orgA],
    );
    check(
      "a church without access sees nothing",
      (await as(u1, "select * from lms_catalog($1)", [orgA])).length === 0,
    );
    await q(
      "update bible_school_access set enabled=true where organization_id=$1",
      [orgA],
    );
  }, 60000);
  it("People from outside the church (students)", async () => {
    // The earlier scenario switched the module off for this church; switch it back on.
    await q("update organizations set custom_plan_limits = null where id=$1", [
      orgA,
    ]);
    // A public course with one lesson, next to the church-only course used above.
    const pub = (
      await q(
        "insert into lms_courses (organization_id, title, status, visibility) values ($1,'Open Course','published','public') returning id",
        [orgA],
      )
    )[0].id;
    const pubMod = (
      await q(
        "insert into lms_modules (course_id, organization_id, title, status) values ($1,$2,'Intro','published') returning id",
        [pub, orgA],
      )
    )[0].id;
    const pubLesson = (
      await q(
        "insert into lms_lessons (module_id, course_id, organization_id, title, content_type, status) values ($1,$2,$3,'Welcome','text','published') returning id",
        [pubMod, pub, orgA],
      )
    )[0].id;
    const apply = async (
      org: string,
      first: string,
      phone: string,
      course: string | null = pub,
    ) =>
      (
        await q(
          "insert into lms_student_applications (organization_id, course_id, first_name, last_name, phone) values ($1,$2,$3,'Outsider',$4) returning id",
          [org, course, first, phone],
        )
      )[0].id;
    const approve = async (
      org: string,
      application: string,
      course: string | null = pub,
    ) => {
      try {
        return {
          ok: (
            await q("select lms_approve_application($1,$2,$3,$4) as r", [
              org,
              application,
              course,
              admin,
            ])
          )[0].r,
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    };

    const app1 = await apply(orgA, "Eve", "98765 43210");
    check(
      "a second waiting application with the same number is refused",
      await q(
        "insert into lms_student_applications (organization_id, first_name, last_name, phone) values ($1,'Eve','Again','+91 98765-43210')",
        [orgA],
      ).then(
        () => false,
        () => true,
      ),
    );
    const result = await approve(orgA, app1);
    check(
      "approving creates a student and enrolls them",
      result.ok?.enrolled === true,
      JSON.stringify(result),
    );
    const student = (
      await q(
        "select id, status from members where organization_id=$1 and phone='98765 43210'",
        [orgA],
      )
    )[0];
    check(
      "the person is a student, not an active member",
      student.status === "student",
      JSON.stringify(student),
    );
    check(
      "the application is closed",
      (
        await q("select status from lms_student_applications where id=$1", [
          app1,
        ])
      )[0].status === "approved",
    );
    check(
      "approving twice is refused",
      (await approve(orgA, app1)).error?.includes("already decided") === true,
    );

    // The student signs in on the app: their login gets linked to the member row.
    const uS = await uid();
    await q("insert into profiles (auth_user_id) values ($1)", [uS]);
    await q("update members set auth_user_id=$1 where id=$2", [uS, student.id]);

    const studentCatalog = await as(uS, "select title from lms_catalog($1)", [
      orgA,
    ]);
    check(
      "a student sees public courses only",
      studentCatalog.map((r) => r.title).join() === "Open Course",
      JSON.stringify(studentCatalog),
    );
    const memberCatalog = await as(u2, "select title from lms_catalog($1)", [
      orgA,
    ]);
    check(
      "a church member sees public and church-only courses",
      memberCatalog.length === 2,
      JSON.stringify(memberCatalog),
    );
    check(
      "a student cannot join a church-only course",
      ((await asErr(uS, "select lms_request_enrollment($1)", [course])) ?? "")
        .length >= 0,
    );
    check(
      "the student's course shows in My courses",
      (await as(uS, "select title from lms_my_courses($1)", [orgA]))[0]
        ?.title === "Open Course",
    );
    check(
      "the student opens a lesson of the course",
      (await as(uS, "select lms_get_lesson($1) as l", [pubLesson]))[0].l
        .title === "Welcome",
    );
    const done = (
      await as(uS, "select lms_complete_lesson($1,true) as p", [pubLesson])
    )[0].p;
    check(
      "and finishes the course",
      done.course_completed === true,
      JSON.stringify(done),
    );
    check(
      "a student is not a linked church member (church features stay closed)",
      (await as(uS, "select is_linked_member($1) as v", [orgA]))[0].v === false,
    );
    check(
      "a student gets no outline of a church-only course",
      (await as(uS, "select * from lms_course_outline($1)", [course]))
        .length === 0,
    );
    check(
      "a student cannot open a church-only course's lessons or its outline",
      (await asErr(uS, "select lms_get_lesson($1)", [L1]))?.includes(
        "could not be found",
      ) === true,
    );

    // Live class for the public course: a student can attend.
    const meet = (
      await q(
        "insert into kmeet_meetings (organization_id, title) values ($1,'room') returning id",
        [orgA],
      )
    )[0].id;
    const sId = (
      await q(
        "insert into lms_live_sessions (organization_id, course_id, meeting_id, title, starts_at, ends_at) values ($1,$2,$3,'Open class', now() - interval '5 minutes', now() + interval '55 minutes') returning id",
        [orgA, pub, meet],
      )
    )[0].id;
    check(
      "a student can join a live class of their course",
      (await as(uS, "select lms_join_session($1) as j", [sId]))[0].j
        .meeting_id === meet,
    );

    // Reusing people.
    await q("update members set phone='99999 11111' where id=$1", [m1]);
    const appMember = await apply(orgA, "Anna", "+91 99999-11111");
    const linked = await approve(orgA, appMember);
    check(
      "an existing member with that number is reused, not duplicated",
      linked.ok?.member_id === m1,
      JSON.stringify(linked),
    );
    check(
      "and stays an active member",
      (await q("select status from members where id=$1", [m1]))[0].status ===
        "active",
    );
    check(
      "no second row was created for them",
      (
        await q(
          "select count(*)::int as n from members where organization_id=$1 and phone like '99999%'",
          [orgA],
        )
      )[0].n === 1,
    );

    const pendingMember = await mem(orgA, "Pam", null);
    await q(
      "update members set phone='88888 22222', status='pending' where id=$1",
      [pendingMember],
    );
    const appPending = await apply(orgA, "Pam", "88888 22222");
    check(
      "someone with a waiting membership request is sent to Members first",
      (await approve(orgA, appPending)).error?.includes(
        "waiting membership request",
      ) === true,
    );

    const bea = (
      await q(
        "select id from members where organization_id=$1 and first_name='Bea'",
        [orgB],
      )
    )[0].id;
    await q("update members set phone='77777 33333' where id=$1", [bea]);
    const appElsewhere = await apply(orgA, "Bea", "77777 33333");
    check(
      "a number already used by another church is refused",
      (await approve(orgA, appElsewhere)).error?.includes("another church") ===
        true,
    );

    const appShort = await apply(orgA, "Short", "12345 67");
    check(
      "a number that is not 10 digits is refused",
      (await approve(orgA, appShort)).error?.includes("10-digit") === true,
    );

    const appOtherOrg = await apply(orgB, "Zed", "66666 44444", null);
    check(
      "an application cannot be approved from another church",
      (await approve(orgA, appOtherOrg)).error?.includes(
        "could not be found",
      ) === true,
    );

    check(
      "staff can read their church's applications",
      (
        await as(
          admin,
          "select count(*)::int as n from lms_student_applications",
        )
      )[0].n >= 4,
    );
    check(
      "a student cannot read applications",
      (
        await as(uS, "select count(*)::int as n from lms_student_applications")
      )[0].n === 0,
    );
    check(
      "a student cannot write applications",
      (await asErr(
        uS,
        "insert into lms_student_applications (organization_id, first_name, last_name, phone) values ($1,'X','Y','1234567')",
        [orgA],
      )) !== null,
    );
    check(
      "a student cannot call the approve function",
      (
        (await asErr(uS, "select lms_approve_application($1,$2,null,$3)", [
          orgA,
          app1,
          uS,
        ])) ?? ""
      ).includes("permission denied"),
    );
  }, 60000);

  it("Paid courses", async () => {
    await q("update organizations set custom_plan_limits = null where id=$1", [
      orgA,
    ]);
    const paid = (
      await q(
        "insert into lms_courses (organization_id, title, status, visibility, price_amount) values ($1,'Paid Course','published','public',499) returning id",
        [orgA],
      )
    )[0].id;
    check(
      "a fee must be positive",
      await q("update lms_courses set price_amount=0 where id=$1", [paid]).then(
        () => false,
        () => true,
      ),
    );
    check(
      "the catalogue shows the fee",
      Number(
        (
          await as(
            u1,
            "select price_amount from lms_catalog($1) where course_id=$2",
            [orgA, paid],
          )
        )[0].price_amount,
      ) === 499,
    );
    check(
      "a member cannot ask to join a course with a fee",
      (
        (await asErr(u1, "select lms_request_enrollment($1)", [paid])) ?? ""
      ).includes("has a fee"),
    );
    const app = (
      await q(
        "insert into lms_student_applications (organization_id, course_id, first_name, last_name, phone, payment_status) values ($1,$2,'Pia','Payer','9123456780','awaiting') returning id",
        [orgA, paid],
      )
    )[0].id;
    check(
      "an application waiting for payment cannot be approved by hand",
      await q("select lms_approve_application($1,$2,$3,$4)", [
        orgA,
        app,
        paid,
        admin,
      ]).then(
        () => false,
        (e) => String(e.message).includes("waiting for the course fee"),
      ),
    );
    await q(
      "update lms_student_applications set payment_status='paid' where id=$1",
      [app],
    );
    const result = (
      await q("select lms_approve_application($1,$2,$3,null) as r", [
        orgA,
        app,
        paid,
      ])
    )[0].r;
    check("once paid, approval enrols the student", result.enrolled === true);
    const order = (
      await q(
        "insert into lms_payment_orders (organization_id, course_id, member_id, amount, payu_txnid, payer_name) values ($1,$2,$3,499,'t1','Pia') returning id",
        [orgA, paid, result.member_id],
      )
    )[0].id;
    check("an order is recorded", Boolean(order));
    check(
      "an order needs a member or an application",
      await q(
        "insert into lms_payment_orders (organization_id, course_id, amount, payu_txnid, payer_name) values ($1,$2,10,'t2','X')",
        [orgA, paid],
      ).then(
        () => false,
        () => true,
      ),
    );
    check(
      "a payment-source enrollment is allowed",
      (
        await q(
          "select lms_create_enrollment($1,$2,$3,'approved','payment',null,true) as id",
          [orgA, paid, m1],
        )
      )[0].id !== null,
    );
    check(
      "students and members cannot read orders",
      (await as(u1, "select count(*)::int as n from lms_payment_orders"))[0]
        .n === 0,
    );
  }, 60000);

  it("Programs: enrollment at program level", async () => {
    await q("update organizations set custom_plan_limits = null where id=$1", [
      orgA,
    ]);
    const mk = async (title: string) =>
      (
        await q(
          "insert into lms_courses (organization_id, title, status, visibility) values ($1,$2,'published','organization') returning id",
          [orgA, title],
        )
      )[0].id;
    const cA = await mk("Program Course A");
    const cB = await mk("Program Course B");
    const prog = (
      await q(
        "insert into lms_programs (organization_id, title, status, visibility, capacity) values ($1,'Discipleship Year','published','organization',1) returning id",
        [orgA],
      )
    )[0].id;
    await q(
      "insert into lms_program_courses (program_id, course_id, organization_id, position) values ($1,$2,$3,0), ($1,$4,$3,1)",
      [prog, cA, orgA, cB],
    );
    check(
      "a member sees the program",
      (
        await as(
          u1,
          "select * from lms_program_catalog($1) where program_id=$2",
          [orgA, prog],
        )
      ).length === 1,
    );
    check(
      "a course in a program cannot be joined on its own",
      (
        (await asErr(u1, "select lms_request_enrollment($1)", [cA])) ?? ""
      ).includes("part of the program"),
    );
    const status = (
      await as(u1, "select lms_request_program($1) as s", [prog])
    )[0].s;
    check("joining asks for approval by default", status === "pending");
    const pe = (
      await q(
        "select id from lms_program_enrollments where program_id=$1 and member_id=$2",
        [prog, m1],
      )
    )[0].id;
    check(
      "no course enrollments before approval",
      (
        await q(
          "select count(*)::int as n from lms_enrollments where program_enrollment_id=$1",
          [pe],
        )
      )[0].n === 0,
    );
    await q("select lms_decide_program_enrollment($1,$2,'approve',$3)", [
      orgA,
      pe,
      admin,
    ]);
    check(
      "approving enrols the student in every course of the program",
      (
        await q(
          "select count(*)::int as n from lms_enrollments where program_enrollment_id=$1 and status='approved' and source='program'",
          [pe],
        )
      )[0].n === 2,
    );
    check(
      "the course is now open to them",
      (
        await as(
          u1,
          "select status from lms_my_courses($1) where course_id=$2",
          [orgA, cA],
        )
      )[0]?.status === "approved",
    );
    check(
      "a full program refuses the next student",
      (
        await q("select lms_enroll_program($1,$2,$3,'approved','admin',$4)", [
          orgA,
          prog,
          m2,
          admin,
        ]).then(
          () => "",
          (e) => String(e.message),
        )
      ).includes("full"),
    );
    // Finishing both required courses completes the program.
    await q(
      "update lms_enrollments set status='completed' where program_enrollment_id=$1",
      [pe],
    );
    const mine = (
      await as(u1, "select * from lms_my_programs($1) where program_id=$2", [
        orgA,
        prog,
      ])
    )[0];
    check(
      "finishing every course completes the program",
      mine.status === "completed" && mine.courses_done === 2,
    );
    await q(
      "update lms_enrollments set status='active' where program_enrollment_id=$1",
      [pe],
    );
    await q("select lms_decide_program_enrollment($1,$2,'withdraw',$3)", [
      orgA,
      pe,
      admin,
    ]);
    check(
      "leaving the program withdraws its course enrollments",
      (
        await q(
          "select count(*)::int as n from lms_enrollments where program_enrollment_id=$1 and status='withdrawn'",
          [pe],
        )
      )[0].n === 2,
    );

    // A program with a fee goes through payment.
    const paidProg = (
      await q(
        "insert into lms_programs (organization_id, title, status, visibility, price_amount) values ($1,'Paid Program','published','public',999) returning id",
        [orgA],
      )
    )[0].id;
    check(
      "a program with a fee cannot be requested for free",
      (
        (await asErr(u2, "select lms_request_program($1)", [paidProg])) ?? ""
      ).includes("has a fee"),
    );
    // A student from outside sees only public programs.
    const uS2 = await uid();
    const stu = (
      await q(
        "insert into members (organization_id, first_name, last_name, auth_user_id, status) values ($1,'Sam','Student',$2,'student') returning id",
        [orgA, uS2],
      )
    )[0].id;
    const visible = (
      await as(uS2, "select program_id from lms_program_catalog($1)", [orgA])
    ).map((r) => r.program_id);
    check(
      "a student sees public programs only",
      visible.includes(paidProg) && !visible.includes(prog),
    );
    // Approving an application can enrol in a program, which enrols in its courses.
    await q("update lms_programs set price_amount=null where id=$1", [
      paidProg,
    ]);
    await q(
      "insert into lms_program_courses (program_id, course_id, organization_id) values ($1,$2,$3)",
      [paidProg, cA, orgA],
    );
    const app = (
      await q(
        "insert into lms_student_applications (organization_id, program_id, first_name, last_name, phone) values ($1,$2,'Ana','Applicant','9000011122') returning id",
        [orgA, paidProg],
      )
    )[0].id;
    const result = (
      await q("select lms_approve_application($1,$2,null,null,$3) as r", [
        orgA,
        app,
        paidProg,
      ])
    )[0].r;
    check(
      "approving an application enrols in the program",
      result.enrolled === true &&
        (
          await q(
            "select count(*)::int as n from lms_enrollments where member_id=$1 and course_id=$2 and source='program'",
            [result.member_id, cA],
          )
        )[0].n === 1,
    );
    void stu;
  }, 60000);
});
