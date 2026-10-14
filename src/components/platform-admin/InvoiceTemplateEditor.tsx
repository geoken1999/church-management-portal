"use client";

import { useRef, useState, useTransition } from "react";
import { Download, ImagePlus, Mail, Save, Trash2 } from "lucide-react";
import { saveInvoiceTemplateAction, sendTestInvoiceAction, uploadInvoiceLogoAction } from "@/lib/invoices/actions";
import { sampleDocument, addressLines } from "@/lib/invoices/document";
import { amountInWords } from "@/lib/invoices/numbers";
import { formatRupees } from "@/lib/billing/gst";
import { INDIAN_STATES } from "@/lib/billing/states";
import { templateProblems, type InvoiceTemplate } from "@/lib/invoices/template";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ErrorToast } from "@/components/ui/error-toast";

const SELECT_CLASS = "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// The invoice, drawn on the page from the template being edited, so changes show as they are typed.
function InvoicePreview({ template }: { template: InvoiceTemplate }) {
  const doc = sampleDocument(template);
  const t = template;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white text-[11px] leading-snug text-neutral-800 shadow-sm">
      <div style={{ background: t.accentColor }} className="h-2" />
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {t.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logoUrl} alt="" className="size-14 shrink-0 object-contain" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-neutral-900">{doc.seller.name}</p>
              {addressLines(doc.seller).map((line) => (
                <p key={line} className="text-neutral-500">{line}</p>
              ))}
              <p className="text-neutral-500">{[doc.seller.email, doc.seller.phone, doc.seller.website].filter(Boolean).join("  |  ")}</p>
              <p className="text-neutral-500">{[doc.seller.gstin && `GSTIN: ${doc.seller.gstin}`, doc.seller.pan && `PAN: ${doc.seller.pan}`].filter(Boolean).join("   ")}</p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold" style={{ color: t.accentColor }}>TAX INVOICE</p>
            <p>Invoice no: {doc.invoiceNumber}</p>
            <p>Date: {new Date(doc.issuedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </div>
        <hr />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="font-bold" style={{ color: t.accentColor }}>BILL TO</p>
            <p className="font-semibold">{doc.buyer.name}</p>
            {addressLines(doc.buyer).map((line) => (
              <p key={line} className="text-neutral-500">{line}</p>
            ))}
          </div>
          <div>
            <p className="font-bold" style={{ color: t.accentColor }}>PLACE OF SUPPLY</p>
            <p>{doc.placeOfSupply}</p>
          </div>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: t.accentColor }} className="text-left text-white">
              <th className="p-1.5">#</th>
              <th className="p-1.5">Description</th>
              {t.showSac && <th className="p-1.5">SAC</th>}
              <th className="p-1.5">Qty</th>
              <th className="p-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border border-neutral-200">
              <td className="p-1.5">1</td>
              <td className="p-1.5">{doc.lineItems[0].description}</td>
              {t.showSac && <td className="p-1.5">{t.sacCode}</td>}
              <td className="p-1.5">1</td>
              <td className="p-1.5 text-right">{formatRupees(doc.subtotal)}</td>
            </tr>
          </tbody>
        </table>
        <div className="ml-auto w-56 space-y-1">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatRupees(doc.subtotal)}</span></div>
          <div className="flex justify-between"><span>CGST @ 9%</span><span>{formatRupees(doc.cgst)}</span></div>
          <div className="flex justify-between"><span>SGST @ 9%</span><span>{formatRupees(doc.sgst)}</span></div>
          <div className="flex justify-between px-1.5 py-1 font-bold text-white" style={{ background: t.accentColor }}><span>Total</span><span>{formatRupees(doc.total)}</span></div>
        </div>
        <p className="italic text-neutral-500">Amount in words: {amountInWords(doc.total)}</p>
        {t.showBankDetails && (t.accountNumber || t.upiId) && (
          <div>
            <p className="font-bold" style={{ color: t.accentColor }}>PAYMENT DETAILS</p>
            <p className="text-neutral-500">{[t.accountName, t.bankName, t.accountNumber && `A/c ${t.accountNumber}`, t.ifsc && `IFSC ${t.ifsc}`, t.upiId && `UPI ${t.upiId}`].filter(Boolean).join("  ·  ")}</p>
          </div>
        )}
        {t.notes && <p className="text-neutral-500"><span className="font-bold" style={{ color: t.accentColor }}>NOTES </span>{t.notes}</p>}
        {t.terms && <p className="text-neutral-500"><span className="font-bold" style={{ color: t.accentColor }}>TERMS </span>{t.terms}</p>}
        <div className="flex items-end justify-between pt-6">
          <p style={{ color: t.accentColor }}>{t.footer}</p>
          <div className="text-right text-neutral-500">
            <p>For {doc.seller.name}</p>
            <p className="mt-6 border-t border-neutral-300 pt-1">{t.signatureLabel}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InvoiceTemplateEditor({ initial }: { initial: InvoiceTemplate }) {
  const [t, setT] = useState<InvoiceTemplate>(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const logoInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof InvoiceTemplate>(key: K, value: InvoiceTemplate[K]) => setT((prev) => ({ ...prev, [key]: value }));
  const text = (key: keyof InvoiceTemplate) => ({ value: String(t[key] ?? ""), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never) });
  const missing = templateProblems(t);

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await saveInvoiceTemplateAction(t);
      if (result.error) setError(result.error);
      else {
        if (result.template) setT(result.template);
        setNotice("Saved. New invoices will use this template; invoices already issued keep the one they were made with.");
      }
    });
  }

  function uploadLogo(file: File | undefined) {
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.set("logo", file);
    startTransition(async () => {
      const result = await uploadInvoiceLogoAction(form);
      if (result.error) setError(result.error);
      else if (result.url) set("logoUrl", result.url);
    });
  }

  function sendTest() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const saved = await saveInvoiceTemplateAction(t);
      if (saved.error) return setError(saved.error);
      const result = await sendTestInvoiceAction();
      if (result.error) setError(result.error);
      else setNotice(`A sample invoice was emailed to ${result.sentTo}.`);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <ErrorToast message={error} />
      <div className="space-y-4">
        {missing.length > 0 && (
          <Alert>
            <AlertDescription>Real invoices need {missing.join(", ")}. Until they are filled in, invoices are still issued but won&apos;t be valid tax invoices.</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Who the invoice is from</CardTitle>
            <CardDescription>Your business as it must appear on a GST invoice.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Company name"><Input {...text("companyName")} /></Field></div>
            <div className="sm:col-span-2"><Field label="Address"><Input {...text("addressLine1")} /></Field></div>
            <div className="sm:col-span-2"><Field label="Address line 2"><Input {...text("addressLine2")} /></Field></div>
            <Field label="City"><Input {...text("city")} /></Field>
            <Field label="PIN code"><Input {...text("pincode")} maxLength={6} /></Field>
            <div className="sm:col-span-2">
              <Field label="State" hint="Decides the tax: buyers in this state are charged CGST and SGST, everyone else IGST.">
                <select className={SELECT_CLASS} value={t.state} onChange={(e) => set("state", e.target.value)}>
                  <option value="">Choose a state…</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="GSTIN"><Input {...text("gstin")} maxLength={15} placeholder="27ABCDE1234F1Z5" /></Field>
            <Field label="PAN"><Input {...text("pan")} maxLength={10} /></Field>
            <Field label="Email"><Input {...text("email")} /></Field>
            <Field label="Phone"><Input {...text("phone")} /></Field>
            <div className="sm:col-span-2"><Field label="Website"><Input {...text("website")} /></Field></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Look and numbering</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Logo</Label>
              <div className="flex flex-wrap items-center gap-2">
                {t.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.logoUrl} alt="Logo" className="size-12 rounded border border-border object-contain" />
                )}
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => logoInput.current?.click()}>
                  <ImagePlus className="size-3.5" />
                  {t.logoUrl ? "Replace logo" : "Upload logo"}
                </Button>
                {t.logoUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set("logoUrl", null)}>
                    <Trash2 className="size-3.5" />
                    Remove
                  </Button>
                )}
                <input ref={logoInput} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { uploadLogo(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <p className="text-xs text-muted-foreground">PNG or JPEG, under 1 MB, roughly square.</p>
            </div>
            <Field label="Accent colour">
              <div className="flex items-center gap-2">
                <input type="color" value={t.accentColor} onChange={(e) => set("accentColor", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent" aria-label="Accent colour" />
                <Input value={t.accentColor} onChange={(e) => set("accentColor", e.target.value)} maxLength={7} />
              </div>
            </Field>
            <Field label="Number prefix" hint={`Invoices read ${t.prefix || "KF"}/26-27/000001, restarting each April.`}><Input {...text("prefix")} maxLength={8} /></Field>
            <Field label="SAC code" hint="The service accounting code for what you sell. Confirm it with your accountant."><Input {...text("sacCode")} maxLength={10} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" className="size-4" checked={t.showSac} onChange={(e) => set("showSac", e.target.checked)} />
              Show the SAC code on each line
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Payment details, terms and footer</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-4" checked={t.showBankDetails} onChange={(e) => set("showBankDetails", e.target.checked)} />
              Show bank details on the invoice
            </label>
            {t.showBankDetails && (
              <>
                <Field label="Account name"><Input {...text("accountName")} /></Field>
                <Field label="Bank"><Input {...text("bankName")} /></Field>
                <Field label="Account number"><Input {...text("accountNumber")} /></Field>
                <Field label="IFSC"><Input {...text("ifsc")} /></Field>
                <div className="sm:col-span-2"><Field label="UPI ID"><Input {...text("upiId")} /></Field></div>
              </>
            )}
            <div className="sm:col-span-2"><Field label="Notes"><Textarea rows={2} {...text("notes")} /></Field></div>
            <div className="sm:col-span-2"><Field label="Terms"><Textarea rows={2} {...text("terms")} /></Field></div>
            <Field label="Footer line"><Input {...text("footer")} /></Field>
            <Field label="Signature label"><Input {...text("signatureLabel")} /></Field>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={save}>
            <Save className="size-4" />
            {pending ? "Saving…" : "Save template"}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={sendTest}>
            <Mail className="size-4" />
            Email me a sample
          </Button>
          <Button type="button" variant="outline" nativeButton={false} render={<a href="/platform-admin/invoice-template/sample" target="_blank" rel="noreferrer" />}>
            <Download className="size-4" />
            Sample PDF (saved template)
          </Button>
        </div>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <p className="mb-2 text-sm font-medium">Preview</p>
        <InvoicePreview template={t} />
        <p className="mt-2 text-xs text-muted-foreground">The preview shows a made-up invoice. The PDF uses the same details, and shows amounts as &quot;Rs.&quot;.</p>
      </div>
    </div>
  );
}
