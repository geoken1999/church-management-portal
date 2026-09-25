"use client";

import { useActionState, useEffect, useState } from "react";
import { X, Send, CheckCircle2 } from "lucide-react";
import { submitWidgetResponse, type PublicWidgetState } from "@/lib/widget/public-actions";
import type { FormField, WidgetPosition } from "@/types/database";

const initialState: PublicWidgetState = {};

// Sent to the parent page (via the loader script) so it can resize the
// fixed-position iframe it created — a cross-origin iframe can never
// overflow its own box, so the only way for a small bubble to expand into
// a full panel is for the PARENT to grow the iframe element itself.
const COLLAPSED_SIZE = { width: 76, height: 76 };
const EXPANDED_SIZE = { width: 380, height: 600 };

function postResize(open: boolean, position: WidgetPosition) {
  const size = open ? EXPANDED_SIZE : COLLAPSED_SIZE;
  window.parent.postMessage({ type: "kf-widget-resize", open, position, ...size }, "*");
}

function FieldInput({ field }: { field: FormField }) {
  const id = `kf-field-${field.key}`;

  if (field.field_type === "checkbox") {
    return (
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" name={field.key} required={field.required} className="mt-0.5" />
        <span>
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </span>
      </label>
    );
  }

  if (field.field_type === "select") {
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="text-xs font-medium text-neutral-700">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </label>
        <select id={id} name={field.key} className="w-full rounded-lg border border-neutral-300 px-2.5 py-2 text-sm">
          <option value="">Select an option</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.field_type === "textarea") {
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="text-xs font-medium text-neutral-700">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </label>
        <textarea id={id} name={field.key} required={field.required} rows={3} className="w-full rounded-lg border border-neutral-300 px-2.5 py-2 text-sm" />
      </div>
    );
  }

  const inputType =
    field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : field.field_type === "email" ? "email" : field.field_type === "phone" ? "tel" : "text";

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-neutral-700">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      <input id={id} name={field.key} type={inputType} required={field.required} className="w-full rounded-lg border border-neutral-300 px-2.5 py-2 text-sm" />
    </div>
  );
}

export function EmbeddableWidget({
  token,
  primaryColor,
  position,
  buttonLabel,
  greetingTitle,
  greetingMessage,
  fields,
}: {
  token: string;
  primaryColor: string;
  position: WidgetPosition;
  buttonLabel: string;
  greetingTitle: string;
  greetingMessage: string;
  fields: FormField[];
}) {
  const [open, setOpen] = useState(false);
  // The iframe's own document.referrer is the embedding page's URL — works
  // cross-origin because it's set by the browser at navigation time, not
  // read from the parent's window object. Read lazily (not in an effect)
  // since it's available synchronously once this client component mounts.
  const [pageUrl] = useState(() => (typeof document !== "undefined" ? document.referrer || "" : ""));
  const submitWithToken = submitWidgetResponse.bind(null, token);
  const [state, formAction, pending] = useActionState(submitWithToken, initialState);

  useEffect(() => {
    postResize(open, position);
  }, [open, position]);

  const align = position === "bottom-left" ? "items-start" : "items-end";
  const checkboxKeys = fields.filter((f) => f.field_type === "checkbox").map((f) => f.key);

  return (
    <div className={`flex h-screen w-screen flex-col justify-end ${align}`}>
      {open && (
        <div className="mb-2 flex max-h-[560px] w-[344px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
          <div className="flex items-start justify-between gap-2 px-4 py-3.5 text-white" style={{ backgroundColor: primaryColor }}>
            <p className="text-sm font-semibold">{greetingTitle}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="shrink-0 opacity-90 hover:opacity-100">
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {state.success ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="size-9" style={{ color: primaryColor }} />
                <p className="text-sm font-semibold text-neutral-900">Thanks for reaching out!</p>
                <p className="text-xs text-neutral-500">We&apos;ll get back to you soon.</p>
              </div>
            ) : (
              <form action={formAction} className="space-y-3">
                <input type="hidden" name="__fieldKeys" value={fields.map((f) => f.key).join(",")} />
                <input type="hidden" name="__checkboxKeys" value={checkboxKeys.join(",")} />
                <input type="hidden" name="__pageUrl" value={pageUrl} />
                <p className="text-xs text-neutral-500">{greetingMessage}</p>
                {state.error && <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-600">{state.error}</p>}
                {fields.map((field) => (
                  <FieldInput key={field.key} field={field} />
                ))}
                <button
                  type="submit"
                  disabled={pending}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {pending ? "Sending..." : "Send"}
                  {!pending && <Send className="size-3.5" />}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : buttonLabel}
        className="flex size-[60px] items-center justify-center rounded-full text-white shadow-xl transition-transform hover:scale-105"
        style={{ backgroundColor: primaryColor }}
      >
        {open ? <X className="size-6" /> : <Send className="size-6" />}
      </button>
    </div>
  );
}
