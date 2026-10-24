import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { emailInvoice } from "@/lib/invoices/issue";
import { loadInvoiceTemplate, saveInvoiceTemplate } from "@/lib/invoices/template-store";
import { normalizeInvoiceTemplate, templateProblems } from "@/lib/invoices/template";
import { PLATFORM_TEMPLATE_CATALOG } from "@/lib/whatsapp/platform-catalog";
import { refreshPlatformTemplates, submitPlatformTemplate } from "@/lib/whatsapp/platform-templates";
import {
  CREDIT_TYPES,
  ONBOARDING_DOCS,
  ONBOARDING_MODULES,
  cleanCredits,
  creditText,
  docLabel,
  quoteFor,
  steppedRule,
  type CreditKey,
  type PlanType,
} from "@/lib/onboarding/config";
import {
  getModulePricing,
  getOnboarding,
  getOnboardingDocuments,
} from "@/lib/onboarding/store";
import { sendOnboardingReadyEmail } from "@/lib/billing/receipts";
import { getSiteUrl } from "@/lib/site-url";
import { formatRupees } from "@/lib/billing/gst";
import { GRANTABLE_SCOPES, cleanScopes } from "@/lib/admin-app/scopes";
import { logPlatformEvent } from "@/lib/platform-events/log";
import type { PlatformInvoice, PlatformWhatsAppTemplate } from "@/types/database";
import type { SectionInput } from "@/lib/admin-app/section-types";
import { day, fail, inr, ok, when, type AdminSection } from "./common";

// ---- Invoices ---------------------------------------------------------------------------------------------

const invoices: AdminSection = {
  key: "invoices",
  scope: "finance",
  title: "Invoices",
  description: "Tax invoices issued to churches; send one again",
  icon: "description",
  async load() {
    const { data } = await createAdminClient()
      .from("platform_invoices")
      .select("*")
      .order("issued_at", { ascending: false })
      .limit(100);
    const rows = (data ?? []) as PlatformInvoice[];
    const orgIds = [...new Set(rows.map((r) => r.organization_id))];
    const { data: orgs } = orgIds.length
      ? await createAdminClient().from("organizations").select("id, name").in("id", orgIds)
      : { data: [] };
    const names = new Map((orgs ?? []).map((o) => [o.id, o.name]));
    return {
      title: "Invoices",
      note: "Every invoice is emailed to the church and a copy goes to you. Send one again after fixing the church's billing email.",
      summary: [
        { label: "Issued (latest 100)", value: String(rows.length) },
        { label: "Church email failed", value: String(rows.filter((r) => !r.email_sent_at).length) },
      ],
      groups: [
        {
          items: rows.map((r) => {
            const buyer = r.buyer as { legalName?: string; name?: string; email?: string };
            return {
              id: r.id,
              title: `${r.invoice_number} · ${buyer.legalName ?? buyer.name ?? names.get(r.organization_id) ?? "Church"}`,
              subtitle: `${day(r.issued_at)} · ${r.kind}`,
              badge: inr(r.total),
              tone: r.email_sent_at ? ("good" as const) : ("warn" as const),
              fields: [
                { label: "Church", value: names.get(r.organization_id) ?? "—" },
                { label: "Billing email", value: buyer.email || "—" },
                { label: "Subtotal / GST", value: `${inr(r.subtotal)} / ${inr(Number(r.cgst) + Number(r.sgst) + Number(r.igst))}` },
                { label: "Church emailed", value: r.email_sent_at ? when(r.email_sent_at) : `No${r.email_error ? ` (${r.email_error})` : ""}` },
                { label: "Our copy", value: r.copy_emailed_at ? when(r.copy_emailed_at) : "Not sent" },
              ],
              actions: [{ key: "resend", label: "Send again", confirm: "Email this invoice to the church again?" }],
            };
          }),
        },
      ],
      empty: "No invoices yet.",
    };
  },
  async act(_caller, action, id) {
    if (action !== "resend" || !id) return fail("Unknown action.");
    const { data } = await createAdminClient().from("platform_invoices").select("*").eq("id", id).maybeSingle();
    if (!data) return fail("That invoice could not be found.");
    const result = await emailInvoice(data as PlatformInvoice);
    return result.ok ? ok("Invoice sent.") : fail(result.error ?? "The email wasn't sent.");
  },
};

