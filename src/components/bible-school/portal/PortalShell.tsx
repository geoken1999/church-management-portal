"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { BookOpen } from "lucide-react";
import {
  portal,
  portalError,
  supabase,
  toE164,
  type PortalIdentity,
} from "@/lib/lms/portal-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PortalContext {
  identity: PortalIdentity;
  signOut: () => Promise<void>;
}
const Ctx = createContext<PortalContext | null>(null);

export function usePortal(): PortalContext {
  const value = useContext(Ctx);
  if (!value) throw new Error("usePortal must be used inside PortalShell");
  return value;
}

// The web learning portal: sign in with a mobile number (a code is texted, as in the app), then the
// page below. Church members and Bible School students use the same sign-in.
export function PortalShell({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<
    "loading" | "signedOut" | "ready" | "blocked"
  >("loading");
  const [identity, setIdentity] = useState<PortalIdentity | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase().auth.getSession();
    if (!data.session) {
      setState("signedOut");
      return;
    }
    try {
      setIdentity(await portal.identity());
      setState("ready");
    } catch (e) {
      setMessage(portalError(e, "Couldn't finish signing you in."));
      setState("blocked");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    setIdentity(null);
    setMessage(null);
    setState("signedOut");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/bible-school/learn"
            className="flex items-center gap-2 font-heading font-bold"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookOpen className="size-4" />
            </span>
            {identity?.organizationName
              ? `${identity.organizationName} Bible School`
              : "Bible School"}
          </Link>
          {state === "ready" && identity && (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-muted-foreground sm:inline">
                {identity.firstName} {identity.lastName}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={signOut}
              >
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {state === "loading" && (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}
        {state === "signedOut" && <SignIn onDone={load} />}
        {state === "blocked" && (
          <div className="mx-auto max-w-sm space-y-3 text-center">
            <p className="text-sm">{message}</p>
            <Button type="button" variant="outline" onClick={signOut}>
              Sign out and try another number
            </Button>
          </div>
        )}
        {state === "ready" && identity && (
          <Ctx.Provider value={{ identity, signOut }}>{children}</Ctx.Provider>
        )}
      </main>
    </div>
  );
}

function SignIn({ onDone }: { onDone: () => Promise<void> }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [church, setChurch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setChurch(await portal.checkPhone(phone));
      const { error: otpError } = await supabase().auth.signInWithOtp({
        phone: toE164(phone),
      });
      if (otpError) throw otpError;
      setStep("code");
    } catch (err) {
      setError(portalError(err, "Couldn't send the code. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: verifyError } = await supabase().auth.verifyOtp({
        phone: toE164(phone),
        token: code.trim(),
        type: "sms",
      });
      if (verifyError) throw verifyError;
      await onDone();
    } catch (err) {
      setError(portalError(err, "That code didn't work. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h1 className="font-heading text-2xl font-bold">
          Sign in to your courses
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the mobile number you gave the church. We&apos;ll text you a code.
        </p>
      </div>
      {step === "phone" ? (
        <form onSubmit={sendCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="portal-phone">Mobile number</Label>
            <Input
              id="portal-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit number"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={busy || phone.trim().length < 7}
          >
            {busy ? "Sending..." : "Send code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A code was sent to {phone}
            {church ? ` for ${church}` : ""}.
          </p>
          <div className="space-y-2">
            <Label htmlFor="portal-code">Code</Label>
            <Input
              id="portal-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={8}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={busy || code.trim().length < 4}
          >
            {busy ? "Checking..." : "Sign in"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => setStep("phone")}
          >
            Use a different number
          </Button>
        </form>
      )}
    </div>
  );
}
