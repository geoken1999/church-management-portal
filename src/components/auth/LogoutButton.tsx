"use client";

import { useTransition } from "react";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => logout())}
    >
      {pending ? "Signing out..." : "Logout"}
    </Button>
  );
}
