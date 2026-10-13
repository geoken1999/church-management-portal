"use client";

import { useEffect } from "react";
import { toast } from "sonner";

// Shows an error as a notification that pops up and goes away by itself, instead of a banner
// that pushes the page down. Put it where the error banner used to be: it draws nothing in
// the page, and notifies whenever the message becomes a (new) error.
export function ErrorToast({ message }: { message: string | null | undefined }) {
  useEffect(() => {
    if (message) toast.error(message);
  }, [message]);
  return null;
}
