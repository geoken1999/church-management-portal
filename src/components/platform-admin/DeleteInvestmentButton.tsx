"use client";

import { deletePlatformInvestment } from "@/lib/platform-admin/expense-actions";
import { Button } from "@/components/ui/button";

export function DeleteInvestmentButton({ investmentId }: { investmentId: string }) {
  return (
    <form
      action={deletePlatformInvestment}
      onSubmit={(e) => {
        if (!window.confirm("Delete this investment record? This can't be undone.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={investmentId} />
      <Button type="submit" size="sm" variant="ghost">
        Delete
      </Button>
    </form>
  );
}