// ---- Invoice template -------------------------------------------------------------------------------------

const TEXT_FIELDS: [string, string][] = [
  ["companyName", "Company name"],
  ["addressLine1", "Address line 1"],
  ["addressLine2", "Address line 2"],
  ["city", "City"],
  ["state", "State"],
  ["pincode", "Pincode"],
  ["gstin", "GSTIN"],
  ["pan", "PAN"],
  ["email", "Billing email"],
  ["phone", "Phone"],
  ["website", "Website"],
  ["prefix", "Invoice number prefix"],
  ["sacCode", "SAC code"],
  ["bankName", "Bank name"],
  ["accountName", "Account name"],
  ["accountNumber", "Account number"],
  ["ifsc", "IFSC"],
  ["upiId", "UPI id"],
  ["terms", "Terms"],
  ["notes", "Notes"],
  ["footer", "Footer"],
  ["signatureLabel", "Signature label"],
];

const invoiceTemplate: AdminSection = {
  key: "invoice-template",
  scope: "platform",
  title: "Invoice template",
  description: "Company, GST and bank details printed on every invoice",
  icon: "badge",
  async load() {
    const t = (await loadInvoiceTemplate()) as unknown as Record<string, string | boolean | null>;
    const problems = templateProblems(await loadInvoiceTemplate());
    const inputs = (keys: string[]): SectionInput[] =>
      TEXT_FIELDS.filter(([k]) => keys.includes(k)).map(([k, label]) => ({
        key: k,
        label,
        kind: k === "terms" || k === "notes" || k === "footer" ? ("multiline" as const) : ("text" as const),
        initial: String(t[k] ?? ""),
      }));
    return {
      title: "Invoice template",
      note: problems.length > 0 ? `Missing: ${problems.join(", ")}. Invoices issued now will lack these.` : "Copied into every invoice when it is issued, so old invoices never change. The logo and colours are edited on the web dashboard.",
      groups: [
        {
          items: [
            {
              id: "company",
              title: "Company and tax details",
              subtitle: `${t.companyName} · GSTIN ${t.gstin || "not set"}`,
              fields: TEXT_FIELDS.slice(0, 11).map(([k, label]) => ({ label, value: String(t[k] || "—") })),
              actions: [{ key: "save", label: "Edit", inputs: inputs(["companyName", "addressLine1", "addressLine2", "city", "state", "pincode", "gstin", "pan", "email", "phone", "website"]) }],
            },
            {
              id: "numbering",
              title: "Numbering and bank",
              subtitle: `Prefix ${t.prefix} · SAC ${t.sacCode}`,
              fields: TEXT_FIELDS.slice(11, 18).map(([k, label]) => ({ label, value: String(t[k] || "—") })),
              actions: [{ key: "save", label: "Edit", inputs: inputs(["prefix", "sacCode", "bankName", "accountName", "accountNumber", "ifsc", "upiId"]) }],
            },
            {
              id: "text",
              title: "Terms, notes and footer",
              fields: TEXT_FIELDS.slice(18).map(([k, label]) => ({ label, value: String(t[k] || "—") })),
              actions: [{ key: "save", label: "Edit", inputs: inputs(["terms", "notes", "footer", "signatureLabel"]) }],
            },
          ],
        },
      ],
    };
  },
  async act(caller, action, _id, input) {
    if (action !== "save") return fail("Unknown action.");
    const current = await loadInvoiceTemplate();
    const next = normalizeInvoiceTemplate({ ...current, ...input });
    const result = await saveInvoiceTemplate(next);
    if (result.error) return fail(result.error);
    await logPlatformEvent({ level: "info", source: "platform_admin", message: `Platform admin (${caller.email}) edited the invoice template (admin app)` });
    return ok("Saved.");
  },
};

