import { NextResponse } from "next/server";
import { requireMobileTabAccess } from "@/lib/mobile/staff-auth";
import {
  createTodoForMobile,
  deleteTodoForMobile,
  organizationIdForTodo,
  setTodoDoneForMobile,
  updateTodoForMobile,
  type TodoInput,
} from "@/lib/todos/mobile-service";

// The staff mobile app's To-do changes: add, edit, tick and delete. The same
// rules and permissions as the web To Do page.
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

  const level = action === "delete" ? "delete" : "write";
  const auth = await requireMobileTabAccess(
    request,
    organizationId,
    "todos",
    level,
  );
  if (auth instanceof NextResponse) return auth;

  const input: TodoInput = {
    title: text("title"),
    description: text("description"),
    dueAt: text("dueAt"),
    assignee: text("assignee"),
    eventId: text("eventId"),
    remindDayBefore: body.remindDayBefore === true,
    remindDueDay: body.remindDueDay !== false,
  };

  if (action === "create") {
    const result = await createTodoForMobile(
      organizationId,
      auth.userId,
      input,
    );
    return NextResponse.json(
      result.ok ? { ok: true } : { ok: false, error: result.error },
    );
  }

  // Every other action works on an existing to-do of this church.
  if (!id || (await organizationIdForTodo(id)) !== organizationId) {
    return NextResponse.json(
      { ok: false, error: "That to-do could not be found." },
      { status: 404 },
    );
  }

  const result =
    action === "update"
      ? await updateTodoForMobile(organizationId, auth.userId, id, input)
      : action === "toggle"
        ? await setTodoDoneForMobile(organizationId, id, body.done === true)
        : action === "delete"
          ? await deleteTodoForMobile(organizationId, id)
          : ({ ok: false, error: "Invalid request." } as const);
  return NextResponse.json(
    result.ok ? { ok: true } : { ok: false, error: result.error },
  );
}
