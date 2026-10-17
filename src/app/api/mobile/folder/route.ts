import { NextResponse } from "next/server";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import {
  createCategory,
  deleteCategory,
  deleteDocument,
  downloadUrl,
  finishUpload,
  prepareUpload,
  setCategory,
  toggleCategoryShareForMobile,
  toggleDocumentShareForMobile,
  type FolderResult,
} from "@/lib/folder/mobile-service";

// The staff mobile app's Documents: upload (as a signed ticket, then a confirm),
// download links, categories and share links, with the web's permissions and rules.
const READ_ACTIONS = ["download_url"];
const DELETE_ACTIONS = ["delete_document", "delete_category"];

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }
  const text = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string) : "";
  const organizationId = text("organizationId");
  const action = text("action");
  const id = text("id");

  const level = READ_ACTIONS.includes(action)
    ? "read"
    : DELETE_ACTIONS.includes(action)
      ? "delete"
      : "write";
  const auth = await requireMobileTabAccess(
    request,
    organizationId,
    "folder",
    level,
  );
  if (auth instanceof NextResponse) return auth;

  let result: FolderResult = { ok: false, error: "Invalid request." };
  switch (action) {
    case "prepare_upload":
      result = await prepareUpload(organizationId, {
        title: text("title"),
        mimeType: text("mimeType"),
        size: Number(body.size) || 0,
        categoryId: text("categoryId"),
      });
      break;
    case "finish_upload":
      result = await finishUpload(organizationId, auth.userId, {
        documentId: text("documentId"),
        title: text("title"),
        mimeType: text("mimeType"),
        categoryId: text("categoryId"),
      });
      break;
    case "create_category":
      result = await createCategory(organizationId, text("name"));
      break;
  }
  if (id) {
    switch (action) {
      case "delete_document":
        result = await deleteDocument(organizationId, id);
        break;
      case "download_url":
        result = await downloadUrl(organizationId, id);
        break;
      case "set_category":
        result = await setCategory(organizationId, id, text("categoryId"));
        break;
      case "share_document":
        result = await toggleDocumentShareForMobile(
          organizationId,
          id,
          body.enabled === true,
        );
        break;
      case "delete_category":
        result = await deleteCategory(organizationId, id);
        break;
      case "share_category":
        result = await toggleCategoryShareForMobile(
          organizationId,
          id,
          body.enabled === true,
        );
        break;
    }
  }
  return NextResponse.json(result);
}