// ---- WhatsApp templates -----------------------------------------------------------------------------------

const whatsappTemplates: AdminSection = {
  key: "whatsapp-templates",
  scope: "platform",
  title: "WhatsApp templates",
  description: "Ready-made messages sent to WhatsApp for review",
  icon: "mark_chat_read",
  async load() {
    const { data } = await createAdminClient().from("platform_whatsapp_templates").select("*");
    const submitted = new Map(((data ?? []) as PlatformWhatsAppTemplate[]).map((r) => [r.catalog_key, r]));
    const missing = PLATFORM_TEMPLATE_CATALOG.filter((t) => !submitted.has(t.key)).length;
    return {
      title: "WhatsApp templates",
      note: "Each template is sent to WhatsApp for review once, from the platform's own account. Once approved it appears for every church on the shared number.",
      summary: [{ label: "Not submitted", value: String(missing) }],
      actions: [{ key: "refresh", label: "Refresh statuses" }],
      groups: [
        {
          items: PLATFORM_TEMPLATE_CATALOG.map((t) => {
            const row = submitted.get(t.key);
            return {
              id: t.key,
              title: t.label,
              subtitle: t.name,
              badge: row ? row.status.replace("_", " ") : "not submitted",
              tone: !row ? undefined : row.status === "approved" ? ("good" as const) : row.status === "pending_review" ? ("warn" as const) : ("bad" as const),
              body: `${t.description}\n\n${t.body}${t.urlButton ? `\n\n[ ${t.urlButton.text} ] button` : ""}${row?.rejected_reason && row.rejected_reason !== "NONE" ? `\n\nRejected: ${row.rejected_reason}` : ""}`,
              actions: row ? undefined : [{ key: "submit", label: "Submit to WhatsApp", confirm: "Send this template to WhatsApp for review? It can't be edited afterwards." }],
            };
          }),
        },
      ],
    };
  },
  async act(_caller, action, id) {
    if (action === "refresh") {
      await refreshPlatformTemplates();
      return ok("Statuses refreshed.");
    }
    if (action === "submit" && id) {
      const result = await submitPlatformTemplate(id);
      return result.error ? fail(result.error) : ok("Submitted for review.");
    }
    return fail("Unknown action.");
  },
};

// ---- Onboarding -------------------------------------------------------------------------------------------

const MULTI = ONBOARDING_MODULES.map((m) => ({ value: m.key, label: m.label }));

function creditInputs(current: Record<string, { count: number; unlimited?: boolean; price: number } | undefined>): SectionInput[] {
  const inputs: SectionInput[] = [];
  for (const type of CREDIT_TYPES) {
    const line = current[type.key];
    const rule = steppedRule(type.key as CreditKey);
    inputs.push({
      key: `count_${type.key}`,
      label: `${type.label} (${type.unit})${rule ? ` — blocks of ${rule.step}, from ${rule.included}` : ""}`,
      kind: "number",
      initial: line && !line.unlimited ? String(line.count) : "",
      placeholder: rule ? String(rule.included) : "leave empty for none",
    });
    if (type.canBeUnlimited)
      inputs.push({
        key: `unl_${type.key}`,
        label: `${type.label}: no limit?`,
        kind: "select",
        initial: line?.unlimited ? "yes" : "no",
        options: [
          { value: "no", label: "No" },
          { value: "yes", label: "Yes, no limit" },
        ],
      });
    if (!rule)
      inputs.push({
        key: `price_${type.key}`,
        label: `${type.label}: price a month before GST (₹)`,
        kind: "number",
        initial: line ? String(line.price) : "",
      });
  }
  return inputs;
}

function creditsFromInput(input: Record<string, string>) {
  const raw: Record<string, unknown> = {};
  for (const type of CREDIT_TYPES) {
    const count = input[`count_${type.key}`];
    const unlimited = input[`unl_${type.key}`] === "yes";
    if (!unlimited && (count === undefined || count.trim() === "")) continue;
    raw[type.key] = {
      count: Number(count),
      unlimited,
      price: Number(input[`price_${type.key}`] ?? 0),
    };
  }
  return cleanCredits(raw);
}

