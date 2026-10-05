"use client";

import { deletePlatformExpense } from "@/lib/platform-admin/expense-actions";
import { Button } from "@/components/ui/button";

export function DeleteExpenseButton({ expenseId }: { expenseId: string }) {
  return (
    <form
      action={deletePlatformExpense}
      onSubmit={(e) => {
        if (!window.confirm("Delete this expense record? This can't be undone.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={expenseId} />
      <Button type="submit" size="sm" variant="ghost">
        Delete
      </Button>
    </form>
  );
}
