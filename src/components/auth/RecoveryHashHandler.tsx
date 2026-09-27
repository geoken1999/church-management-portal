"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type RecoveryHashStatus = "checking" | "none" | "success" | "error";

// Supabase's recovery-link flow (generateLink/resetPasswordForEmail with
// type: 'recovery') redirects with the session in the URL's HASH fragment
// (#access_token=...&refresh_token=...&type=recovery), not a query string
// — that's never sent to the server (fragments are client-only), so no
// Server Component or Route Handler can ever see it. This is the one place
// that actually reads it: on mount, exchange it for a real session via the
// browser client (which persists it to cookies through @supabase/ssr, so
// the server picks it up too on the very next request), strip the tokens
// out of the address bar/history either way, then hand back a status so
// the page embedding this can decide what to show/do next.
export function useRecoveryHash(onSuccess: () => void): RecoveryHashStatus {
  const [status, setStatus] = useState<RecoveryHashStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      if (!hash || type !== "recovery" || !accessToken || !refreshToken) {
        if (!cancelled) setStatus("none");
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      window.history.replaceState(null, "", window.location.pathname);
      if (cancelled) return;
      if (error) {
        setStatus("error");
      } else {
        setStatus("success");
        onSuccess();
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // onSuccess is a router.replace call from the caller — stable enough in
    // practice, and re-running this on every render would re-parse a hash
    // that's already been stripped from the URL by the first run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return status;
}

// A drop-in, render-nothing version for pages that just need the
// redirect-on-success behavior without their own status UI (e.g. the
// landing page, as a fallback for when Supabase's own redirect URL
// allowlist rejects the app's intended /auth/recovery destination and
// falls back to the bare Site URL instead).
export function RecoveryHashRedirect() {
  const router = useRouter();
  useRecoveryHash(() => router.replace("/reset-password"));
  return null;
}