const onboarding: AdminSection = {
  key: "onboarding",
  scope: "platform",
  title: "Onboarding",
  description: "Set up a new tenant: plan, modules, documents, send for payment",
  icon: "how_to_reg",
  async load() {
    const admin = createAdminClient();
    const [{ data: orgs }, { data: rows }, { data: docs }, pricing] = await Promise.all([
      admin.from("organizations").select("id, name, created_at").order("created_at", { ascending: false }).limit(200),
      admin.from("tenant_onboarding").select("organization_id"),
      admin.from("tenant_onboarding_documents").select("*").order("created_at"),
      getModulePricing(),
    ]);
    const prices = Object.fromEntries(Object.entries(pricing).map(([k, v]) => [k, v.monthly_price]));
    const started = new Set((rows ?? []).map((r) => r.organization_id));
    const onboardings = await Promise.all(
      (orgs ?? []).filter((o) => started.has(o.id)).map(async (o) => ({ org: o, ob: await getOnboarding(o.id) })),
    );
    const docsByOrg = new Map<string, NonNullable<typeof docs>>();
    for (const d of docs ?? []) docsByOrg.set(d.organization_id, [...(docsByOrg.get(d.organization_id) ?? []), d]);
    const nameOf = new Map((orgs ?? []).map((o) => [o.id, o.name]));
    const planInput: SectionInput = {
      key: "planType",
      label: "Kind of onboarding",
      kind: "select",
      required: true,
      options: [
        { value: "custom", label: "Custom plan (pick modules and allowances)" },
        { value: "package", label: "Standard plan (documents only)" },
      ],
    };
    return {
      title: "Onboarding",
      note: "Documents are uploaded on the web dashboard; verify them here. A custom plan is sent to the tenant to pay; a standard plan is completed once its documents are verified.",
      groups: [
        {
          title: "In progress",
          items: onboardings.flatMap(({ org, ob }) => {
            if (!ob) return [];
            const quote = quoteFor(ob.modules, prices, ob.credits);
            const myDocs = docsByOrg.get(org.id) ?? [];
            const actions = [];
            if (ob.status === "in_progress") {
              actions.push({ key: "set_type", label: "Change kind", inputs: [{ ...planInput, initial: ob.plan_type }] });
              if (ob.plan_type === "custom") {
                actions.push({
                  key: "save_plan",
                  label: "Modules & allowances",
                  inputs: [
                    { key: "modules", label: "Modules", kind: "multiselect" as const, options: MULTI, initial: ob.modules.join(",") },
                    ...creditInputs(ob.credits as never),
                  ],
                });
                actions.push({ key: "send", label: "Send to tenant", confirm: `Send this plan (${formatRupees(quote.total)} a month incl. GST) to the tenant to pay?` });
              } else {
                actions.push({ key: "complete", label: "Complete onboarding", confirm: "Mark this tenant onboarded?" });
              }
            }
            if (ob.status === "awaiting_payment")
              actions.push({ key: "reopen", label: "Reopen to edit", confirm: "Take this back so it can be changed? The tenant can't pay until it is sent again." });
            return [
              {
                id: org.id,
                title: org.name,
                subtitle: `${ob.plan_type === "custom" ? "Custom plan" : "Standard plan"}${ob.sent_at ? ` · sent ${day(ob.sent_at)}` : ""}`,
                badge: ob.status.replace("_", " "),
                tone: ob.status === "active" ? ("good" as const) : ob.status === "awaiting_payment" ? ("warn" as const) : ("info" as const),
                fields: [
                  ...(ob.plan_type === "custom"
                    ? [
                        { label: "Modules", value: ONBOARDING_MODULES.filter((m) => ob.modules.includes(m.key)).map((m) => m.label).join(", ") || "None yet" },
                        { label: "Allowances", value: CREDIT_TYPES.filter((t) => ob.credits[t.key]).map((t) => creditText(t, ob.credits[t.key]!)).join(" · ") || "Starter's numbers" },
                        { label: "Monthly price", value: `${inr(quote.base)} + GST = ${formatRupees(quote.total)}` },
                        ...(quote.overMandateLimit ? [{ label: "Warning", value: "Over the ₹15,000 UPI Autopay limit" }] : []),
                      ]
                    : []),
                  ...ONBOARDING_DOCS.map((d) => {
                    const mine = myDocs.filter((x) => x.doc_type === d.type);
                    const best = mine.find((x) => x.status === "verified") ?? mine[mine.length - 1];
                    return { label: `${d.label}${d.required ? " *" : ""}`, value: best ? best.status : "not uploaded" };
                  }),
                ],
                actions,
              },
            ];
          }),
        },
        {
          title: "Documents waiting for you",
          items: (docs ?? [])
            .filter((d) => d.status === "uploaded")
            .map((d) => ({
              id: `doc:${d.id}`,
              title: `${docLabel(d.doc_type)} — ${nameOf.get(d.organization_id) ?? "Church"}`,
              subtitle: `${d.file_name} · uploaded ${day(d.created_at)}`,
              badge: "to verify",
              tone: "warn" as const,
              actions: [
                { key: "verify", label: "Verify" },
                { key: "reject", label: "Reject", danger: true, inputs: [{ key: "note", label: "Why", kind: "text" as const }] },
              ],
            })),
        },
        {
          title: "Not started (newest 50)",
          items: (orgs ?? [])
            .filter((o) => !started.has(o.id))
            .slice(0, 50)
            .map((o) => ({
              id: o.id,
              title: o.name,
              subtitle: `Created ${day(o.created_at)}`,
              actions: [{ key: "start", label: "Start onboarding", inputs: [{ ...planInput, initial: "custom" }] }],
            })),
        },
      ].filter((g) => g.items.length > 0),
      empty: "No tenants yet.",
    };
  },
  async act(caller, action, id, input) {
    if (!id) return fail("Unknown tenant.");
    const admin = createAdminClient();
    if (action === "verify" || action === "reject") {
      if (!id.startsWith("doc:")) return fail("Unknown document.");
      const { error } = await admin
        .from("tenant_onboarding_documents")
        .update({
          status: action === "verify" ? "verified" : "rejected",
          note: (input.note ?? "").trim().slice(0, 300),
          verified_at: action === "verify" ? new Date().toISOString() : null,
        })
        .eq("id", id.slice(4));
      return error ? fail("Couldn't update the document.") : ok(action === "verify" ? "Verified." : "Rejected.");
    }
    const { data: org } = await admin.from("organizations").select("id").eq("id", id).maybeSingle();
    if (!org) return fail("That tenant wasn't found.");
    const current = await getOnboarding(id);

    if (action === "start") {
      const planType = input.planType as PlanType;
      if (planType !== "package" && planType !== "custom") return fail("Choose the kind of onboarding.");
      if (current) return ok("Already started.");
      const pricing = await getModulePricing();
      const defaults = planType === "custom" ? ONBOARDING_MODULES.filter((m) => pricing[m.key]?.is_default).map((m) => m.key) : [];
      const { error } = await admin.from("tenant_onboarding").insert({ organization_id: id, plan_type: planType, modules: defaults, started_by: caller.userId });
      return error ? fail("Couldn't start the onboarding.") : ok("Onboarding started.");
    }
    if (!current) return fail("Start the onboarding first.");

    if (action === "set_type") {
      if (current.status !== "in_progress") return fail("Reopen the onboarding to change its kind.");
      const planType = input.planType as PlanType;
      if (planType !== "package" && planType !== "custom") return fail("Choose the kind of onboarding.");
      const pricing = await getModulePricing();
      const modules =
        planType === "custom" && current.modules.length === 0
          ? ONBOARDING_MODULES.filter((m) => pricing[m.key]?.is_default).map((m) => m.key)
          : current.modules;
      const { error } = await admin.from("tenant_onboarding").update({ plan_type: planType, modules, updated_at: new Date().toISOString() }).eq("organization_id", id);
      return error ? fail("Couldn't change it.") : ok("Saved.");
    }
    if (action === "save_plan") {
      if (current.plan_type !== "custom") return fail("This is a standard-plan onboarding.");
      if (current.status !== "in_progress") return fail("This onboarding was already sent. Reopen it to change it.");
      const chosen = (input.modules ?? "").split(",").map((m) => m.trim()).filter(Boolean);
      const modules = ONBOARDING_MODULES.map((m) => m.key).filter((k) => chosen.includes(k));
      const { error } = await admin
        .from("tenant_onboarding")
        .update({ modules, credits: creditsFromInput(input) as never, updated_at: new Date().toISOString() })
        .eq("organization_id", id);
      return error ? fail("Couldn't save.") : ok("Saved.");
    }
    if (action === "complete") {
      if (current.plan_type !== "package") return fail("A custom plan is completed by sending it to the tenant.");
      const docs = await getOnboardingDocuments(id);
      const missing = ONBOARDING_DOCS.filter((d) => d.required && !docs.some((x) => x.doc_type === d.type && x.status === "verified"));
      if (missing.length > 0) return fail(`Verify these documents first: ${missing.map((d) => d.label).join(", ")}.`);
      const now = new Date().toISOString();
      const { error } = await admin.from("tenant_onboarding").update({ status: "active", activated_at: now, updated_at: now }).eq("organization_id", id);
      return error ? fail("Couldn't complete it.") : ok("Onboarding complete.");
    }
    if (action === "send") {
      if (current.status === "active") return fail("This tenant is already onboarded.");
      if (current.modules.length === 0) return fail("Choose at least one module.");
      const docs = await getOnboardingDocuments(id);
      const missing = ONBOARDING_DOCS.filter((d) => d.required && !docs.some((x) => x.doc_type === d.type && x.status === "verified"));
      if (missing.length > 0) return fail(`Verify these documents first: ${missing.map((d) => d.label).join(", ")}.`);
      const pricing = await getModulePricing();
      const prices = Object.fromEntries(Object.entries(pricing).map(([k, v]) => [k, v.monthly_price]));
      const quote = quoteFor(current.modules, prices, current.credits);
      if (quote.base <= 0) return fail("Set a price for the chosen modules first.");
      if (quote.overMandateLimit) return fail("The monthly total is over the UPI Autopay limit of ₹15,000. Remove a module or split the plan.");
      const now = new Date().toISOString();
      const { error } = await admin
        .from("tenant_onboarding")
        .update({ status: "awaiting_payment", monthly_base: quote.base, sent_at: now, updated_at: now })
        .eq("organization_id", id);
      if (error) return fail("Couldn't send this to the tenant.");
      await sendOnboardingReadyEmail(
        id,
        ONBOARDING_MODULES.filter((m) => current.modules.includes(m.key)).map((m) => m.label),
        CREDIT_TYPES.filter((t) => current.credits[t.key]).map((t) => creditText(t, current.credits[t.key]!)),
        quote.total,
        `${getSiteUrl()}/dashboard/billing`,
      );
      return ok("Sent to the tenant.");
    }
    if (action === "reopen") {
      if (current.status !== "awaiting_payment") return fail("Only a sent onboarding can be reopened.");
      const { error } = await admin.from("tenant_onboarding").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("organization_id", id);
      return error ? fail("Couldn't reopen it.") : ok("Reopened.");
    }
    return fail("Unknown action.");
  },
};

