import Link from "next/link";
import { ListTodo, CalendarClock } from "lucide-react";
import { getUpcomingTodos } from "@/lib/todos/dal";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function UpcomingTodos({ organizationId }: { organizationId: string }) {
  const todos = await getUpcomingTodos(organizationId);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <ListTodo className="size-4 text-primary" />
          Upcoming to-dos
        </h2>
        <Link href="/dashboard/todos" className="text-sm font-medium text-primary hover:underline">
          View all
        </Link>
      </div>
      <Card>
        <CardContent>
          {todos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No upcoming to-dos with a reminder set.</p>
          ) : (
            <div className="divide-y divide-border">
              {todos.map((todo) => (
                <div key={todo.id} className="flex items-center justify-between gap-3 py-2.5">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{todo.title}</p>
                  <Badge variant={todo.overdue ? "destructive" : "outline"} className="shrink-0">
                    <CalendarClock className="size-3" />
                    {formatDueDate(todo.dueAt)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
