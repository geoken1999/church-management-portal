"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { resendInvoiceAction } from "@/lib/invoices/actions";
import { Button } from "@/components/ui/button";
import { ErrorToast } from "@/components/ui/error-toast";

export function ResendInvoiceButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <ErrorToast message={error} />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resendInvoiceAction(id);
            setError(result.error ?? null);
            router.refresh();
          })
        }
      >
        <Mail className="size-3.5" />
        {pending ? "Sending…" : "Resend"}
      </Button>
    </>
  );
}
