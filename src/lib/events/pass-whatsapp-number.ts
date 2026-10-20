import type { EventRegistrationField } from "@/types/database";

// Which of a registrant's numbers to send their WhatsApp pass to. A form
// can have several phone fields (a "Phone" and a "Whatsapp Number"); one
// whose key or label says WhatsApp wins, then any other phone field, then
// the number stored on the registration itself.
export function pickWhatsAppNumber(
  answers: Record<string, unknown>,
  fields: EventRegistrationField[],
  storedPhone?: string | null,
): string | null {
  const phoneFields = fields.filter((f) => f.field_type === "phone");
  const valueOf = (key: string) => {
    const v = answers[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const whatsapp = phoneFields.find(
    (f) => /whats\s*app/i.test(`${f.key} ${f.label}`) && valueOf(f.key),
  );
  if (whatsapp) return valueOf(whatsapp.key);

  for (const field of phoneFields) {
    const value = valueOf(field.key);
    if (value) return value;
  }
  return storedPhone?.trim() || null;
}
