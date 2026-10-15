"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteDocumentAction,
  getDocumentLinkAction,
  reopenOnboardingAction,
  saveModulesAction,
  sendOnboardingToTenantAction,
  setDocumentStatusAction,
  startOnboardingAction,
  uploadDocumentAction,
  type OnboardingResult,
} from "@/lib/onboarding/actions";
import {
  ONBOARDING_DOCS,
  ONBOARDING_MODULES,
  MANDATE_LIMIT_RUPEES,
  quoteFor,
} from "@/lib/onboarding/config";
import { formatPrice } from "@/lib/billing/gst";
import type { OnboardingDocument, OnboardingRow } from "@/lib/onboarding/store";
import { Stepper } from "@/components/ui/stepper";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorToast } from "@/components/ui/error-toast";

const STEPS = [
  { key: "documents", label: "Legal documents" },
  { key: "modules", label: "Modules" },
  { key: "review", label: "Review & send" },
];

export function OnboardingWizard({
  organizationId,
  onboarding,
  documents,
  prices,
}: {
  organizationId: string;
  onboarding: OnboardingRow | null;
  documents: OnboardingDocument[];
  prices: Record<string, number>;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>(onboarding?.modules ?? []);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<OnboardingResult>,
    done?: string,
    after?: () => void,
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        if (done) setNotice(done);
        after?.();
        router.refresh();
      }
    });
  }

  if (!onboarding) {
    return (
      <Card>
        <ErrorToast message={error} />
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This tenant hasn&apos;t been onboarded yet. Starting pre-selects the
            default modules from the Modules page.
          </p>
          <Button
            disabled={pending}
            onClick={() => run(() => startOnboardingAction(organizationId))}
          >
            Start onboarding
          </Button>
        </CardContent>
      </Card>
    );
  }

  const locked = onboarding.status !== "in_progress";
  const quote = quoteFor(selected, prices);
  const missing = ONBOARDING_DOCS.filter(
    (d) =>
      d.required &&
      !documents.some(
        (doc) => doc.doc_type === d.type && doc.status === "verified",
      ),
  );

  return (
    <div className="space-y-6">
      <ErrorToast message={error} />
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {onboarding.status === "awaiting_payment" && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            Sent to the tenant on{" "}
            {onboarding.sent_at
              ? new Date(onboarding.sent_at).toLocaleString()
              : "—"}
            . Waiting for them to authorize the subscription on their Billing
            page.
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(
                  () => reopenOnboardingAction(organizationId),
                  "Reopened. You can change the modules.",
                )
              }
            >
              Reopen to edit
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {onboarding.status === "active" && (
        <Alert>
          <AlertDescription>
            Onboarded
            {onboarding.activated_at
              ? ` on ${new Date(onboarding.activated_at).toLocaleDateString()}`
              : ""}
            . The subscription is active and the modules are switched on.
          </AlertDescription>
        </Alert>
      )}

      <Stepper steps={STEPS} currentStepIndex={step} onStepClick={setStep} />

      {step === 0 && (
        <DocumentsStep
          organizationId={organizationId}
          documents={documents}
          locked={onboarding.status === "active"}
          run={run}
          pending={pending}
        />
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Modules</CardTitle>
            <CardDescription>
              Pick what the tenant opts for. Prices come from the Modules page;
              the default modules start ticked.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="divide-y divide-border rounded-lg border border-border">
              {ONBOARDING_MODULES.map((m) => (
                <label
                  key={m.key}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={selected.includes(m.key)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, m.key]
                            : s.filter((k) => k !== m.key),
                        )
                      }
                    />
                    {m.label}
                  </span>
                  <span className="text-muted-foreground">
                    {prices[m.key]
                      ? `${formatPrice(prices[m.key])}/mo`
                      : "No price set"}
                  </span>
                </label>
              ))}
            </div>
            <Totals quote={quote} count={selected.length} />
            {!locked && (
              <Button
                disabled={pending}
                onClick={() =>
                  run(
                    () => saveModulesAction(organizationId, selected),
                    "Modules saved.",
                    () => setStep(2),
                  )
                }
              >
                Save and continue
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Review &amp; send</CardTitle>
            <CardDescription>
              The tenant gets an email with the total and authorizes the UPI
              Autopay subscription from their Billing page. Modules switch on
              when it is confirmed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium">Documents</p>
              {missing.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  All required documents are verified.
                </p>
              ) : (
                <p className="text-sm text-destructive">
                  Still to verify: {missing.map((d) => d.label).join(", ")}.
                </p>
              )}
            </div>
            <div>
              <p className="text-sm font-medium">
                Modules ({onboarding.modules.length} saved)
              </p>
              <p className="text-sm text-muted-foreground">
                {ONBOARDING_MODULES.filter((m) =>
                  onboarding.modules.includes(m.key),
                )
                  .map((m) => m.label)
                  .join(", ") || "None chosen yet."}
              </p>
            </div>
            <Totals
              quote={quoteFor(onboarding.modules, prices)}
              count={onboarding.modules.length}
            />
            {onboarding.status === "in_progress" && (
              <Button
                disabled={pending}
                onClick={() =>
                  run(
                    () => sendOnboardingToTenantAction(organizationId),
                    "Sent. The tenant has been emailed.",
                  )
                }
              >
                {pending ? "Sending..." : "Send to tenant"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          Back
        </Button>
        <Button
          variant="outline"
          disabled={step === STEPS.length - 1}
          onClick={() => setStep(step + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function Totals({
  quote,
  count,
}: {
  quote: ReturnType<typeof quoteFor>;
  count: number;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-4 text-sm">
      <div className="flex justify-between">
        <span>
          {count} {count === 1 ? "module" : "modules"} per month
        </span>
        <span>{formatPrice(quote.base)}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>GST 18%</span>
        <span>{formatPrice(quote.gst)}</span>
      </div>
      <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
        <span>Total charged monthly</span>
        <span>{formatPrice(quote.total)}</span>
      </div>
      {quote.overMandateLimit && (
        <p className="mt-2 text-destructive">
          Over the UPI Autopay limit of {formatPrice(MANDATE_LIMIT_RUPEES)} a
          month; this can&apos;t be sent.
        </p>
      )}
    </div>
  );
}

function DocumentsStep({
  organizationId,
  documents,
  locked,
  run,
  pending,
}: {
  organizationId: string;
  documents: OnboardingDocument[];
  locked: boolean;
  run: (
    action: () => Promise<OnboardingResult>,
    done?: string,
    after?: () => void,
  ) => void;
  pending: boolean;
}) {
  const [viewError, setViewError] = useState<string | null>(null);

  async function view(id: string) {
    setViewError(null);
    const result = await getDocumentLinkAction(id);
    if (result.error || !result.url)
      setViewError(result.error ?? "Couldn't open that document.");
    else window.open(result.url, "_blank", "noopener");
  }

  function upload(docType: string, file: File | undefined) {
    if (!file) return;
    const data = new FormData();
    data.set("organizationId", organizationId);
    data.set("docType", docType);
    data.set("file", file);
    run(() => uploadDocumentAction(data), "Uploaded.");
  }

  return (
    <div className="space-y-3">
      <ErrorToast message={viewError} />
      <p className="text-sm text-muted-foreground">
        Upload what the tenant sent you (PDF, JPEG or PNG, up to 10 MB each),
        then mark each document verified. Required ones must be verified before
        you can send.
      </p>
      {ONBOARDING_DOCS.map((doc) => {
        const mine = documents.filter((d) => d.doc_type === doc.type);
        const verified = mine.some((d) => d.status === "verified");
        return (
          <Card key={doc.type}>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{doc.label}</span>
                    <Badge variant={doc.required ? "secondary" : "outline"}>
                      {doc.required ? "Required" : "Optional"}
                    </Badge>
                    {verified && <Badge>Verified</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{doc.help}</p>
                </div>
                {!locked && (
                  <Input
                    type="file"
                    className="max-w-xs"
                    accept="application/pdf,image/jpeg,image/png"
                    disabled={pending}
                    onChange={(e) => upload(doc.type, e.target.files?.[0])}
                  />
                )}
              </div>
              {mine.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {d.file_name}{" "}
                    <Badge
                      variant={
                        d.status === "verified"
                          ? "default"
                          : d.status === "rejected"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {d.status}
                    </Badge>
                  </span>
                  <span className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => view(d.id)}
                    >
                      View
                    </Button>
                    {!locked && (
                      <>
                        {d.status !== "verified" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                setDocumentStatusAction(d.id, "verified", ""),
                              )
                            }
                          >
                            Verify
                          </Button>
                        )}
                        {d.status !== "rejected" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                setDocumentStatusAction(d.id, "rejected", ""),
                              )
                            }
                          >
                            Reject
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            if (confirm(`Delete ${d.file_name}?`))
                              run(() => deleteDocumentAction(d.id));
                          }}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
