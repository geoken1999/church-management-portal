import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

// Migration 0215 against a small database: how a phone number is matched, that a visitor disappears when the
// same number becomes an active member, and that only the church's own visitors are touched.
describe("0215_visitors.sql", () => {
  let db: PGlite;
  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(readFileSync("src/lib/lms/test-support/supabase-stub.sql", "utf8"));
    await db.exec(`
      create table public.whatsapp_notice_log (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references public.organizations (id),
        kind text not null check (kind in ('fee_request', 'fee_reminder', 'followup_member', 'followup_leader')),
        ref_id uuid not null, recipient text not null
      );
      insert into public.organizations (id, name) values ('${orgA}', 'Grace'), ('${orgB}', 'Hope');
    `);
    await db.exec(readFileSync("supabase/migrations/0215_visitors.sql", "utf8"));
  }, 60000);

  const addVisitor = (org: string, phone: string, key: string) =>
    db.query(
      `insert into public.visitors (organization_id, name, phone, phone_key, first_visited_on, last_visited_on) values ($1, 'Ann', $2, $3, current_date, current_date)`,
      [org, phone, key],
    );
  const count = async (org: string) => (await db.query<{ n: number }>(`select count(*)::int n from public.visitors where organization_id = $1`, [org])).rows[0].n;

  it("matches a number by its last 10 digits whatever the format", async () => {
    const { rows } = await db.query<{ a: string; b: string; c: string }>(
      `select public.phone_key('+91 98765 43210') a, public.phone_key('09876543210') b, public.phone_key('(555) 123-4567') c`,
    );
    expect(rows[0]).toEqual({ a: "9876543210", b: "9876543210", c: "5551234567" });
  });

  it("keeps one visitor per number per church", async () => {
    await addVisitor(orgA, "98765 43210", "9876543210");
    await expect(addVisitor(orgA, "+91 9876543210", "9876543210")).rejects.toThrow();
    await addVisitor(orgB, "98765 43210", "9876543210");
    expect(await count(orgA)).toBe(1);
    expect(await count(orgB)).toBe(1);
  });

  it("leaves a visitor alone while the person is only a pending join request", async () => {
    await db.query(`insert into public.members (organization_id, first_name, last_name, phone, status) values ($1, 'Ann', 'J', '+91 98765 43210', 'pending')`, [orgA]);
    expect(await count(orgA)).toBe(1);
  });

  it("removes the visitor when that member is approved, and only in that church", async () => {
    await db.query(`update public.members set status = 'active' where organization_id = $1 and phone = '+91 98765 43210'`, [orgA]);
    expect(await count(orgA)).toBe(0);
    expect(await count(orgB)).toBe(1);
  });

  it("removes a visitor when a member is added already active", async () => {
    await addVisitor(orgA, "90000 11111", "9000011111");
    await db.query(`insert into public.members (organization_id, first_name, last_name, phone, status) values ($1, 'Bo', 'K', '09000011111', 'active')`, [orgA]);
    expect(await count(orgA)).toBe(0);
  });

  it("member_has_phone finds an active member by number, in that church only", async () => {
    const q = async (org: string, key: string) => (await db.query<{ r: boolean }>(`select public.member_has_phone($1, $2) r`, [org, key])).rows[0].r;
    expect(await q(orgA, "9876543210")).toBe(true);
    expect(await q(orgB, "9876543210")).toBe(false);
    expect(await q(orgA, "1234567890")).toBe(false);
  });

  it("allows the visitor feedback kind in the WhatsApp notice log", async () => {
    await db.query(`insert into public.whatsapp_notice_log (organization_id, kind, ref_id, recipient) values ($1, 'visitor_feedback', gen_random_uuid(), '919876543210')`, [orgA]);
  });
});