// ---- Admin app users (platform owners only) ---------------------------------------------------------------

const SCOPE_OPTIONS = GRANTABLE_SCOPES.map((s) => ({ value: s, label: s }));

const users: AdminSection = {
  key: "users",
  scope: "users",
  title: "Admin app users",
  description: "Who else can sign in to this app, and what they can open",
  icon: "manage_accounts",
  async load() {
    const { data } = await createAdminClient().from("platform_service_users").select("*").order("created_at", { ascending: false });
    return {
      title: "Admin app users",
      note: "Platform owners (the PLATFORM_ADMIN_EMAILS list) always see everything. A service user sees only the sections you give them. Adding someone emails them an invite to set a password.",
      actions: [
        {
          key: "add",
          label: "Add a user",
          inputs: [
            { key: "email", label: "Email", kind: "text", required: true },
            { key: "name", label: "Name", kind: "text" },
            { key: "scopes", label: "Can open", kind: "multiselect", options: SCOPE_OPTIONS, required: true },
          ],
        },
      ],
      groups: [
        {
          items: (data ?? []).map((u) => ({
            id: u.auth_user_id,
            title: u.display_name || u.email,
            subtitle: u.email,
            badge: u.active ? "active" : "turned off",
            tone: u.active ? ("good" as const) : ("bad" as const),
            fields: [
              { label: "Can open", value: cleanScopes(u.scopes).join(", ") || "Nothing" },
              { label: "Added", value: `${day(u.created_at)}${u.created_by ? ` by ${u.created_by}` : ""}` },
            ],
            actions: [
              { key: "scopes", label: "Change access", inputs: [{ key: "scopes", label: "Can open", kind: "multiselect" as const, options: SCOPE_OPTIONS, initial: cleanScopes(u.scopes).join(",") }] },
              u.active
                ? { key: "off", label: "Turn off", danger: true, confirm: "This person can no longer use the app." }
                : { key: "on", label: "Turn on" },
              { key: "remove", label: "Remove", danger: true, confirm: "Remove this person from the app? Their login itself is not deleted." },
            ],
          })),
        },
      ],
      empty: "No other users yet.",
    };
  },
  async act(caller, action, id, input) {
    if (caller.role !== "owner") return fail("Only a platform owner can manage users.");
    const admin = createAdminClient();
    const clean = (value: string | undefined) => cleanScopes((value ?? "").split(",").map((s) => s.trim())).filter((s) => s !== "users");
    if (action === "add") {
      const email = (input.email ?? "").trim().toLowerCase();
      const scopes = clean(input.scopes);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter a valid email.");
      if (scopes.length === 0) return fail("Choose at least one section.");
      // An existing login is reused; otherwise they are invited by email to set a password.
      let userId: string | null = null;
      for (let page = 1; page <= 5 && !userId; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        userId = data?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
        if (!data || data.users.length < 1000) break;
      }
      if (!userId) {
        const invited = await admin.auth.admin.inviteUserByEmail(email);
        if (invited.error || !invited.data.user) return fail("Couldn't invite that email. Check it and try again.");
        userId = invited.data.user.id;
      }
      const { error } = await admin.from("platform_service_users").upsert(
        { auth_user_id: userId, email, display_name: (input.name ?? "").trim() || null, scopes, active: true, created_by: caller.email },
        { onConflict: "auth_user_id" },
      );
      if (error) return fail("Couldn't save that user.");
      await logPlatformEvent({ level: "warning", source: "platform_admin", message: `Platform admin (${caller.email}) gave ${email} admin-app access: ${scopes.join(", ")}` });
      return ok("User added.");
    }
    if (!id) return fail("Unknown user.");
    if (action === "scopes") {
      const scopes = clean(input.scopes);
      const { error } = await admin.from("platform_service_users").update({ scopes }).eq("auth_user_id", id);
      return error ? fail("Couldn't save.") : ok("Saved.");
    }
    if (action === "on" || action === "off") {
      const { error } = await admin.from("platform_service_users").update({ active: action === "on" }).eq("auth_user_id", id);
      return error ? fail("Couldn't save.") : ok("Saved.");
    }
    if (action === "remove") {
      const { error } = await admin.from("platform_service_users").delete().eq("auth_user_id", id);
      return error ? fail("Couldn't remove.") : ok("Removed.");
    }
    return fail("Unknown action.");
  },
};

export const manageSections = [invoices, invoiceTemplate, whatsappTemplates, onboarding, users];
