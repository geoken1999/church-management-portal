import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { getTodo } from "@/lib/todos/dal";
import { buildTodoIcs } from "@/lib/todos/ics";

// Downloads a single to-do as a .ics file so it can be imported into the
// user's own calendar app. Access control is just requireUser() + RLS on
// the getTodo() select below — no explicit org check needed since RLS
// already scopes the row to the caller's own org (or returns null).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const todo = await getTodo(id);
  if (!todo) {
    return new NextResponse("To-do not found.", { status: 404 });
  }
  if (!todo.due_at) {
    return new NextResponse("This to-do has no due date to add to a calendar.", { status: 400 });
  }

  const ics = buildTodoIcs(todo);
  const filename = `${todo.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 60) || "todo"}.ics`;

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-cache",
    },
  });
}
