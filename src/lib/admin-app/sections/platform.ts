import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAllFeatureFlags } from "@/lib/platform-admin/feature-flags";
import {
  FEATURE_STATUSES,
  FEATURE_STATUS_HELP,
  FEATURE_STATUS_LABELS,
  defaultStatusFor,
  isFeatureStatus,
  nextNewUntil,
  type FeatureStatus,
} from "@/lib/platform-admin/feature-status";
import { TAB_KEYS, TAB_LABELS, type TabKey } from "@/lib/permissions/tabs";
import { ONBOARDING_MODULES, isModuleKey } from "@/lib/onboarding/config";
import { getModulePricing } from "@/lib/onboarding/store";
import { logPlatformEvent } from "@/lib/platform-events/log";
import { fail, inr, ok, when, type AdminSection } from "./common";

const TONES: Record<FeatureStatus, "good" | "warn" | "bad" | "info"> = {
  live: "good",
  beta: "info",
  testing: "warn",
  off: "bad",
};

const features: AdminSection = {
  key: "features",
  scope: "platform",
  title: "Feature flags",
  description: "Switch a module off, testing, beta or live for every church",
  icon: "toggle_on",
  async load() {
    const flags = await getAllFeatureFlags();
    return {
      title: "Feature flags",
      note: "Off hides a module from everyone. Testing is for testers only. Beta and Live show it to all churches; Beta carries a tag.",
      summary: FEATURE_STATUSES.map((s) => ({
        label: FEATURE_STATUS_LABELS[s],
        value: String(flags.filter((f) => f.status === s).length),
      })),
      groups: [
        {
          items: flags.map((f) => ({
            id: f.tab,
            title: TAB_LABELS[f.tab] ?? f.tab,
            badge: FEATURE_STATUS_LABELS[f.status],
            tone: TONES[f.status],
            subtitle: f.updatedAt ? `Changed ${when(f.updatedAt)}` : undefined,
            body: FEATURE_STATUS_HELP[f.status],
            actions: [
              {
                key: "set",
                label: "Change status",
                inputs: [
                  {
                    key: "status",
                    label: "Status",
                    kind: "select" as const,
                    required: true,
                    initial: f.status,
                    options: FEATURE_STATUSES.map((s) => ({
                      value: s,
                      label: FEATURE_STATUS_LABELS[s],
                    })),
                  },
                ],
              },
            ],
          })),
        },
      ],
    };
  },
  async act(caller, action, id, input) {
    if (action !== "set" || !id) return fail("Unknown action.");
    const tabKey = id as TabKey;
    const status = input.status;
    if (!(TAB_KEYS as readonly string[]).includes(tabKey) || !isFeatureStatus(status))
      return fail("Choose a valid status.");
    const admin = createAdminClient();
    const { data: current } = await admin
      .from("platform_feature_flags")
      .select("status, enabled, new_until")
      .eq("tab_key", tabKey)
      .maybeSingle();
    const from: FeatureStatus = !current
      ? defaultStatusFor(tabKey)
      : !current.enabled
        ? "off"
        : isFeatureStatus(current.status)
          ? current.status
          : "live";
    const now = new Date();
    const { error } = await admin.from("platform_feature_flags").upsert(
      {
        tab_key: tabKey,
        status,
        enabled: status !== "off",
        new_until: nextNewUntil(from, status, current?.new_until ?? null, now),
        updated_by: caller.userId,
        updated_at: now.toISOString(),
      },
      { onConflict: "tab_key" },
    );
    if (error) return fail("Couldn't save that.");
    await logPlatformEvent({
      level: status === "off" ? "warning" : "info",
      source: "platform_admin",
      message: `Platform admin (${caller.email}) set "${TAB_LABELS[tabKey]}" to ${FEATURE_STATUS_LABELS[status]} (was ${FEATURE_STATUS_LABELS[from]}) (admin app)`,
      metadata: { tabKey, from, status },
    });
    return ok("Saved.");
  },
};

const modules: AdminSection = {
  key: "modules",
  scope: "platform",
  title: "Modules & pricing",
  description: "Monthly price per module and which start ticked in onboarding",
  icon: "sell",
  async load() {
    const pricing = await getModulePricing();
    return {
      title: "Modules & pricing",
      note: "Prices are per month before 18% GST and apply to onboardings you send from now on. The PDF price sheet is on the web dashboard.",
      groups: [
        {
          items: ONBOARDING_MODULES.map((m) => {
            const p = pricing[m.key];
            return {
              id: m.key,
              title: m.label,
              badge: p ? inr(p.monthly_price) : "no price",
              subtitle: p?.is_default ? "Ticked by default" : "Not ticked by default",
              actions: [
                {
                  key: "save",
                  label: "Edit price",
                  inputs: [
                    {
                      key: "price",
                      label: "Monthly price (₹)",
                      kind: "number" as const,
                      required: true,
                      initial: String(p?.monthly_price ?? 0),
                    },
                    {
                      key: "isDefault",
                      label: "Ticked by default in onboarding",
                      kind: "select" as const,
                      initial: p?.is_default ? "yes" : "no",
                      options: [
                        { value: "yes", label: "Yes" },
                        { value: "no", label: "No" },
                      ],
                    },
                  ],
                },
              ],
            };
          }),
        },
      ],
    };
  },
  async act(caller, action, id, input) {
    if (action !== "save" || !id) return fail("Unknown action.");
    if (!isModuleKey(id)) return fail("Unknown module.");
    const price = Number(input.price);
    if (!input.price?.trim() || !Number.isFinite(price) || price < 0 || price > 1_000_000)
      return fail("Prices must be between 0 and 10,00,000.");
    const { error } = await createAdminClient().from("module_pricing").upsert(
      {
        module_key: id,
        monthly_price: Math.round(price * 100) / 100,
        is_default: input.isDefault === "yes",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "module_key" },
    );
    if (error) return fail("Couldn't save. Please try again.");
    await logPlatformEvent({
      level: "info",
      source: "platform_admin",
      message: `Platform admin (${caller.email}) set the ${id} module price to ${price} (admin app)`,
    });
    return ok("Saved.");
  },
};

export const platformSections = [features, modules];
