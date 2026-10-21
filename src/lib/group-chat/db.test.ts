import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

// Runs the group chat migration in a real Postgres (PGlite) with the same small stand-in for Supabase the Bible
// School tests use, and exercises the functions and the row level security as different people.
const BOOTSTRAP = readFileSync(
  "src/lib/lms/test-support/supabase-stub.sql",
  "utf8",
);
const MIGRATION = readFileSync(
  "supabase/migrations/0206_church_group_chats.sql",
  "utf8",
);
const TEAM_VIEW = readFileSync(
  "supabase/migrations/0207_group_chat_team_view.sql",
  "utf8",
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const db = new PGlite();
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
  (await q("insert into auth.users default values returning id"))[0]
    .id as string;

let orgA = "",
  orgB = "";
let ann = "",
  ben = "",
  cara = "",
  staff = "",
  outsider = "";
let mAnn = "",
  mBen = "",
  mCara = "",
  mOther = "",
  mLater = "";
let group = "";

describe("group chats (migration 0206)", () => {
  beforeAll(async () => {
    await db.exec(BOOTSTRAP);
    await db.exec(MIGRATION);
    await db.exec(TEAM_VIEW);
    orgA = (
      await q(
        "insert into organizations (name, plan) values ('A','pro') returning id",
      )
    )[0].id;
    orgB = (
      await q(
        "insert into organizations (name, plan) values ('B','pro') returning id",
      )
    )[0].id;
    [ann, ben, cara, staff, outsider] = [
      await uid(),
      await uid(),
      await uid(),
      await uid(),
      await uid(),
    ];
    await q(
      "insert into profiles (auth_user_id, first_name, last_name) values ($1,'Sam','Staff')",
      [staff],
    );
    const member = async (org: string, first: string, login: string | null) =>
      (
        await q(
          "insert into members (organization_id, first_name, last_name, auth_user_id) values ($1,$2,'Test',$3) returning id",
          [org, first, login],
        )
      )[0].id as string;
    mAnn = await member(orgA, "Ann", ann);
    mBen = await member(orgA, "Ben", ben);
    mCara = await member(orgA, "Cara", cara);
    mLater = await member(orgA, "Later", null);
    mOther = await member(orgB, "Other", outsider);
    group = (
      await q(
        "insert into church_groups (organization_id, name) values ($1,'Youth team') returning id",
        [orgA],
      )
    )[0].id;
  });

  it("puts members and a team login in a group, filling in the login from the member", async () => {
    for (const m of [mAnn, mBen, mCara, mLater])
      await q(
        "insert into church_group_members (group_id, organization_id, member_id) values ($1,$2,$3)",
        [group, orgA, m],
      );
    await q(
      "insert into church_group_members (group_id, organization_id, auth_user_id, role) values ($1,$2,$3,'admin')",
      [group, orgA, staff],
    );
    const rows = await q(
      "select member_id, auth_user_id from church_group_members where group_id = $1 and member_id = $2",
      [group, mAnn],
    );
    expect(rows[0].auth_user_id).toBe(ann);
  });

  it("refuses a member from another church, and a row with no person", async () => {
    const wrongChurch = await q("select 1").then(async () => {
      try {
        await q(
          "insert into church_group_members (group_id, organization_id, member_id) values ($1,$2,$3)",
          [group, orgA, mOther],
        );
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(wrongChurch).toContain("does not belong to this church");
    let empty: string | null = null;
    try {
      await q(
        "insert into church_group_members (group_id, organization_id) values ($1,$2)",
        [group, orgA],
      );
    } catch (e) {
      empty = (e as Error).message;
    }
    expect(empty).not.toBeNull();
  });

  it("shows messages only to people in the group", async () => {
    await q(
      "insert into church_group_messages (group_id, organization_id, sender_auth_user_id, sender_name, body) values ($1,$2,$3,'Ann Test','Hello team')",
      [group, orgA, ann],
    );
    expect(
      (await as(ben, "select count(*)::int as n from church_group_messages"))[0]
        .n,
    ).toBe(1);
    expect(
      (
        await as(
          outsider,
          "select count(*)::int as n from church_group_messages",
        )
      )[0].n,
    ).toBe(0);
    expect(
      (await as(outsider, "select count(*)::int as n from church_groups"))[0].n,
    ).toBe(0);
    expect(
      await asErr(outsider, "select * from cg_messages($1)", [group]),
    ).toContain("not in this group");
  });

  it("gives no write access to signed-in users", async () => {
    expect(
      await asErr(
        ben,
        "insert into church_group_messages (group_id, organization_id, sender_name, body) values ($1,$2,'Ben','hi')",
        [group, orgA],
      ),
    ).not.toBeNull();
    await as(
      ben,
      "update church_group_members set role = 'admin' where auth_user_id = auth.uid()",
    );
    expect(
      (
        await q(
          "select role from church_group_members where auth_user_id = $1",
          [ben],
        )
      )[0].role,
    ).toBe("member");
  });

  it("counts unread messages for each person, never the ones they sent", async () => {
    await q(
      "update church_group_members set last_read_at = now() - interval '1 hour'",
    );
    await q(
      "insert into church_group_messages (group_id, organization_id, sender_auth_user_id, sender_name, body, created_at) values ($1,$2,$3,'Ben Test','Second', now() - interval '10 minutes')",
      [group, orgA, ben],
    );
    const forAnn = (await as(ann, "select * from cg_my_groups()"))[0];
    expect(forAnn.unread).toBe(1); // Ben's; her own does not count
    expect(forAnn.last_message_preview).toBe("Hello team"); // the newest by time
    expect(forAnn.last_sender_name).toBe("Ann Test");
    expect(forAnn.member_count).toBe(5);
    expect((await as(ben, "select * from cg_my_groups()"))[0].unread).toBe(1); // Ann's
    expect((await as(outsider, "select * from cg_my_groups()")).length).toBe(0);
  });

  it("marks a group read for the person who reads it", async () => {
    await as(ann, "select cg_mark_read($1)", [group]);
    expect((await as(ann, "select * from cg_my_groups()"))[0].unread).toBe(0);
    expect((await as(ben, "select * from cg_my_groups()"))[0].unread).toBe(1);
  });

  it("keeps each person's notification setting to themselves and checks it", async () => {
    expect(
      await asErr(ann, "select cg_set_notifications($1,'loud',null)", [group]),
    ).toContain("Choose all messages");
    expect(
      await asErr(outsider, "select cg_set_notifications($1,'none',null)", [
        group,
      ]),
    ).toContain("not in this group");
    await as(
      ann,
      "select cg_set_notifications($1,'mentions', now() + interval '1 day')",
      [group],
    );
    const mine = (
      await as(ann, "select notify_mode, muted_until from cg_my_groups()")
    )[0];
    expect(mine.notify_mode).toBe("mentions");
    expect(mine.muted_until).not.toBeNull();
    expect(
      (await as(ben, "select notify_mode, muted_until from cg_my_groups()"))[0],
    ).toMatchObject({ notify_mode: "all", muted_until: null });
    // A mute time already in the past is not kept.
    await as(
      ann,
      "select cg_set_notifications($1,'all', now() - interval '1 hour')",
      [group],
    );
    expect(
      (await as(ann, "select muted_until from cg_my_groups()"))[0].muted_until,
    ).toBeNull();
  });

  it("pages messages newest first, with the reply they answer and deleted ones as markers", async () => {
    const first = (
      await q("select id from church_group_messages where body = 'Hello team'")
    )[0].id;
    await q(
      "insert into church_group_messages (group_id, organization_id, sender_auth_user_id, sender_name, body, reply_to, mentions, created_at) values ($1,$2,$3,'Cara Test','Thanks Ann',$4,$5, now() + interval '1 minute')",
      [group, orgA, cara, first, [ann]],
    );
    const gone = (
      await q(
        "insert into church_group_messages (group_id, organization_id, sender_auth_user_id, sender_name, body, created_at) values ($1,$2,$3,'Cara Test','oops', now() + interval '2 minutes') returning id",
        [group, orgA, cara],
      )
    )[0].id;
    await q(
      "update church_group_messages set body = null, deleted_at = now() where id = $1",
      [gone],
    );
    const all = await as(ben, "select * from cg_messages($1)", [group]);
    expect(all.length).toBe(4);
    expect(all[0].deleted_at).not.toBeNull();
    const reply = all.find((m) => m.body === "Thanks Ann");
    expect(reply?.reply_sender).toBe("Ann Test");
    expect(reply?.reply_body).toBe("Hello team");
    expect(reply?.mentions).toEqual([ann]);
    const older = await as(ben, "select * from cg_messages($1, $2, 1)", [
      group,
      all[1].created_at,
    ]);
    expect(older.length).toBe(1);
    expect(older[0].created_at <= all[1].created_at).toBe(true);
    // Preview of a deleted last message.
    expect(
      (await as(ben, "select last_message_preview from cg_my_groups()"))[0]
        .last_message_preview,
    ).toBe("This message was deleted");
  });

  it("lists who is in the group, by name", async () => {
    const people = await as(ben, "select * from cg_participants($1)", [group]);
    expect(people.map((p) => p.name).sort()).toEqual([
      "Ann Test",
      "Ben Test",
      "Cara Test",
      "Later Test",
      "Sam Staff",
    ]);
    expect(people.find((p) => p.name === "Sam Staff")).toMatchObject({
      is_staff: true,
      role: "admin",
    });
    expect(
      people.find((p) => p.name === "Later Test")?.auth_user_id,
    ).toBeNull();
    expect(
      await asErr(outsider, "select * from cg_participants($1)", [group]),
    ).toContain("not in this group");
  });

  it("follows a member who signs in later: they are in their groups from then on", async () => {
    const later = await uid();
    expect(
      (await as(later, "select count(*)::int as n from cg_my_groups()"))[0].n,
    ).toBe(0);
    await q("update members set auth_user_id = $1 where id = $2", [
      later,
      mLater,
    ]);
    expect(
      (await as(later, "select count(*)::int as n from cg_my_groups()"))[0].n,
    ).toBe(1);
    expect(
      (
        await as(later, "select count(*)::int as n from cg_messages($1)", [
          group,
        ])
      )[0].n,
    ).toBe(4);
  });

  it("drops a person's rows with their member record", async () => {
    await q("delete from members where id = $1", [mCara]);
    expect(
      (
        await q(
          "select count(*)::int as n from church_group_members where group_id = $1",
          [group],
        )
      )[0].n,
    ).toBe(4);
  });

  it("lets the church team follow a group's chat without being in it, as far as their Groups permission allows", async () => {
    const owner = await uid();
    const reader = await uid();
    const blocked = await uid();
    const otherChurchOwner = await uid();
    await q(
      "insert into organization_members (organization_id, auth_user_id, role) values ($1,$2,'owner')",
      [orgA, owner],
    );
    await q(
      "insert into organization_members (organization_id, auth_user_id, role, tab_permissions) values ($1,$2,'member','{}'::jsonb)",
      [orgA, reader],
    );
    await q(
      "insert into organization_members (organization_id, auth_user_id, role, tab_permissions) values ($1,$2,'member','{\"groups\": {\"read\": false}}'::jsonb)",
      [orgA, blocked],
    );
    await q(
      "insert into organization_members (organization_id, auth_user_id, role) values ($1,$2,'owner')",
      [orgB, otherChurchOwner],
    );
    expect(
      (
        await as(owner, "select count(*)::int as n from church_group_messages")
      )[0].n,
    ).toBeGreaterThan(0);
    expect(
      (
        await as(reader, "select count(*)::int as n from church_group_messages")
      )[0].n,
    ).toBeGreaterThan(0);
    expect(
      (
        await as(
          blocked,
          "select count(*)::int as n from church_group_messages",
        )
      )[0].n,
    ).toBe(0);
    expect(
      (
        await as(
          otherChurchOwner,
          "select count(*)::int as n from church_group_messages",
        )
      )[0].n,
    ).toBe(0);
    expect(
      (await as(owner, "select count(*)::int as n from church_groups"))[0].n,
    ).toBe(1);
  });
});
