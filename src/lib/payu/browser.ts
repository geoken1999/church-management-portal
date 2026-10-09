// Browser-side helper shared by every PayU checkout trigger. PayU has no
// JS SDK to open in place — paying means the whole page navigates to
// PayU's hosted checkout, which later redirects back to this app's own
// PayU return route. This builds that one-time form in the DOM and submits
// it, rather than keeping it in React state, since nothing about it needs
// to react to further renders — it exists only to trigger one navigation.
// No "server-only" import here: this file is bundled for the browser.

import type { PayUFormFields } from "@/lib/payu/client";

export function redirectToPayU(actionUrl: string, fields: PayUFormFields) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = actionUrl;
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
