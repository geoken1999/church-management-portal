"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MessageCircle, PhoneCall } from "lucide-react";
import {
  connectWhatsAppManuallyAction,
  completeEmbeddedSignupAction,
  disconnectWhatsAppAction,
  testWhatsAppConnectionAction,
} from "@/lib/whatsapp/connection-actions";
import type { WhatsAppConnectionSummary } from "@/lib/whatsapp/credentials";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>) => void;
    };
  }
}

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const EMBEDDED_CONFIG_ID = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID;
const EMBEDDED_AVAILABLE = Boolean(META_APP_ID && EMBEDDED_CONFIG_ID);

function loadFacebookSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.onload = () => {
      window.FB?.init({ appId: META_APP_ID, autoLogAppEvents: true, xfbml: false, version: "v21.0" });
      resolve();
    };
    script.onerror = () => reject(new Error("Couldn't load Facebook. Check your connection and any content blockers."));
    document.body.appendChild(script);
  });
}

export function WhatsAppConnectionCard({
  connection,
  isOrgAdmin,
  webhookUrl,
}: {
  connection: WhatsAppConnectionSummary | null;
  isOrgAdmin: boolean;
  webhookUrl: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState({ wabaId: "", phoneNumberId: "", accessToken: "", appSecret: "" });
  // Embedded Signup reports the new account's IDs through a window message,
  // separate from the login's code; both are needed to finish.
  const signupIds = useRef<{ wabaId: string; phoneNumberId: string } | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH" && data.data) {
          signupIds.current = { wabaId: String(data.data.waba_id ?? ""), phoneNumberId: String(data.data.phone_number_id ?? "") };
        }
      } catch {}
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function report(result: { error?: string; success?: boolean }, successText: string) {
    setMessage(result.error ? { kind: "error", text: result.error } : { kind: "success", text: successText });
  }

  function handleManualConnect() {
    startTransition(async () => {
      const result = await connectWhatsAppManuallyAction(form);
      report(result, "Connected. Messages from this church now send from your own number.");
      if (result.success) {
        setShowManual(false);
        setForm({ wabaId: "", phoneNumberId: "", accessToken: "", appSecret: "" });
      }
    });
  }

  async function handleEmbeddedSignup() {
    setMessage(null);
    try {
      await loadFacebookSdk();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Couldn't start the WhatsApp signup." });
      return;
    }
    signupIds.current = null;
    window.FB?.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setMessage({ kind: "error", text: "The WhatsApp signup was cancelled." });
          return;
        }
        // The IDs message can land just after the login callback.
        setTimeout(() => {
          const ids = signupIds.current;
          if (!ids) {
            setMessage({ kind: "error", text: "The WhatsApp signup didn't finish. Please try again." });
            return;
          }
          startTransition(async () => {
            report(await completeEmbeddedSignupAction({ code, ...ids }), "Connected. Messages from this church now send from your own number.");
          });
        }, 1500);
      },
      { config_id: EMBEDDED_CONFIG_ID, response_type: "code", override_default_response_type: true, extras: { setup: {}, sessionInfoVersion: "3" } },
    );
  }

  function handleTest() {
    startTransition(async () => report(await testWhatsAppConnectionAction(), "Your WhatsApp connection is working."));
  }

  function handleDisconnect() {
    if (
      !window.confirm(
        "Disconnect your WhatsApp number? Messages will go back to sending from KingdomFlow's shared number. Templates you created under your own number stay with that number and can't be used from the shared one, so you would need to create them again.",
      )
    ) {
      return;
    }
    startTransition(async () => report(await disconnectWhatsAppAction(), "Disconnected. WhatsApp now uses KingdomFlow's shared number."));
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-accent">
              <PhoneCall className="size-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Your WhatsApp number</p>
              {connection ? (
                <p className="text-sm text-muted-foreground">
                  Sending from {connection.verifiedName ? `${connection.verifiedName} · ` : ""}
                  {connection.displayPhoneNumber ?? "your number"}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Sending from KingdomFlow&apos;s shared number. Connect your own so messages come from your church&apos;s number.</p>
              )}
            </div>
          </div>
          {connection && <Badge variant={connection.status === "active" ? "default" : "destructive"}>{connection.status === "active" ? "Connected" : "Needs attention"}</Badge>}
        </div>

        {message && (
          <Alert variant={message.kind === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}
        {connection?.lastError && connection.status !== "active" && (
          <Alert variant="destructive">
            <AlertDescription>{connection.lastError}</AlertDescription>
          </Alert>
        )}

        {isOrgAdmin && connection && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={pending}>
                {pending ? "Checking..." : "Test connection"}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDisconnect} disabled={pending}>
                Disconnect
              </Button>
            </div>
            {connection.webhookVerifyToken && (
              <div className="space-y-1 rounded-md border border-border p-3 text-xs">
                <p className="font-medium">To receive replies in your inbox</p>
                <p className="text-muted-foreground">
                  In your Meta app&apos;s WhatsApp → Configuration, set the callback URL and verify token below, and subscribe to the <code>messages</code> field.
                </p>
                <p>
                  Callback URL: <code className="break-all">{webhookUrl}</code>
                </p>
                <p>
                  Verify token: <code className="break-all">{connection.webhookVerifyToken}</code>
                </p>
                {!connection.hasOwnAppSecret && <p className="text-destructive">Reconnect with your app secret so incoming messages can be verified.</p>}
              </div>
            )}
          </div>
        )}

        {isOrgAdmin && !connection && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {EMBEDDED_AVAILABLE && (
                <Button type="button" size="sm" onClick={handleEmbeddedSignup} disabled={pending}>
                  <MessageCircle className="size-4" /> Connect with Facebook
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => setShowManual((v) => !v)}>
                Enter credentials manually
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Templates are tied to a WhatsApp number&apos;s account. After connecting your own, create your templates again so they exist on your account.
            </p>

            {showManual && (
              <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">WhatsApp Business Account ID</Label>
                  <Input value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value })} inputMode="numeric" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone Number ID</Label>
                  <Input value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} inputMode="numeric" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Permanent access token</Label>
                  <Input type="password" autoComplete="off" value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">App secret (needed to receive replies; optional for sending only)</Label>
                  <Input type="password" autoComplete="off" value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Button type="button" size="sm" onClick={handleManualConnect} disabled={pending}>
                    {pending ? "Verifying..." : "Verify and connect"}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">We check the credentials with Meta before saving. They are stored encrypted and never shown again.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
