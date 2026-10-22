"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completePackageOnboardingAction,
  deleteDocumentAction,
  getDocumentLinkAction,
  reopenOnboardingAction,
  saveCustomPlanAction,
  sendOnboardingToTenantAction,
  setDocumentStatusAction,
  setPlanTypeAction,
  startOnboardingAction,
  uploadDocumentAction,
  type OnboardingResult,
} from "@/lib/onboarding/actions";
import {
  CREDIT_TYPES,
  ONBOARDING_DOCS,
  ONBOARDING_MODULES,
  MANDATE_LIMIT_RUPEES,
  cleanCredits,
  creditText,
  creditPrice,
  quoteFor,
  snapCount,
  stepCount,
  steppedRule,
  type CreditKey,
  type Credits,
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
  { key: "modules", label: "Modules & credits" },
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
  const [credits, setCredits] = useState<
    Record<string, { count: string; price: string; unlimited: boolean }>
  >(() =>
    Object.fromEntries(
      CREDIT_TYPES.map((t) => [
        t.key,
        {
          count: String(onboarding?.credits[t.key]?.count ?? ""),
          price: String(onboarding?.credits[t.key]?.price ?? ""),
          unlimited: onboarding?.credits[t.key]?.unlimited === true,
        },
      ]),
    ),
  );
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
        <CardHeader>
          <CardTitle>What kind of onboarding?</CardTitle>
          <CardDescription>
            You can switch before it is sent or completed.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border border-border p-4 text-left hover:border-primary"
            onClick={() =>
              run(() => startOnboardingAction(organizationId, "package"))
            }
          >
            <p className="font-medium">Package plan</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The tenant picks Starter, Growth or Pro themselves. You only
              collect and verify their legal documents.
            </p>
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border border-border p-4 text-left hover:border-primary"
            onClick={() =>
              run(() => startOnboardingAction(organizationId, "custom"))
            }
          >
            <p className="font-medium">Custom plan</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Documents, then the modules and monthly credits you price for
              them, then a subscription for the total.
            </p>
          </button>
        </CardContent>
      </Card>
    );
  }

  // One block up or down for a limit sold in blocks; the price follows from the count.
  function stepCredit(key: CreditKey, direction: 1 | -1) {
    setCredits((c) => {
      const included = steppedRule(key)?.included ?? 0;
      const next = stepCount(key, Number(c[key].count) || included, direction);
      return {
        ...c,
        [key]: {
          ...c[key],
          count: String(next),
          price: String(creditPrice(key, next)),
        },
      };
    });
  }

  const isCustom = onboarding.plan_type === "custom";
  const steps = isCustom ? STEPS : STEPS.slice(0, 1);
  const stepIndex = Math.min(step, steps.length - 1);
  const locked = onboarding.status !== "in_progress";
  const creditInput = Object.fromEntries(
    CREDIT_TYPES.map((t) => [
      t.key,
      {
        count: Number(credits[t.key].count) || 0,
        price: Number(credits[t.key].price) || 0,
        unlimited: credits[t.key].unlimited,
      },
    ]),
  );
  const quote = quoteFor(selected, prices, cleanCredits(creditInput));
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

      {onboarding.status === "in_progress" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Onboarding kind:</span>
          {(["package", "custom"] as const).map((type) => (
            <Button
              key={type}
              size="sm"
              variant={onboarding.plan_type === type ? "default" : "outline"}
              disabled={pending}
              onClick={() =>
                onboarding.plan_type !== type &&
                run(() => setPlanTypeAction(organizationId, type))
              }
            >
              {type === "package" ? "Package plan" : "Custom plan"}
            </Button>
          ))}
        </div>
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
                  "Reopened. You can change the plan.",
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
            .
            {isCustom
              ? " The subscription is active and the modules are switched on."
              : " Their documents are verified; they choose a package plan on their Billing page."}
          </AlertDescription>
        </Alert>
      )}

      {steps.length > 1 && (
        <Stepper
          steps={steps}
          currentStepIndex={stepIndex}
          onStepClick={setStep}
        />
      )}

      {stepIndex === 0 && (
        <>
          <DocumentsStep
            organizationId={organizationId}
            documents={documents}
            locked={onboarding.status === "active"}
            run={run}
            pending={pending}
          />
          {!isCustom && onboarding.status === "in_progress" && (
            <div className="flex items-center gap-3">
              <Button
                disabled={pending}
                onClick={() =>
                  run(
                    () => completePackageOnboardingAction(organizationId),
                    "Onboarding complete.",
                  )
                }
              >
                Complete onboarding
              </Button>
              {missing.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  Still to verify: {missing.map((d) => d.label).join(", ")}.
                </span>
              )}
            </div>
          )}
        </>
      )}

      {isCustom && stepIndex === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Modules &amp; credits</CardTitle>
            <CardDescription>
              Pick the modules, then set the monthly credits you are giving this
              tenant, with the count and the price you decide.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
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

            <div>
              <p className="mb-2 text-sm font-medium">Limits &amp; credits</p>
              <div className="rounded-lg border border-border">
                <div className="grid grid-cols-[1fr_120px_90px_120px] gap-3 border-b border-border px-4 py-2 text-xs uppercase text-muted-foreground">
                  <span>Limit</span>
                  <span>Count</span>
                  <span>No limit</span>
                  <span>₹ per month</span>
                </div>
                {CREDIT_TYPES.map((t, i) => (
                  <div key={t.key}>
                    {(i === 0 || CREDIT_TYPES[i - 1].group !== t.group) && (
                      <p className="bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground">
                        {t.group}
                      </p>
                    )}
                    <div className="grid grid-cols-[1fr_120px_90px_120px] items-center gap-3 border-b border-border px-4 py-2 last:border-0">
                      <span className="text-sm">
                        {t.label}{" "}
                        <span className="text-muted-foreground">
                          ({t.unit})
                        </span>
                      </span>
                      {steppedRule(t.key) ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            disabled={locked || credits[t.key].unlimited}
                            aria-label={`Fewer ${t.label} (down ${steppedRule(t.key)!.step.toLocaleString("en-IN")})`}
                            onClick={() => stepCredit(t.key, -1)}
                          >
                            −
                          </Button>
                          <span
                            className="min-w-14 text-center text-sm font-medium"
                            aria-label={`${t.label} count`}
                          >
                            {credits[t.key].unlimited
                              ? "—"
                              : snapCount(
                                  t.key,
                                  Number(credits[t.key].count) ||
                                    steppedRule(t.key)!.included,
                                ).toLocaleString("en-IN")}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            disabled={locked || credits[t.key].unlimited}
                            aria-label={`More ${t.label} (up ${steppedRule(t.key)!.step.toLocaleString("en-IN")})`}
                            onClick={() => stepCredit(t.key, 1)}
                          >
                            +
                          </Button>
                        </div>
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          max={t.max}
                          step="1"
                          disabled={locked || credits[t.key].unlimited}
                          aria-label={`${t.label} count`}
                          value={
                            credits[t.key].unlimited ? "" : credits[t.key].count
                          }
                          onChange={(e) =>
                            setCredits((c) => ({
                              ...c,
                              [t.key]: { ...c[t.key], count: e.target.value },
                            }))
                          }
                        />
                      )}
                      {t.canBeUnlimited ? (
                        <input
                          type="checkbox"
                          disabled={locked}
                          aria-label={`${t.label} has no limit`}
                          checked={credits[t.key].unlimited}
                          onChange={(e) =>
                            setCredits((c) => ({
                              ...c,
                              [t.key]: {
                                ...c[t.key],
                                unlimited: e.target.checked,
                              },
                            }))
                          }
                        />
                      ) : (
                        <span />
                      )}
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        // Limits sold in blocks are priced from the count, so the price is not typed in.
                        disabled={
                          locked ||
                          (Boolean(steppedRule(t.key)) &&
                            !credits[t.key].unlimited)
                        }
                        aria-label={`${t.label} price per month`}
                        value={
                          steppedRule(t.key) && !credits[t.key].unlimited
                            ? creditPrice(
                                t.key,
                                Number(credits[t.key].count) ||
                                  steppedRule(t.key)!.included,
                              )
                            : credits[t.key].price
                        }
                        onChange={(e) =>
                          setCredits((c) => ({
                            ...c,
                            [t.key]: { ...c[t.key], price: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Each limit starts at what the Starter plan includes, and goes up
                or down one block at a time with the + and − buttons. Each extra
                block adds its price a month (before GST), worked out for you
                and the same as the add-on packs: storage 20 GB ₹50, branch ₹10,
                forms 10 ₹20, chat group ₹20, admin login ₹20, staff login ₹5,
                social account ₹50, emails 1,000 ₹50, SMS 20 ₹30, WhatsApp 500
                ₹50, AI replies 100 ₹50, members 100 ₹30. Anything left alone
                gets the Starter number, so a tenant never gets more than you
                priced. Mobile app features are the Starter&apos;s for everyone.
              </p>
            </div>

            <Totals quote={quote} count={selected.length} />
            {!locked && (
              <Button
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      saveCustomPlanAction(
                        organizationId,
                        selected,
                        creditInput,
                      ),
                    "Saved.",
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

      {isCustom && stepIndex === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Review &amp; send</CardTitle>
            <CardDescription>
              The tenant gets an email with the total and authorizes the UPI
              Autopay subscription from their Billing page. Modules and credits
              switch on when it is confirmed.
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
            <div>
              <p className="text-sm font-medium">Credits</p>
              <p className="text-sm text-muted-foreground">
                {CREDIT_TYPES.filter((t) => onboarding.credits[t.key])
                  .map((t) => creditText(t, onboarding.credits[t.key]!))
                  .join(" · ") || "None set."}
              </p>
              {creditWarnings(onboarding.modules, onboarding.credits).map(
                (w) => (
                  <p key={w} className="text-sm text-amber-600">
                    {w}
                  </p>
                ),
              )}
            </div>
            <Totals
              quote={quoteFor(onboarding.modules, prices, onboarding.credits)}
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

      {steps.length > 1 && (
        <div className="flex justify-between">
          <Button
            variant="outline"
            disabled={stepIndex === 0}
            onClick={() => setStep(stepIndex - 1)}
          >
            Back
          </Button>
          <Button
            variant="outline"
            disabled={stepIndex === steps.length - 1}
            onClick={() => setStep(stepIndex + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// A module that needs an allowance but has none would be switched on and unusable.
function creditWarnings(modules: string[], credits: Credits): string[] {
  const needs: [string, keyof Credits, string][] = [
    ["email", "email", "Email"],
    ["sms", "sms", "SMS"],
    ["whatsapp", "whatsapp", "WhatsApp"],
  ];
  return needs
    .filter(([module, credit]) => modules.includes(module) && !credits[credit])
    .map(
      ([, , label]) =>
        `${label} is on but has no monthly allowance, so the tenant can't send any.`,
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
