import { NextResponse } from "next/server";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import type { TabKey } from "@/lib/permissions/tabs";
import {
  addFamilyMemberForMobile,
  createCommitteeForMobile,
  createFamilyForMobile,
  createLeaderForMobile,
  createYouthForMobile,
  deleteCommitteeForMobile,
  deleteFamilyForMobile,
  deleteLeaderForMobile,
  deleteYouthForMobile,
  removeFamilyMemberForMobile,
  updateCommitteeForMobile,
  updateFamilyForMobile,
  updateFamilyMemberForMobile,
  updateLeaderForMobile,
  updateYouthForMobile,
  type PeopleResult,
} from "@/lib/people/mobile-service";

// The staff mobile app's Leaders, Youth and Families changes. The same
// permissions (per tab) and rules as the web pages.
const TAB_FOR_KIND: Record<string, TabKey> = { leader: "leaders", youth: "youth", family: "families", family_member: "families", committee: "committee" };

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : "");
  const organizationId = text("organizationId");
  const kind = text("kind");
  const action = text("action");
  const id = text("id");

  const tab = TAB_FOR_KIND[kind];
  if (!tab) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  const level = action === "delete" ? "delete" : "write";
  const auth = await requireMobileTabAccess(request, organizationId, tab, level);
  if (auth instanceof NextResponse) return auth;

  let result: PeopleResult = { ok: false, error: "Invalid request." };
  const needsId = action === "update" || action === "delete";
  if (needsId && !id) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  switch (`${kind}:${action}`) {
    case "leader:create":
      result = await createLeaderForMobile(organizationId, body);
      break;
    case "leader:update":
      result = await updateLeaderForMobile(organizationId, id, body);
      break;
    case "leader:delete":
      result = await deleteLeaderForMobile(organizationId, id);
      break;
    case "youth:create":
      result = await createYouthForMobile(organizationId, body);
      break;
    case "youth:update":
      result = await updateYouthForMobile(organizationId, id, body);
      break;
    case "youth:delete":
      result = await deleteYouthForMobile(organizationId, id);
      break;
    case "family:create":
      result = await createFamilyForMobile(organizationId, auth.userId, body);
      break;
    case "family:update":
      result = await updateFamilyForMobile(organizationId, id, body);
      break;
    case "family:delete":
      result = await deleteFamilyForMobile(organizationId, id);
      break;
    case "family_member:create":
      result = await addFamilyMemberForMobile(organizationId, text("familyId"), body);
      break;
    case "family_member:update":
      result = await updateFamilyMemberForMobile(organizationId, id, body);
      break;
    case "family_member:delete":
      result = await removeFamilyMemberForMobile(organizationId, id);
      break;
    case "committee:create":
      result = await createCommitteeForMobile(organizationId, body);
      break;
    case "committee:update":
      result = await updateCommitteeForMobile(organizationId, id, body);
      break;
    case "committee:delete":
      result = await deleteCommitteeForMobile(organizationId, id);
      break;
  }
  return NextResponse.json(result.ok ? { ok: true, id: result.id } : { ok: false, error: result.error });
}
